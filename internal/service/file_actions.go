package service

import (
	"errors"
	"fmt"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
	"sync"

	"zenterm/internal/model"
)

// remoteDeleteWorkers 限制远端并发删除的最大并发度，避免单个连接被 SFTP 请求打满 / caps concurrency for remote recursive deletes so a single SSH channel is not flooded.
const remoteDeleteWorkers = 8

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
	if err := s.ensureLocalDeleteAllowed(resolvedPath); err != nil {
		return err
	}

	if err := os.RemoveAll(resolvedPath); err != nil {
		return fmt.Errorf("delete local entry: %w", err)
	}

	return nil
}

func (s *Service) ensureLocalDeleteAllowed(targetPath string) error {
	cleanPath := filepath.Clean(targetPath)
	if isFilesystemRoot(cleanPath) {
		return ErrProtectedLocalPath
	}

	protectedExact := protectedLocalDeletePaths()
	for _, protected := range protectedExact {
		if sameLocalPath(cleanPath, protected) {
			return ErrProtectedLocalPath
		}
	}

	if s != nil && s.store != nil {
		dataDir := filepath.Dir(s.store.Path())
		if sameLocalPath(cleanPath, dataDir) || isPathInside(cleanPath, dataDir) {
			return ErrProtectedLocalPath
		}
	}

	return nil
}

func protectedLocalDeletePaths() []string {
	paths := []string{}
	if homeDir, err := os.UserHomeDir(); err == nil && homeDir != "" {
		paths = append(paths, homeDir)
	}
	paths = append(paths,
		"/Applications",
		"/Library",
		"/System",
		"/Users",
		"/bin",
		"/etc",
		"/private",
		"/sbin",
		"/usr",
		"/var",
	)
	return paths
}

func isFilesystemRoot(path string) bool {
	cleanPath := filepath.Clean(path)
	volume := filepath.VolumeName(cleanPath)
	root := filepath.Clean(volume + string(os.PathSeparator))
	return sameLocalPath(cleanPath, root)
}

func sameLocalPath(left, right string) bool {
	return filepath.Clean(left) == filepath.Clean(right)
}

func isPathInside(path, parent string) bool {
	rel, err := filepath.Rel(filepath.Clean(parent), filepath.Clean(path))
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator))
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

type remoteDeleteEntry struct {
	path  string
	info  os.FileInfo
	depth int
}

// removeRemoteEntry 递归删除远端条目：先串行收集树，避免遍历阶段打爆单个 SFTP 连接；再用固定 worker 删除文件，并按深度从深到浅删除目录 / removes a remote entry by first collecting the tree serially (so traversal cannot flood one SFTP connection), then deleting files with fixed workers and directories deepest-first.
func removeRemoteEntry(client sftpClient, targetPath string, info os.FileInfo) error {
	entries, collectErr := collectRemoteDeleteEntries(client, targetPath, info, 0)
	deleteErr := deleteCollectedRemoteEntries(client, entries)
	return errors.Join(collectErr, deleteErr)
}

func collectRemoteDeleteEntries(client sftpClient, targetPath string, info os.FileInfo, depth int) ([]remoteDeleteEntry, error) {
	if !info.IsDir() {
		return []remoteDeleteEntry{{path: targetPath, info: info, depth: depth}}, nil
	}

	children, err := client.ReadDir(targetPath)
	if err != nil {
		return nil, fmt.Errorf("read remote directory %s: %w", targetPath, err)
	}

	entries := []remoteDeleteEntry{}
	var errs []error
	for _, child := range children {
		childPath := pathpkg.Join(targetPath, child.Name())
		childEntries, err := collectRemoteDeleteEntries(client, childPath, child, depth+1)
		entries = append(entries, childEntries...)
		if err != nil {
			errs = append(errs, err)
		}
	}
	entries = append(entries, remoteDeleteEntry{path: targetPath, info: info, depth: depth})
	return entries, errors.Join(errs...)
}

