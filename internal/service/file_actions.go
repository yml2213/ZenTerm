package service

import (
	"errors"
	"fmt"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"

	"zenterm/internal/model"
)

// CreateLocalDirectory 在本地目录下创建文件夹 / creates a directory inside a local parent directory.
func (s *Service) CreateLocalDirectory(parentPath, name string) (model.FileEntry, error) {
	resolvedParentPath, err := resolveExistingLocalDirectory(parentPath)
	if err != nil {
		return model.FileEntry{}, err
	}

	nextName := strings.TrimSpace(name)
	if nextName == "" {
		return model.FileEntry{}, ErrFileNameRequired
	}

	targetPath := filepath.Join(resolvedParentPath, nextName)
	if _, err := os.Stat(targetPath); err == nil {
		return model.FileEntry{}, ErrFileEntryAlreadyExists
	} else if !errors.Is(err, os.ErrNotExist) {
		return model.FileEntry{}, fmt.Errorf("stat local target: %w", err)
	}

	if err := os.Mkdir(targetPath, 0o755); err != nil {
		return model.FileEntry{}, fmt.Errorf("create local directory: %w", err)
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		return model.FileEntry{}, fmt.Errorf("stat created local directory: %w", err)
	}

	return buildFileEntry(resolvedParentPath, info, false), nil
}

// RenameLocalEntry 重命名本地文件或目录 / renames a local file or directory.
func (s *Service) RenameLocalEntry(targetPath, nextName string) (model.FileEntry, error) {
	trimmedPath := strings.TrimSpace(targetPath)
	if trimmedPath == "" {
		return model.FileEntry{}, ErrFileActionPathRequired
	}

	trimmedName := strings.TrimSpace(nextName)
	if trimmedName == "" {
		return model.FileEntry{}, ErrFileNameRequired
	}

	resolvedPath, err := resolveLocalPath(trimmedPath)
	if err != nil {
		return model.FileEntry{}, err
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return model.FileEntry{}, fmt.Errorf("stat local entry: %w", err)
	}

	parentPath := filepath.Dir(resolvedPath)
	nextPath := filepath.Join(parentPath, trimmedName)
	if filepath.Clean(nextPath) == filepath.Clean(resolvedPath) {
		return buildFileEntry(parentPath, info, false), nil
	}

	if _, err := os.Stat(nextPath); err == nil {
		return model.FileEntry{}, ErrFileEntryAlreadyExists
	} else if !errors.Is(err, os.ErrNotExist) {
		return model.FileEntry{}, fmt.Errorf("stat local rename target: %w", err)
	}

	if err := os.Rename(resolvedPath, nextPath); err != nil {
		return model.FileEntry{}, fmt.Errorf("rename local entry: %w", err)
	}

	nextInfo, err := os.Stat(nextPath)
	if err != nil {
		return model.FileEntry{}, fmt.Errorf("stat renamed local entry: %w", err)
	}

	return buildFileEntry(parentPath, nextInfo, false), nil
}

// DeleteLocalEntry 删除本地文件或目录 / deletes a local file or directory recursively.
func (s *Service) DeleteLocalEntry(targetPath string) error {
	trimmedPath := strings.TrimSpace(targetPath)
	if trimmedPath == "" {
		return ErrFileActionPathRequired
	}

	resolvedPath, err := resolveLocalPath(trimmedPath)
	if err != nil {
		return err
	}

	if _, err := os.Stat(resolvedPath); err != nil {
		return fmt.Errorf("stat local delete target: %w", err)
	}

	if err := os.RemoveAll(resolvedPath); err != nil {
		return fmt.Errorf("delete local entry: %w", err)
	}

	return nil
}

