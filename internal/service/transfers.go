package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"zenterm/internal/model"
)

// sftpDialCall 表示一次进行中的 SFTP 拨号；首个发起者负责发布结果，其它并发等待者通过 done 信号读取共享结果 / represents an in-flight SFTP dial; the first caller publishes the result, concurrent waiters read it through the done signal.
type sftpDialCall struct {
	done       chan struct{}
	once       sync.Once
	generation uint64
	cancel     context.CancelFunc
	cancelErr  error
	cancelled  bool

	conn *managedSFTPConnection
	err  error
}

// UploadFile 将本地文件上传到远端目录，可按需覆盖同名文件 / uploads a local file into the selected remote directory and can overwrite an existing file when requested.
func (s *Service) UploadFile(hostID, localPath, remoteDir string, overwrite bool) (model.FileTransferResult, error) {
	var result model.FileTransferResult

	resolvedLocalPath, _, err := resolveExistingLocalFile(localPath)
	if err != nil {
		return model.FileTransferResult{}, err
	}

	err = s.withReusableSFTPClient(hostID, func(client sftpClient, remoteAddr string) error {
		resolvedRemoteDir, remoteDirInfo, err := resolveExistingRemoteDirectory(client, remoteDir)
		if err != nil {
			return fmt.Errorf("resolve remote directory for %s: %w", remoteAddr, err)
		}
		if !remoteDirInfo.IsDir() {
			return ErrTransferTargetNotDirectory
		}

		targetPath := pathpkg.Join(resolvedRemoteDir, filepath.Base(resolvedLocalPath))
		if info, err := client.Stat(targetPath); err == nil {
			if info.IsDir() || !overwrite {
				return ErrTransferTargetExists
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("stat remote target: %w", err)
		}

		sourceFile, err := os.Open(resolvedLocalPath)
		if err != nil {
			return fmt.Errorf("open local file: %w", err)
		}
		defer func() { _ = sourceFile.Close() }()

		tempPath, err := remoteTransferTempPath(targetPath)
		if err != nil {
			return err
		}
		tempFile, err := client.Create(tempPath)
		if err != nil {
			return fmt.Errorf("create remote temp file: %w", err)
		}

		written, copyErr := io.Copy(tempFile, sourceFile)
		closeErr := tempFile.Close()
		if copyErr != nil {
			_ = client.Remove(tempPath)
			return fmt.Errorf("upload file content: %w", copyErr)
		}
		if closeErr != nil {
			_ = client.Remove(tempPath)
			return fmt.Errorf("close remote temp file: %w", closeErr)
		}
		if err := commitRemoteTransferTemp(client, tempPath, targetPath, overwrite); err != nil {
			_ = client.Remove(tempPath)
			return err
		}

		result = model.FileTransferResult{
			SourcePath:  resolvedLocalPath,
			TargetPath:  targetPath,
			BytesCopied: written,
		}

		return nil
	})
	if err != nil {
		return model.FileTransferResult{}, err
	}

	return result, nil
}

// DownloadFile 将远端文件下载到本地目录，可按需覆盖同名文件 / downloads a remote file into the selected local directory and can overwrite an existing file when requested.
func (s *Service) DownloadFile(hostID, remotePath, localDir string, overwrite bool) (model.FileTransferResult, error) {
	var result model.FileTransferResult

	resolvedLocalDir, err := resolveExistingLocalDirectory(localDir)
	if err != nil {
		return model.FileTransferResult{}, err
	}

	err = s.withReusableSFTPClient(hostID, func(client sftpClient, remoteAddr string) error {
		resolvedRemotePath, remoteInfo, err := resolveExistingRemoteFile(client, remotePath)
		if err != nil {
			return fmt.Errorf("resolve remote file for %s: %w", remoteAddr, err)
		}

		targetPath := filepath.Join(resolvedLocalDir, filepath.Base(resolvedRemotePath))
		if info, err := os.Stat(targetPath); err == nil {
			if info.IsDir() || !overwrite {
				return ErrTransferTargetExists
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("stat local target: %w", err)
		}

		sourceFile, err := client.Open(resolvedRemotePath)
		if err != nil {
			return fmt.Errorf("open remote file: %w", err)
		}
		defer func() { _ = sourceFile.Close() }()

		mode := remoteInfo.Mode().Perm()
		if mode == 0 {
			mode = 0o644
		}

		tempPath, err := localTransferTempPath(targetPath)
		if err != nil {
			return err
		}
		tempFile, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, mode)
		if err != nil {
			return fmt.Errorf("create local temp file: %w", err)
		}

		written, copyErr := io.Copy(tempFile, sourceFile)
		closeErr := tempFile.Close()
		if copyErr != nil {
			_ = os.Remove(tempPath)
			return fmt.Errorf("download file content: %w", copyErr)
		}
		if closeErr != nil {
			_ = os.Remove(tempPath)
			return fmt.Errorf("close local temp file: %w", closeErr)
		}
		if err := commitLocalTransferTemp(tempPath, targetPath, overwrite); err != nil {
			_ = os.Remove(tempPath)
			return err
		}

		result = model.FileTransferResult{
			SourcePath:  resolvedRemotePath,
			TargetPath:  targetPath,
			BytesCopied: written,
		}

		return nil
	})
	if err != nil {
		return model.FileTransferResult{}, err
	}

	return result, nil
}

// CancelFileTransfer 取消指定主机的拨号并关闭复用 SFTP 连接，使正在进行的文件读写尽快返回。
func (s *Service) CancelFileTransfer(hostID string) error {
	hostID = strings.TrimSpace(hostID)
	if hostID == "" {
		return ErrHostIDRequired
	}

	s.sftpMu.Lock()
	call := s.sftpInFlight[hostID]
	conn := s.sftpConnections[hostID]
	if call != nil {
		call.cancelled = true
		call.cancelErr = context.Canceled
	}
	if conn != nil {
		delete(s.sftpConnections, hostID)
	}
	s.sftpMu.Unlock()

	if call != nil && call.cancel != nil {
		call.cancel()
	}
	if conn != nil {
		return conn.close()
	}
	return nil
}

func remoteTransferTempPath(targetPath string) (string, error) {
	id, err := newSessionID()
	if err != nil {
		return "", fmt.Errorf("create remote temp name: %w", err)
	}
	return pathpkg.Join(pathpkg.Dir(targetPath), "."+pathpkg.Base(targetPath)+".zenterm-"+id+".tmp"), nil
}

func commitRemoteTransferTemp(client sftpClient, tempPath, targetPath string, overwrite bool) error {
	if !overwrite {
		if err := client.Rename(tempPath, targetPath); err != nil {
			return fmt.Errorf("commit remote file: %w", err)
		}
		return nil
	}

	if err := client.PosixRename(tempPath, targetPath); err == nil {
		return nil
	} else {
		posixErr := err
		if err := client.Rename(tempPath, targetPath); err == nil {
			return nil
		} else {
			renameErr := err
			if removeErr := client.Remove(targetPath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
				return fmt.Errorf("replace remote target: %w", errors.Join(posixErr, renameErr, removeErr))
			}
			if retryErr := client.Rename(tempPath, targetPath); retryErr != nil {
				return fmt.Errorf("commit remote file after replace: %w", errors.Join(posixErr, renameErr, retryErr))
			}
			return nil
		}
	}
}

func localTransferTempPath(targetPath string) (string, error) {
	id, err := newSessionID()
	if err != nil {
		return "", fmt.Errorf("create local temp name: %w", err)
	}
	return filepath.Join(filepath.Dir(targetPath), "."+filepath.Base(targetPath)+".zenterm-"+id+".tmp"), nil
}

func commitLocalTransferTemp(tempPath, targetPath string, overwrite bool) error {
	if err := os.Rename(tempPath, targetPath); err != nil {
		if !overwrite || runtime.GOOS != "windows" {
			return fmt.Errorf("commit local file: %w", err)
		}
		// Windows 的 os.Rename 不能覆盖已存在文件；临时文件已完整写入后再退化为 remove+rename / on Windows os.Rename cannot replace an existing file; after the temp file is complete, fall back to remove+rename.
		if removeErr := os.Remove(targetPath); removeErr != nil {
			return fmt.Errorf("replace local target: %w", removeErr)
		}
		if retryErr := os.Rename(tempPath, targetPath); retryErr != nil {
			return fmt.Errorf("commit local file after replace: %w", retryErr)
		}
	}
	return nil
}

func (s *Service) withReusableSFTPClient(hostID string, run func(client sftpClient, remoteAddr string) error) error {
	conn, err := s.getOrCreateSFTPConnection(hostID)
	if err != nil {
		return err
	}

	sftpConn, err := conn.client.NewSFTPClient()
	if err != nil {
		_ = s.closeSFTPConnection(hostID)
		return fmt.Errorf("create sftp client: %w", err)
	}
	defer func() { _ = sftpConn.Close() }()

	return run(sftpConn, conn.remoteAddr)
}

func (s *Service) getOrCreateSFTPConnection(hostID string) (*managedSFTPConnection, error) {
	s.sftpMu.Lock()
	if conn, ok := s.sftpConnections[hostID]; ok {
		s.sftpMu.Unlock()
		return conn, nil
	}
	// 已有同一 hostID 的拨号在飞行中：排队等待结果，避免并发触发多次完整 SSH 握手 / another goroutine is already dialing for this host; wait for its result instead of starting a second handshake.
	if call, ok := s.sftpInFlight[hostID]; ok {
		s.sftpMu.Unlock()
		<-call.done
		if call.err != nil {
			return nil, call.err
		}
		return call.conn, nil
	}
	// 注册自己作为这次拨号的发布者，并记录当前连接池代际；CloseAll 会推进代际，让旧拨号成功后也不能回写缓存 / register ourselves as the publisher of this dial and remember the pool generation; CloseAll advances it so old dials cannot populate the cache after shutdown.
	generation := s.sftpGeneration
	dialCtx, dialCancel := context.WithCancel(context.Background())
	call := &sftpDialCall{done: make(chan struct{}), generation: generation, cancel: dialCancel}
	s.sftpInFlight[hostID] = call
	s.sftpMu.Unlock()

	conn, err := s.dialSFTPConnection(dialCtx, hostID)
	dialCancel()
	if err != nil {
		s.finishSFTPDial(hostID, call, nil, err)
		<-call.done
		return nil, call.err
	}
	s.finishSFTPDial(hostID, call, conn, nil)
	<-call.done
	if call.err != nil {
		return nil, call.err
	}
	return call.conn, nil
}

// dialSFTPConnection 执行实际的 SFTP 拨号；调用方负责去重 / performs the actual SFTP dial; the caller handles dedup.
func (s *Service) dialSFTPConnection(ctx context.Context, hostID string) (*managedSFTPConnection, error) {
	host, err := s.store.GetHost(hostID)
	if err != nil {
		return nil, err
	}

	identity, err := s.store.GetIdentity(hostID, s.vault)
	if err != nil {
		return nil, err
	}

	config, err := s.newClientConfigContext(ctx, host, identity)
	if err != nil {
		return nil, err
	}

	client, remoteAddr, err := s.openSSHClientContext(ctx, host, config)
	if err != nil {
		return nil, err
	}

	conn := &managedSFTPConnection{
		hostID:     hostID,
		remoteAddr: remoteAddr,
		client:     client,
	}

	return conn, nil
}

// finishSFTPDial 写入共享结果并广播完成信号，让所有等待者同时释放 / stores the shared result and closes the done signal so all waiters release at once.
func (s *Service) finishSFTPDial(hostID string, call *sftpDialCall, conn *managedSFTPConnection, err error) {
	var toClose []*managedSFTPConnection
	s.sftpMu.Lock()
	if call.cancelled {
		if err == nil {
			err = call.cancelErr
			if err == nil {
				err = context.Canceled
			}
		}
	} else if generation := call.generation; generation != s.sftpGeneration {
		if err == nil {
			err = ErrSFTPConnectionClosed
		}
	}
	if err == nil && conn != nil {
		if existing, ok := s.sftpConnections[hostID]; ok {
			toClose = append(toClose, conn)
			conn = existing
		} else {
			conn.stopKeepAlive = s.startKeepAliveLoop(conn.client)
			s.sftpConnections[hostID] = conn
		}
	}
	if err != nil && conn != nil {
		toClose = append(toClose, conn)
		conn = nil
	}
	if current, ok := s.sftpInFlight[hostID]; ok && current == call {
		delete(s.sftpInFlight, hostID)
	}
	for _, stale := range toClose {
		_ = stale.close()
	}
	call.once.Do(func() {
		call.conn = conn
		call.err = err
		close(call.done)
	})
	s.sftpMu.Unlock()
}

func (s *Service) closeSFTPConnection(hostID string) error {
	s.sftpMu.Lock()
	conn, ok := s.sftpConnections[hostID]
	if ok {
		delete(s.sftpConnections, hostID)
	}
	s.sftpMu.Unlock()

	if !ok {
		return nil
	}

	return conn.close()
}

func (s *Service) closeAllSFTPConnections() error {
	s.sftpMu.Lock()
	s.sftpGeneration++
	connections := make([]*managedSFTPConnection, 0, len(s.sftpConnections))
	for hostID, conn := range s.sftpConnections {
		delete(s.sftpConnections, hostID)
		connections = append(connections, conn)
	}
	inFlight := make(map[string]*sftpDialCall, len(s.sftpInFlight))
	for hostID, call := range s.sftpInFlight {
		inFlight[hostID] = call
	}
	s.sftpMu.Unlock()

	// 聚合所有连接的关闭错误，与 CloseAll 的错误聚合策略保持一致 / collect every connection's close error to match CloseAll's aggregation policy.
	var errs []error
	for _, conn := range connections {
		if err := conn.close(); err != nil {
			errs = append(errs, err)
		}
	}
	for _, call := range inFlight {
		s.sftpMu.Lock()
		if !call.cancelled {
			call.cancelled = true
			call.cancelErr = ErrSFTPConnectionClosed
		}
		s.sftpMu.Unlock()
		if call.cancel != nil {
			call.cancel()
		}
	}
	for hostID, call := range inFlight {
		<-call.done
		if call.conn == nil {
			continue
		}
		s.sftpMu.Lock()
		if s.sftpConnections[hostID] == call.conn {
			delete(s.sftpConnections, hostID)
		}
		s.sftpMu.Unlock()
		if err := call.conn.close(); err != nil {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

func (m *managedSFTPConnection) close() error {
	var closeErr error

	m.closeOnce.Do(func() {
		if m.stopKeepAlive != nil {
			m.stopKeepAlive()
		}
		if m.client != nil {
			if err := m.client.Close(); err != nil && closeErr == nil {
				closeErr = fmt.Errorf("close sftp ssh client: %w", err)
			}
		}
	})

	return closeErr
}

func resolveExistingLocalFile(targetPath string) (string, os.FileInfo, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", nil, ErrTransferSourceRequired
	}

	resolvedPath, err := resolveLocalPath(trimmed)
	if err != nil {
		return "", nil, err
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", nil, fmt.Errorf("stat local source: %w", err)
	}
	if info.IsDir() {
		return "", nil, ErrTransferSourceNotFile
	}

	return resolvedPath, info, nil
}

func resolveExistingLocalDirectory(targetPath string) (string, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", ErrTransferTargetRequired
	}

	resolvedPath, err := resolveLocalPath(trimmed)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", fmt.Errorf("stat local target directory: %w", err)
	}
	if !info.IsDir() {
		return "", ErrTransferTargetNotDirectory
	}

	return resolvedPath, nil
}

func resolveExistingRemoteDirectory(client sftpClient, targetPath string) (string, os.FileInfo, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", nil, ErrTransferTargetRequired
	}

	resolvedPath, err := resolveRemotePath(client, trimmed)
	if err != nil {
		return "", nil, err
	}

	info, err := client.Stat(resolvedPath)
	if err != nil {
		return "", nil, err
	}
	if !info.IsDir() {
		return "", nil, ErrTransferTargetNotDirectory
	}

	return resolvedPath, info, nil
}

func resolveExistingRemoteFile(client sftpClient, targetPath string) (string, os.FileInfo, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", nil, ErrTransferSourceRequired
	}

	resolvedPath, err := resolveRemotePath(client, trimmed)
	if err != nil {
		return "", nil, err
	}

	info, err := client.Stat(resolvedPath)
	if err != nil {
		return "", nil, err
	}
	if info.IsDir() {
		return "", nil, ErrTransferSourceNotFile
	}

	return resolvedPath, info, nil
}
