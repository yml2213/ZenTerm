package service

import (
	"fmt"
	"os"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strings"

	"zenterm/internal/model"
)

// ListLocalFiles 返回本机目录内容 / returns the local directory contents.
func (s *Service) ListLocalFiles(targetPath string) (model.FileListing, error) {
	resolvedPath, err := resolveLocalPath(targetPath)
	if err != nil {
		return model.FileListing{}, err
	}

	entries, err := os.ReadDir(resolvedPath)
	if err != nil {
		return model.FileListing{}, fmt.Errorf("read local directory: %w", err)
	}

	fileEntries := make([]model.FileEntry, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return model.FileListing{}, fmt.Errorf("read local file info: %w", err)
		}

		fileEntries = append(fileEntries, buildFileEntry(resolvedPath, info, false))
	}

	sortFileEntries(fileEntries)

	return model.FileListing{
		Path:       resolvedPath,
		ParentPath: localParentPath(resolvedPath),
		Entries:    fileEntries,
	}, nil
}

// ListRemoteFiles 通过 SFTP 返回远端目录内容 / returns the remote directory contents through SFTP.
func (s *Service) ListRemoteFiles(hostID, targetPath string) (model.FileListing, error) {
	var listing model.FileListing

	err := s.withReusableSFTPClient(hostID, func(sftpConn sftpClient, remoteAddr string) error {
		resolvedPath, err := resolveRemotePath(sftpConn, targetPath)
		if err != nil {
			return fmt.Errorf("resolve remote path for %s: %w", remoteAddr, err)
		}

		entries, err := sftpConn.ReadDir(resolvedPath)
		if err != nil {
			return fmt.Errorf("read remote directory: %w", err)
		}

		fileEntries := make([]model.FileEntry, 0, len(entries))
		for _, entry := range entries {
			fileEntries = append(fileEntries, buildFileEntry(resolvedPath, entry, true))
		}

		sortFileEntries(fileEntries)
		listing = model.FileListing{
			Path:       resolvedPath,
			ParentPath: remoteParentPath(resolvedPath),
			Entries:    fileEntries,
		}

		return nil
	})
	if err != nil {
		return model.FileListing{}, err
	}

	return listing, nil
}

func resolveLocalPath(targetPath string) (string, error) {
	if strings.TrimSpace(targetPath) == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve local home dir: %w", err)
		}
		return homeDir, nil
	}

	if filepath.IsAbs(targetPath) {
		return filepath.Clean(targetPath), nil
	}

	resolvedPath, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve local absolute path: %w", err)
	}

	return filepath.Clean(resolvedPath), nil
}

func resolveRemotePath(client sftpClient, targetPath string) (string, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		cwd, err := client.Getwd()
		if err == nil && strings.TrimSpace(cwd) != "" {
			return client.RealPath(cwd)
		}
		return client.RealPath(".")
	}

	return client.RealPath(trimmed)
}

func localParentPath(currentPath string) string {
	parentPath := filepath.Dir(currentPath)
	if parentPath == currentPath {
		return ""
	}
	return parentPath
}

func remoteParentPath(currentPath string) string {
	if currentPath == "/" {
		return ""
	}

	parentPath := pathpkg.Dir(currentPath)
	if parentPath == "." || parentPath == currentPath {
		return ""
	}

	return parentPath
}

func buildFileEntry(basePath string, info os.FileInfo, remote bool) model.FileEntry {
	join := filepath.Join
	if remote {
		join = pathpkg.Join
	}

	fileType := "file"
	switch {
	case info.IsDir():
		fileType = "dir"
	case info.Mode()&os.ModeSymlink != 0:
		fileType = "symlink"
	case !info.Mode().IsRegular():
		fileType = "other"
	}

	return model.FileEntry{
		Name:    info.Name(),
		Path:    join(basePath, info.Name()),
		Size:    info.Size(),
		Mode:    info.Mode().String(),
		ModTime: info.ModTime().UTC(),
		Type:    fileType,
		IsDir:   info.IsDir(),
	}
}

func sortFileEntries(entries []model.FileEntry) {
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}

		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
}