func deleteCollectedRemoteEntries(client sftpClient, entries []remoteDeleteEntry) error {
	files := make([]remoteDeleteEntry, 0, len(entries))
	dirsByDepth := make(map[int][]remoteDeleteEntry)
	maxDepth := -1
	for _, entry := range entries {
		if entry.info.IsDir() {
			dirsByDepth[entry.depth] = append(dirsByDepth[entry.depth], entry)
			if entry.depth > maxDepth {
				maxDepth = entry.depth
			}
			continue
		}
		files = append(files, entry)
	}

	var errs []error
	if err := runRemoteDeleteBatch(files, func(path string) error {
		return client.Remove(path)
	}); err != nil {
		errs = append(errs, err)
	}
	for depth := maxDepth; depth >= 0; depth-- {
		if err := runRemoteDeleteBatch(dirsByDepth[depth], func(path string) error {
			return client.RemoveDirectory(path)
		}); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func runRemoteDeleteBatch(entries []remoteDeleteEntry, remove func(path string) error) error {
	if len(entries) == 0 {
		return nil
	}

	workerCount := remoteDeleteWorkers
	if len(entries) < workerCount {
		workerCount = len(entries)
	}

	jobs := make(chan remoteDeleteEntry)
	errCh := make(chan error, len(entries))
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for entry := range jobs {
				if err := remove(entry.path); err != nil {
					errCh <- err
				}
			}
		}()
	}

	for _, entry := range entries {
		jobs <- entry
	}
	close(jobs)
	wg.Wait()
	close(errCh)

	errs := make([]error, 0, len(errCh))
	for err := range errCh {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

// ChmodLocalEntry 修改本地文件或目录的权限 / changes the permissions of a local file or directory.
func (s *Service) ChmodLocalEntry(targetPath string, mode os.FileMode) (model.FileEntry, error) {
	trimmedPath := strings.TrimSpace(targetPath)
	if trimmedPath == "" {
		return model.FileEntry{}, ErrFileActionPathRequired
	}

	resolvedPath, err := resolveLocalPath(trimmedPath)
	if err != nil {
		return model.FileEntry{}, err
	}

	if _, err := os.Stat(resolvedPath); err != nil {
		return model.FileEntry{}, fmt.Errorf("stat local chmod target: %w", err)
	}

	if err := os.Chmod(resolvedPath, mode); err != nil {
		return model.FileEntry{}, fmt.Errorf("chmod local entry: %w", err)
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return model.FileEntry{}, fmt.Errorf("stat local entry after chmod: %w", err)
	}

	parentPath := filepath.Dir(resolvedPath)
	return buildFileEntry(parentPath, info, false), nil
}

// ChmodRemoteEntry 修改远端文件或目录的权限 / changes the permissions of a remote file or directory.
func (s *Service) ChmodRemoteEntry(hostID, targetPath string, mode os.FileMode) (model.FileEntry, error) {
	var entry model.FileEntry

	trimmedPath := strings.TrimSpace(targetPath)
	if trimmedPath == "" {
		return model.FileEntry{}, ErrFileActionPathRequired
	}

	err := s.withReusableSFTPClient(hostID, func(client sftpClient, remoteAddr string) error {
		resolvedPath, err := resolveRemotePath(client, trimmedPath)
		if err != nil {
			return fmt.Errorf("resolve remote chmod path for %s: %w", remoteAddr, err)
		}

		if _, err := client.Stat(resolvedPath); err != nil {
			return fmt.Errorf("stat remote chmod target: %w", err)
		}

		if err := client.Chmod(resolvedPath, mode); err != nil {
			return fmt.Errorf("chmod remote entry: %w", err)
		}

		info, err := client.Stat(resolvedPath)
		if err != nil {
			return fmt.Errorf("stat remote entry after chmod: %w", err)
		}

		parentPath := pathpkg.Dir(resolvedPath)
		if parentPath == "." {
			parentPath = "/"
		}

		entry = buildFileEntry(parentPath, info, true)
		return nil
	})
	if err != nil {
		return model.FileEntry{}, err
	}

	return entry, nil
}
