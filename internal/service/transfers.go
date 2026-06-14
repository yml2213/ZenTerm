package service

import (
	"errors"
	"fmt"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
	"sync"

	"zenterm/internal/model"
)

// sftpDialCall 表示一次进行中的 SFTP 拨号；首个发起者负责发布结果，其它并发等待者通过 done 信号读取共享结果 / represents an in-flight SFTP dial; the first caller publishes the result, concurrent waiters read it through the done signal.
type sftpDialCall struct {
	done chan struct{}
	once sync.Once

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

		targetFile, err := client.Create(targetPath)
		if err != nil {
			return fmt.Errorf("create remote file: %w", err)
		}
		defer func() { _ = targetFile.Close() }()

		written, err := io.Copy(targetFile, sourceFile)
		if err != nil {
			return fmt.Errorf("upload file content: %w", err)
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

		targetFlags := os.O_CREATE | os.O_WRONLY
		if overwrite {
			targetFlags |= os.O_TRUNC
		} else {
			targetFlags |= os.O_EXCL
		}

		targetFile, err := os.OpenFile(targetPath, targetFlags, mode)
		if err != nil {
			return fmt.Errorf("create local file: %w", err)
		}
		defer func() { _ = targetFile.Close() }()

		written, err := io.Copy(targetFile, sourceFile)
		if err != nil {
			return fmt.Errorf("download file content: %w", err)
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
	// 注册自己作为这次拨号的发布者 / register ourselves as the publisher of this dial.
	call := &sftpDialCall{done: make(chan struct{})}
	s.sftpInFlight[hostID] = call
	s.sftpMu.Unlock()

	conn, err := s.dialSFTPConnection(hostID)
	if err != nil {
		s.finishSFTPDial(hostID, call, nil, err)
		return nil, err
	}
	s.finishSFTPDial(hostID, call, conn, nil)
	return conn, nil
}

// dialSFTPConnection 执行实际的 SFTP 拨号；调用方负责去重 / performs the actual SFTP dial; the caller handles dedup.
func (s *Service) dialSFTPConnection(hostID string) (*managedSFTPConnection, error) {
	host, err := s.store.GetHost(hostID)
	if err != nil {
		return nil, err
	}

	identity, err := s.store.GetIdentity(hostID, s.vault)
	if err != nil {
		return nil, err
	}

	config, err := s.newClientConfig(host, identity)
	if err != nil {
		return nil, err
	}

	client, remoteAddr, err := s.openSSHClient(host, config)
	if err != nil {
		return nil, err
	}

	conn := &managedSFTPConnection{
		hostID:     hostID,
		remoteAddr: remoteAddr,
		client:     client,
	}

	s.sftpMu.Lock()
	// 二次检查：若在此期间有别的拨号已经成功写入缓存，丢弃自己新建的连接 / double-check: if another dial won the race while we held no lock, discard our fresh connection.
	if existing, ok := s.sftpConnections[hostID]; ok {
		s.sftpMu.Unlock()
		_ = conn.close()
		return existing, nil
	}
	conn.stopKeepAlive = s.startKeepAliveLoop(client)
	s.sftpConnections[hostID] = conn
	s.sftpMu.Unlock()

	return conn, nil
}

// finishSFTPDial 写入共享结果并广播完成信号，让所有等待者同时释放 / stores the shared result and closes the done signal so all waiters release at once.
func (s *Service) finishSFTPDial(hostID string, call *sftpDialCall, conn *managedSFTPConnection, err error) {
	call.once.Do(func() {
		call.conn = conn
		call.err = err
		close(call.done)
	})
	s.sftpMu.Lock()
	delete(s.sftpInFlight, hostID)
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
	connections := make([]*managedSFTPConnection, 0, len(s.sftpConnections))
	for hostID, conn := range s.sftpConnections {
		delete(s.sftpConnections, hostID)
		connections = append(connections, conn)
	}
	s.sftpMu.Unlock()

	// 聚合所有连接的关闭错误，与 CloseAll 的错误聚合策略保持一致 / collect every connection's close error to match CloseAll's aggregation policy.
	var errs []error
	for _, conn := range connections {
		if err := conn.close(); err != nil {
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
