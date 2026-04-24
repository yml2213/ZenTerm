package service

import (
	"errors"
	"fmt"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"

	"zenterm/internal/model"
)

// UploadFile 将本地文件上传到远端目录 / uploads a local file into the selected remote directory.
func (s *Service) UploadFile(hostID, localPath, remoteDir string) (model.FileTransferResult, error) {
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
		if _, err := client.Stat(targetPath); err == nil {
			return ErrTransferTargetExists
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

// DownloadFile 将远端文件下载到本地目录 / downloads a remote file into the selected local directory.
func (s *Service) DownloadFile(hostID, remotePath, localDir string) (model.FileTransferResult, error) {
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
		if _, err := os.Stat(targetPath); err == nil {
			return ErrTransferTargetExists
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

		targetFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
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
	s.sftpMu.Unlock()

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
	if existing, ok := s.sftpConnections[hostID]; ok {
		s.sftpMu.Unlock()
		_ = conn.close()
		return existing, nil
	}
	s.sftpConnections[hostID] = conn
	s.sftpMu.Unlock()

	return conn, nil
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

	var closeErr error
	for _, conn := range connections {
		if err := conn.close(); err != nil && closeErr == nil {
			closeErr = err
		}
	}

	return closeErr
}

func (m *managedSFTPConnection) close() error {
	var closeErr error

	m.closeOnce.Do(func() {
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