// CreateRemoteDirectory 在远端目录下创建文件夹 / creates a directory inside a remote parent directory.
func (s *Service) CreateRemoteDirectory(hostID, parentPath, name string) (model.FileEntry, error) {
	var entry model.FileEntry

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return model.FileEntry{}, ErrFileNameRequired
	}

	err := s.withReusableSFTPClient(hostID, func(client sftpClient, remoteAddr string) error {
		resolvedParentPath, parentInfo, err := resolveExistingRemoteDirectory(client, parentPath)
		if err != nil {
			return fmt.Errorf("resolve remote parent for %s: %w", remoteAddr, err)
		}
		if !parentInfo.IsDir() {
			return ErrTransferTargetNotDirectory
		}

		targetPath := pathpkg.Join(resolvedParentPath, trimmedName)
		if _, err := client.Stat(targetPath); err == nil {
			return ErrFileEntryAlreadyExists
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("stat remote mkdir target: %w", err)
		}

		if err := client.Mkdir(targetPath); err != nil {
			return fmt.Errorf("create remote directory: %w", err)
		}

		info, err := client.Stat(targetPath)
		if err != nil {
			return fmt.Errorf("stat created remote directory: %w", err)
		}

		entry = buildFileEntry(resolvedParentPath, info, true)
		return nil
	})
	if err != nil {
		return model.FileEntry{}, err
	}

	return entry, nil
}

// RenameRemoteEntry 重命名远端文件或目录 / renames a remote file or directory.
func (s *Service) RenameRemoteEntry(hostID, targetPath, nextName string) (model.FileEntry, error) {
	var entry model.FileEntry

	trimmedPath := strings.TrimSpace(targetPath)
	if trimmedPath == "" {
		return model.FileEntry{}, ErrFileActionPathRequired
	}

	trimmedName := strings.TrimSpace(nextName)
	if trimmedName == "" {
		return model.FileEntry{}, ErrFileNameRequired
	}

	err := s.withReusableSFTPClient(hostID, func(client sftpClient, remoteAddr string) error {
		resolvedPath, err := resolveRemotePath(client, trimmedPath)
		if err != nil {
			return fmt.Errorf("resolve remote path for %s: %w", remoteAddr, err)
		}

		info, err := client.Stat(resolvedPath)
		if err != nil {
			return fmt.Errorf("stat remote entry: %w", err)
		}

		parentPath := pathpkg.Dir(resolvedPath)
		if parentPath == "." {
			parentPath = "/"
		}
		nextPath := pathpkg.Join(parentPath, trimmedName)
		if pathpkg.Clean(nextPath) == pathpkg.Clean(resolvedPath) {
			entry = buildFileEntry(parentPath, info, true)
			return nil
		}

		if _, err := client.Stat(nextPath); err == nil {
			return ErrFileEntryAlreadyExists
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("stat remote rename target: %w", err)
		}

		if err := client.Rename(resolvedPath, nextPath); err != nil {
			return fmt.Errorf("rename remote entry: %w", err)
		}

		nextInfo, err := client.Stat(nextPath)
		if err != nil {
			return fmt.Errorf("stat renamed remote entry: %w", err)
		}

		entry = buildFileEntry(parentPath, nextInfo, true)
		return nil
	})
	if err != nil {
		return model.FileEntry{}, err
	}

	return entry, nil
}

// DeleteRemoteEntry 删除远端文件或目录 / deletes a remote file or directory recursively.
func (s *Service) DeleteRemoteEntry(hostID, targetPath string) error {
	trimmedPath := strings.TrimSpace(targetPath)
	if trimmedPath == "" {
		return ErrFileActionPathRequired
	}

	return s.withReusableSFTPClient(hostID, func(client sftpClient, remoteAddr string) error {
		resolvedPath, err := resolveRemotePath(client, trimmedPath)
		if err != nil {
			return fmt.Errorf("resolve remote delete path for %s: %w", remoteAddr, err)
		}

		info, err := client.Stat(resolvedPath)
		if err != nil {
			return fmt.Errorf("stat remote delete target: %w", err)
		}

		if err := removeRemoteEntry(client, resolvedPath, info); err != nil {
			return fmt.Errorf("delete remote entry: %w", err)
		}

		return nil
	})
}

func removeRemoteEntry(client sftpClient, targetPath string, info os.FileInfo) error {
	if !info.IsDir() {
		return client.Remove(targetPath)
	}

	children, err := client.ReadDir(targetPath)
	if err != nil {
		return err
	}

	for _, child := range children {
		childPath := pathpkg.Join(targetPath, child.Name())
		if err := removeRemoteEntry(client, childPath, child); err != nil {
			return err
		}
	}

	return client.RemoveDirectory(targetPath)
}
