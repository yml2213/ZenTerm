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

		if err := removeRemoteEntry(client, resolvedPath, info, make(chan struct{}, remoteDeleteWorkers)); err != nil {
			return fmt.Errorf("delete remote entry: %w", err)
		}

		return nil
	})
}

// removeRemoteEntry 递归删除远端条目；sem 在整个删除任务（含所有递归层）共享，确保并发上限是 remoteDeleteWorkers / removes a remote entry recursively; sem is shared across the whole delete task so the concurrency cap is remoteDeleteWorkers globally.
//
// 关键约束：sem 只在具体的 SFTP 操作（Remove/RemoveDirectory）周围短暂持有，绝不跨递归子树持有。否则一旦 8 个 goroutine 各占一个令牌再进入下一层，孙子节点要获取令牌时就会和父层的 wg.Wait() 互相死锁。这里树遍历本身不持令牌，叶子操作 acquire/release 配对，wg.Wait() 期间没有任何令牌被持有 / critical: sem is held only around concrete SFTP ops (Remove/RemoveDirectory), never across a recursion subtree — otherwise 8 goroutines each holding a token then descending would deadlock against their own wg.Wait() when grandchildren try to acquire. The walk itself holds no token; leaf ops acquire/release in pairs; no token is held while a frame sits in wg.Wait().
func removeRemoteEntry(client sftpClient, targetPath string, info os.FileInfo, sem chan struct{}) error {
	if !info.IsDir() {
		sem <- struct{}{}
		defer func() { <-sem }()
		return client.Remove(targetPath)
	}

	children, err := client.ReadDir(targetPath)
	if err != nil {
		return err
	}

	// 子目录树派发 goroutine 并发删除；goroutine 进入递归时不再持有令牌，由叶子操作自行 acquire/release，避免跨子树持有造成死锁 / dispatch child subtrees to goroutines; the goroutine holds no token when it recurses — leaf ops acquire/release themselves — so no token is held across a subtree and wg.Wait() can always progress.
	var wg sync.WaitGroup
	var firstErr error
	var errMu sync.Mutex
	setErr := func(err error) {
		errMu.Lock()
		if firstErr == nil {
			firstErr = err
		}
		errMu.Unlock()
	}

	for _, child := range children {
		childPath := pathpkg.Join(targetPath, child.Name())
		child := child
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := removeRemoteEntry(client, childPath, child, sem); err != nil {
				setErr(err)
			}
		}()
	}
	wg.Wait()

	if firstErr != nil {
		return firstErr
	}

	// 目录本身的 RemoveDirectory 是具体 SFTP 操作，acquire/release 一对 / the directory's own RemoveDirectory is a concrete SFTP op, so acquire/release around just that.
	sem <- struct{}{}
	defer func() { <-sem }()
	return client.RemoveDirectory(targetPath)
}
