package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
)

func TestListLocalFilesReturnsSortedEntries(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "beta-dir"), 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "alpha.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	listing, err := svc.ListLocalFiles(dir)
	if err != nil {
		t.Fatalf("ListLocalFiles() error = %v", err)
	}
	if listing.Path != dir {
		t.Fatalf("listing.Path = %q, want %q", listing.Path, dir)
	}
	if len(listing.Entries) != 2 {
		t.Fatalf("len(listing.Entries) = %d, want 2", len(listing.Entries))
	}
	if !listing.Entries[0].IsDir || listing.Entries[0].Name != "beta-dir" {
		t.Fatalf("listing.Entries[0] = %#v, want beta-dir directory first", listing.Entries[0])
	}
	if listing.Entries[1].Name != "alpha.txt" || listing.Entries[1].IsDir {
		t.Fatalf("listing.Entries[1] = %#v, want alpha.txt file second", listing.Entries[1])
	}
}

func TestCancelFileTransferClosesCachedSFTPConnection(t *testing.T) {
	client := &stubSSHClient{}
	svc := &Service{
		sftpConnections: map[string]*managedSFTPConnection{
			"host-1": {
				hostID: "host-1",
				client: client,
			},
		},
	}

	if err := svc.CancelFileTransfer("host-1"); err != nil {
		t.Fatalf("CancelFileTransfer() error = %v", err)
	}
	if !client.closed {
		t.Fatal("CancelFileTransfer() did not close the cached SSH client")
	}
	if len(svc.sftpConnections) != 0 {
		t.Fatalf("cached SFTP connections = %d, want 0", len(svc.sftpConnections))
	}
	if err := svc.CancelFileTransfer(""); !errors.Is(err, ErrHostIDRequired) {
		t.Fatalf("CancelFileTransfer(empty) error = %v, want ErrHostIDRequired", err)
	}
}

func TestDeleteLocalEntryRefusesProtectedStoreDirectory(t *testing.T) {
	dir := t.TempDir()
	dataDir := filepath.Join(dir, "ZenTerm")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	protectedFile := filepath.Join(dataDir, "config.zen")
	if err := os.WriteFile(protectedFile, []byte("config"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := db.NewStore(protectedFile)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := svc.DeleteLocalEntry(dataDir); !errors.Is(err, ErrProtectedLocalPath) {
		t.Fatalf("DeleteLocalEntry(dataDir) error = %v, want %v", err, ErrProtectedLocalPath)
	}
	if err := svc.DeleteLocalEntry(protectedFile); !errors.Is(err, ErrProtectedLocalPath) {
		t.Fatalf("DeleteLocalEntry(config.zen) error = %v, want %v", err, ErrProtectedLocalPath)
	}
	if _, err := os.Stat(protectedFile); err != nil {
		t.Fatalf("protected file was removed: %v", err)
	}
}

func TestDeleteLocalEntryAllowsNormalFile(t *testing.T) {
	dir := t.TempDir()
	dataDir := filepath.Join(dir, "ZenTerm")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(dataDir) error = %v", err)
	}
	targetPath := filepath.Join(dir, "scratch.txt")
	if err := os.WriteFile(targetPath, []byte("scratch"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := db.NewStore(filepath.Join(dataDir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := svc.DeleteLocalEntry(targetPath); err != nil {
		t.Fatalf("DeleteLocalEntry() error = %v", err)
	}
	if _, err := os.Stat(targetPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("deleted file stat error = %v, want %v", err, os.ErrNotExist)
	}
}

func TestListRemoteFilesReturnsResolvedDirectory(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-sftp", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd: "/home/zen",
			realPaths: map[string]string{
				".":            "/home/zen",
				"/home/zen":    "/home/zen",
				"/srv/project": "/srv/project",
			},
			dirs: map[string][]os.FileInfo{
				"/srv/project": {
					stubFileInfo{name: "z-last.log", size: 17, mode: 0o644, modTime: time.Unix(1710000100, 0)},
					stubFileInfo{name: "config", mode: os.ModeDir | 0o755, modTime: time.Unix(1710000000, 0), dir: true},
				},
			},
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	listing, err := svc.ListRemoteFiles(host.ID, "/srv/project")
	if err != nil {
		t.Fatalf("ListRemoteFiles() error = %v", err)
	}
	if listing.Path != "/srv/project" {
		t.Fatalf("listing.Path = %q, want %q", listing.Path, "/srv/project")
	}
	if listing.ParentPath != "/srv" {
		t.Fatalf("listing.ParentPath = %q, want %q", listing.ParentPath, "/srv")
	}
	if len(listing.Entries) != 2 {
		t.Fatalf("len(listing.Entries) = %d, want 2", len(listing.Entries))
	}
	if listing.Entries[0].Name != "config" || !listing.Entries[0].IsDir {
		t.Fatalf("listing.Entries[0] = %#v, want config directory first", listing.Entries[0])
	}
	if listing.Entries[1].Name != "z-last.log" || listing.Entries[1].IsDir {
		t.Fatalf("listing.Entries[1] = %#v, want z-last.log file second", listing.Entries[1])
	}
	if !client.sftp.closed {
		t.Fatal("ListRemoteFiles() did not close the sftp client")
	}
}

func TestListRemoteFilesReusesSSHDialPerHost(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-reuse", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{".": "/home/zen", "/srv": "/srv"},
			dirs: map[string][]os.FileInfo{
				"/srv": {
					stubFileInfo{name: "logs", mode: os.ModeDir | 0o755, modTime: time.Unix(1710000000, 0), dir: true},
				},
			},
			stats: map[string]os.FileInfo{
				"/srv": stubFileInfo{name: "srv", mode: os.ModeDir | 0o755, modTime: time.Unix(1710000000, 0), dir: true},
			},
		},
	}
	dialer := &stubDialer{client: client}

	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	if _, err := svc.ListRemoteFiles(host.ID, "/srv"); err != nil {
		t.Fatalf("ListRemoteFiles() first call error = %v", err)
	}
	if _, err := svc.ListRemoteFiles(host.ID, "/srv"); err != nil {
		t.Fatalf("ListRemoteFiles() second call error = %v", err)
	}

	if dialer.hits != 1 {
		t.Fatalf("dialer.hits = %d, want 1", dialer.hits)
	}
	if client.newSFTPHits != 2 {
		t.Fatalf("client.newSFTPHits = %d, want 2", client.newSFTPHits)
	}

	if err := svc.CloseAll(); err != nil {
		t.Fatalf("CloseAll() error = %v", err)
	}
	if !client.closed {
		t.Fatal("CloseAll() did not close reusable sftp ssh client")
	}
}

func TestUploadFileCopiesLocalFileToRemoteDirectory(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-upload", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	localPath := filepath.Join(dir, "notes.txt")
	content := []byte("hello upload")
	if err := os.WriteFile(localPath, content, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/project": "/srv/project"},
			dirs:      map[string][]os.FileInfo{"/srv/project": {}},
			stats: map[string]os.FileInfo{
				"/srv/project": stubFileInfo{name: "project", mode: os.ModeDir | 0o755, modTime: time.Unix(1710000000, 0), dir: true},
			},
			files: map[string][]byte{},
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	result, err := svc.UploadFile(host.ID, localPath, "/srv/project", false, nil)
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}

	targetPath := "/srv/project/notes.txt"
	if result.TargetPath != targetPath {
		t.Fatalf("result.TargetPath = %q, want %q", result.TargetPath, targetPath)
	}
	if result.BytesCopied != int64(len(content)) {
		t.Fatalf("result.BytesCopied = %d, want %d", result.BytesCopied, len(content))
	}
	if got := string(client.sftp.files[targetPath]); got != string(content) {
		t.Fatalf("remote file content = %q, want %q", got, string(content))
	}
}

func TestDownloadFileCopiesRemoteFileToLocalDirectory(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-download", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	content := []byte("hello download")
	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/app.log": "/srv/app.log"},
			dirs:      map[string][]os.FileInfo{},
			stats: map[string]os.FileInfo{
				"/srv/app.log": stubFileInfo{name: "app.log", size: int64(len(content)), mode: 0o644, modTime: time.Unix(1710000000, 0)},
			},
			files: map[string][]byte{
				"/srv/app.log": content,
			},
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	result, err := svc.DownloadFile(host.ID, "/srv/app.log", dir, false, nil)
	if err != nil {
		t.Fatalf("DownloadFile() error = %v", err)
	}

	targetPath := filepath.Join(dir, "app.log")
	if result.TargetPath != targetPath {
		t.Fatalf("result.TargetPath = %q, want %q", result.TargetPath, targetPath)
	}
	downloaded, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(downloaded) != string(content) {
		t.Fatalf("downloaded content = %q, want %q", string(downloaded), string(content))
	}
}

func TestUploadFileOverwritesRemoteFileWhenRequested(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-upload-overwrite", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	localPath := filepath.Join(dir, "notes.txt")
	content := []byte("fresh content")
	if err := os.WriteFile(localPath, content, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/project": "/srv/project"},
			dirs:      map[string][]os.FileInfo{"/srv/project": {}},
			stats: map[string]os.FileInfo{
				"/srv/project":           stubFileInfo{name: "project", mode: os.ModeDir | 0o755, modTime: time.Unix(1710000000, 0), dir: true},
				"/srv/project/notes.txt": stubFileInfo{name: "notes.txt", size: 13, mode: 0o644, modTime: time.Unix(1710000100, 0)},
			},
			files: map[string][]byte{
				"/srv/project/notes.txt": []byte("stale content"),
			},
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	result, err := svc.UploadFile(host.ID, localPath, "/srv/project", true, nil)
	if err != nil {
		t.Fatalf("UploadFile() overwrite error = %v", err)
	}

	targetPath := "/srv/project/notes.txt"
	if result.TargetPath != targetPath {
		t.Fatalf("result.TargetPath = %q, want %q", result.TargetPath, targetPath)
	}
	if got := string(client.sftp.files[targetPath]); got != string(content) {
		t.Fatalf("remote file content after overwrite = %q, want %q", got, string(content))
	}
}

func TestDownloadFileOverwritesLocalFileWhenRequested(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-download-overwrite", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	content := []byte("replacement content")
	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/app.log": "/srv/app.log"},
			dirs:      map[string][]os.FileInfo{},
			stats: map[string]os.FileInfo{
				"/srv/app.log": stubFileInfo{name: "app.log", size: int64(len(content)), mode: 0o644, modTime: time.Unix(1710000000, 0)},
			},
			files: map[string][]byte{
				"/srv/app.log": content,
			},
		},
	}

	targetPath := filepath.Join(dir, "app.log")
	if err := os.WriteFile(targetPath, []byte("legacy"), 0o644); err != nil {
		t.Fatalf("WriteFile() seed error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	result, err := svc.DownloadFile(host.ID, "/srv/app.log", dir, true, nil)
	if err != nil {
		t.Fatalf("DownloadFile() overwrite error = %v", err)
	}

	if result.TargetPath != targetPath {
		t.Fatalf("result.TargetPath = %q, want %q", result.TargetPath, targetPath)
	}
	downloaded, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(downloaded) != string(content) {
		t.Fatalf("downloaded content after overwrite = %q, want %q", string(downloaded), string(content))
	}
}

func TestUploadFileRemovesRemoteTempFileWhenCopyFails(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-upload-fail", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	localPath := filepath.Join(dir, "notes.txt")
	if err := os.WriteFile(localPath, []byte("content that will fail"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/project": "/srv/project"},
			dirs:      map[string][]os.FileInfo{"/srv/project": {}},
			stats: map[string]os.FileInfo{
				"/srv/project": stubFileInfo{name: "project", mode: os.ModeDir | 0o755, dir: true},
			},
			files:    map[string][]byte{},
			writeErr: errors.New("remote write failed"),
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	if _, err := svc.UploadFile(host.ID, localPath, "/srv/project", false, nil); err == nil {
		t.Fatal("UploadFile() error = nil, want write failure")
	}
	if len(client.sftp.files) != 0 {
		t.Fatalf("remote files after failed upload = %#v, want empty", client.sftp.files)
	}
}

func TestDownloadFileKeepsExistingLocalFileWhenCopyFails(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-download-fail", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	content := []byte("replacement content")
	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/app.log": "/srv/app.log"},
			dirs:      map[string][]os.FileInfo{},
			stats: map[string]os.FileInfo{
				"/srv/app.log": stubFileInfo{name: "app.log", size: int64(len(content)), mode: 0o644},
			},
			files: map[string][]byte{
				"/srv/app.log": content,
			},
			readErr: errors.New("remote read failed"),
		},
	}

	downloadDir := filepath.Join(dir, "downloads")
	if err := os.Mkdir(downloadDir, 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	targetPath := filepath.Join(downloadDir, "app.log")
	if err := os.WriteFile(targetPath, []byte("original"), 0o644); err != nil {
		t.Fatalf("WriteFile() seed error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	if _, err := svc.DownloadFile(host.ID, "/srv/app.log", downloadDir, true, nil); err == nil {
		t.Fatal("DownloadFile() error = nil, want read failure")
	}
	downloaded, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(downloaded) != "original" {
		t.Fatalf("local target after failed download = %q, want original", string(downloaded))
	}
	entries, err := os.ReadDir(downloadDir)
	if err != nil {
		t.Fatalf("ReadDir() error = %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "app.log" {
		t.Fatalf("download directory entries = %#v, want only app.log", entries)
	}
}

// TestDeleteRemoteEntryDoesNotDeadlockOnWideTree 回归测试：根目录有 10 个子目录（超过 remoteDeleteWorkers=8），每个子目录含文件。
// 旧实现里 goroutine 在派发前就占用一个令牌并跨整个子树持有，10 个 goroutine 立刻占满 8 个令牌，
// 孙子文件的 client.Remove 也要获取令牌 → 与父层 wg.Wait() 互相死锁。新实现令牌只包具体 SFTP 操作，必须能在超时内完成。
//
// Regression: root has 10 subdirs (more than remoteDeleteWorkers=8), each holding a file. The old
// implementation acquired a token per goroutine before dispatch and held it across the whole subtree;
// 10 goroutines would saturate the 8-slot semaphore, then grandchild file Removes would block on
// acquire while parents sat in wg.Wait() — a deadlock. The fix holds tokens only around concrete SFTP
// ops, so this must finish well within the timeout.
func TestDeleteRemoteEntryDoesNotDeadlockOnWideTree(t *testing.T) {
	deleteRemoteEntryDeadlockTest(t, func(root string) (dirs map[string][]os.FileInfo, stats map[string]os.FileInfo, files map[string][]byte) {
		dirs = map[string][]os.FileInfo{}
		stats = map[string]os.FileInfo{root: stubFileInfo{name: filepath.Base(root), mode: os.ModeDir | 0o755, dir: true}}
		files = map[string][]byte{}
		for i := 0; i < 10; i++ {
			sub := filepath.Join(root, fmt.Sprintf("d%d", i))
			leaf := filepath.Join(sub, "f.txt")
			dirs[sub] = []os.FileInfo{stubFileInfo{name: "f.txt", size: 1, mode: 0o644}}
			dirs[root] = append(dirs[root], stubFileInfo{name: fmt.Sprintf("d%d", i), mode: os.ModeDir | 0o755, dir: true})
			stats[sub] = stubFileInfo{name: fmt.Sprintf("d%d", i), mode: os.ModeDir | 0o755, dir: true}
			stats[leaf] = stubFileInfo{name: "f.txt", size: 1, mode: 0o644}
			files[leaf] = []byte("x")
		}
		return dirs, stats, files
	}, "/srv/wide")
}

// TestDeleteRemoteEntryDoesNotDeadlockOnDeepChain 回归测试：单链目录深度 10（> remoteDeleteWorkers=8）。
// 旧实现里深度超过 8 的单链也会因为每层都持令牌再下沉而死锁 / Regression: a depth-10 single chain
// also deadlocked in the old impl since each level held a token before descending past depth 8.
func TestDeleteRemoteEntryDoesNotDeadlockOnDeepChain(t *testing.T) {
	deleteRemoteEntryDeadlockTest(t, func(root string) (dirs map[string][]os.FileInfo, stats map[string]os.FileInfo, files map[string][]byte) {
		dirs = map[string][]os.FileInfo{}
		stats = map[string]os.FileInfo{root: stubFileInfo{name: filepath.Base(root), mode: os.ModeDir | 0o755, dir: true}}
		files = map[string][]byte{}
		cur := root
		for i := 0; i < 10; i++ {
			next := filepath.Join(cur, fmt.Sprintf("lvl%d", i))
			dirs[cur] = []os.FileInfo{stubFileInfo{name: fmt.Sprintf("lvl%d", i), mode: os.ModeDir | 0o755, dir: true}}
			stats[next] = stubFileInfo{name: fmt.Sprintf("lvl%d", i), mode: os.ModeDir | 0o755, dir: true}
			cur = next
		}
		// 叶子目录里放一个文件，确保最后一层也走 Remove / a leaf file so the deepest level also does a Remove.
		leaf := filepath.Join(cur, "end.txt")
		dirs[cur] = []os.FileInfo{stubFileInfo{name: "end.txt", size: 1, mode: 0o644}}
		stats[leaf] = stubFileInfo{name: "end.txt", size: 1, mode: 0o644}
		files[leaf] = []byte("x")
		return dirs, stats, files
	}, "/srv/deep")
}

func TestCloseAllClosesInFlightSFTPConnection(t *testing.T) {
	store, vault := setupDeleteTestStore(t)
	host := model.Host{ID: "host-inflight-sftp", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	client := &stubSSHClient{}
	dialer := &blockingDialer{
		client:  client,
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	opDone := make(chan error, 1)
	go func() {
		_, err := svc.ListRemoteFiles(host.ID, "/srv")
		opDone <- err
	}()

	select {
	case <-dialer.started:
	case <-time.After(2 * time.Second):
		t.Fatal("SFTP dial did not start")
	}

	closeDone := make(chan error, 1)
	go func() {
		closeDone <- svc.CloseAll()
	}()

	select {
	case err := <-closeDone:
		t.Fatalf("CloseAll() returned before the in-flight dial completed: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	close(dialer.release)

	select {
	case err := <-closeDone:
		if err != nil {
			t.Fatalf("CloseAll() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("CloseAll() did not finish after releasing in-flight dial")
	}

	select {
	case err := <-opDone:
		if !errors.Is(err, ErrSFTPConnectionClosed) {
			t.Fatalf("ListRemoteFiles() error = %v, want %v", err, ErrSFTPConnectionClosed)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("ListRemoteFiles() did not finish after in-flight dial was closed")
	}
	if !client.closed {
		t.Fatal("in-flight SFTP ssh client was not closed")
	}
	svc.sftpMu.Lock()
	cached := len(svc.sftpConnections)
	svc.sftpMu.Unlock()
	if cached != 0 {
		t.Fatalf("cached SFTP connections after CloseAll = %d, want 0", cached)
	}
}

func TestCancelFileTransferCancelsInFlightSFTPDial(t *testing.T) {
	store, vault := setupDeleteTestStore(t)
	host := model.Host{ID: "host-cancel-sftp-dial", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	dialer := &contextBlockingDialer{started: make(chan struct{})}
	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	opDone := make(chan error, 1)
	go func() {
		_, err := svc.ListRemoteFiles(host.ID, "/srv")
		opDone <- err
	}()

	select {
	case <-dialer.started:
	case <-time.After(2 * time.Second):
		t.Fatal("SFTP dial did not start")
	}
	if err := svc.CancelFileTransfer(host.ID); err != nil {
		t.Fatalf("CancelFileTransfer() error = %v", err)
	}

	select {
	case err := <-opDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("ListRemoteFiles() error = %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("ListRemoteFiles() did not stop after cancelling the in-flight dial")
	}
}

// TestCancelFileTransferDoesNotPublishConnectionAfterDial 验证取消与拨号发布之间的窗口不会泄露已关闭连接。
func TestCancelFileTransferDoesNotPublishConnectionAfterDial(t *testing.T) {
	client := &stubSSHClient{}
	ctx, cancel := context.WithCancel(context.Background())
	call := &sftpDialCall{
		done:       make(chan struct{}),
		generation: 0,
		cancel:     cancel,
	}
	svc := &Service{
		sftpConnections: make(map[string]*managedSFTPConnection),
		sftpInFlight:    map[string]*sftpDialCall{"host-race": call},
	}
	conn := &managedSFTPConnection{hostID: "host-race", client: client}

	if err := svc.CancelFileTransfer("host-race"); err != nil {
		t.Fatalf("CancelFileTransfer() error = %v", err)
	}
	svc.finishSFTPDial("host-race", call, conn, nil)

	if call.conn != nil {
		t.Fatal("cancelled dial published a connection")
	}
	if !errors.Is(call.err, context.Canceled) {
		t.Fatalf("dial error = %v, want context.Canceled", call.err)
	}
	if !client.closed {
		t.Fatal("cancelled dial client was not closed")
	}
	select {
	case <-call.done:
	default:
		t.Fatal("dial completion was not signaled")
	}
	if err := ctx.Err(); !errors.Is(err, context.Canceled) {
		t.Fatalf("dial context error = %v, want context.Canceled", err)
	}
}

type blockingDialer struct {
	client  sshClient
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

type contextBlockingDialer struct {
	started chan struct{}
	once    sync.Once
}

func (d *contextBlockingDialer) Dial(_ string, _ string, _ *ssh.ClientConfig) (sshClient, error) {
	return nil, errors.New("context-aware dialer requires DialContext")
}

func (d *contextBlockingDialer) DialContext(ctx context.Context, _ string, _ string, _ *ssh.ClientConfig) (sshClient, error) {
	d.once.Do(func() { close(d.started) })
	<-ctx.Done()
	return nil, ctx.Err()
}

func (d *blockingDialer) Dial(_ string, _ string, _ *ssh.ClientConfig) (sshClient, error) {
	d.once.Do(func() {
		close(d.started)
	})
	<-d.release
	return d.client, nil
}

func deleteRemoteEntryDeadlockTest(t *testing.T, seed func(root string) (map[string][]os.FileInfo, map[string]os.FileInfo, map[string][]byte), root string) {
	t.Helper()
	store, vault := setupDeleteTestStore(t)
	host := model.Host{ID: "host-delete-tree", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	dirs, stats, files := seed(root)
	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd: "/home/zen",
			realPaths: map[string]string{
				".":  "/home/zen",
				root: root,
			},
			dirs:  dirs,
			stats: stats,
			files: files,
		},
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	// 在独立 goroutine 跑删除，主线程带 5s 超时等待；旧实现会死锁、超时触发 fatal / run the delete in a goroutine and bound it with a 5s timeout; the old impl would hang and trip this timeout.
	done := make(chan error, 1)
	go func() {
		err := svc.DeleteRemoteEntry(host.ID, root)
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("DeleteRemoteEntry() error = %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("DeleteRemoteEntry() deadlocked: did not finish within 5s (wide/deep tree vs bounded workers)")
	}

	// 删除完成后根目录应已被 RemoveDirectory 清理 / the root must be removed after the delete.
	client.sftp.mu.Lock()
	_, rootStillThere := client.sftp.dirs[root]
	client.sftp.mu.Unlock()
	if rootStillThere {
		t.Fatalf("root %q still present after delete — recursive delete did not clean it up", root)
	}
}

func setupDeleteTestStore(t *testing.T) (*db.Store, *security.Vault) {
	t.Helper()
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	return store, vault
}

// TestIsFilesystemRoot 验证文件系统根判定：Unix 根、Windows 卷根、带尾分隔符、相对路径都不应误判 / verifies the filesystem-root predicate across Unix roots, Windows volume roots, trailing separators, and relative paths.
func TestIsFilesystemRoot(t *testing.T) {
	cases := []struct {
		name string
		path string
		want bool
	}{
		{"unix root", "/", true},
		{"unix root trailing slash", "//", true},
		{"nested path", "/Users/zen", false},
		{"relative", ".", false},
		{"empty", "", false},
	}
	// Windows 卷根用 runtime GOOS 判断比较脆弱，这里只在路径形如 X:\ 时断言为根 / Windows volume roots are asserted only when the path has the X:\ shape.
	cases = append(cases, struct {
		name string
		path string
		want bool
	}{"windows volume root", `C:\`, filepath.VolumeName(`C:\`) == `C:` && isFilesystemRoot(`C:\`)})

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// 跳过 Windows 用例在非 Windows 语义下不一致的情况 / skip the windows case when volume semantics differ.
			if tc.name == "windows volume root" && filepath.VolumeName(`C:\`) == "" {
				t.Skip("volume names not supported on this GOOS")
			}
			if got := isFilesystemRoot(tc.path); got != tc.want {
				t.Fatalf("isFilesystemRoot(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}

// TestSameLocalPath 验证路径比较忽略冗余分隔符和 . 但不跨 .. / verifies path comparison ignores redundant separators and "." but does not collapse "..".
func TestSameLocalPath(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"/Users/zen", "/Users/zen", true},
		{"/Users/zen/", "/Users/zen", true},
		{"/Users/./zen", "/Users/zen", true},
		{"/Users/zen", "/Users/zen2", false},
		{"/Users/zen", "/Users/zen/sub", false},
		{".", ".", true},
	}
	for _, tc := range cases {
		if got := sameLocalPath(tc.a, tc.b); got != tc.want {
			t.Errorf("sameLocalPath(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

// TestIsPathInside 验证父子关系判定：直接子、深层子为真；自身、兄弟、父级、.. 逃逸为假 / verifies containment: direct/deep descendants are inside; the path itself, siblings, parents, and ".." escapes are not.
func TestIsPathInside(t *testing.T) {
	parent := "/Users/zen"
	cases := []struct {
		name string
		path string
		want bool
	}{
		{"direct child", "/Users/zen/projects", true},
		{"deep descendant", "/Users/zen/projects/app/src", true},
		{"self", "/Users/zen", false},
		{"sibling", "/Users/other", false},
		{"parent", "/Users", false},
		{"dotdot escape", "/Users/zen/../other", false},
		{"unrelated", "/etc", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isPathInside(tc.path, parent); got != tc.want {
				t.Fatalf("isPathInside(%q, %q) = %v, want %v", tc.path, parent, got, tc.want)
			}
		})
	}
}

// TestEnsureLocalDeleteAllowed 验证删除保护策略：根、家目录、系统目录、数据目录及其内容被拒；普通路径放行 / verifies the delete-protection policy refuses root, home, system dirs, the data dir and its contents, while allowing normal paths.
func TestEnsureLocalDeleteAllowed(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	dataDir := filepath.Dir(store.Path())

	homeDir, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir() error = %v", err)
	}

	cases := []struct {
		name      string
		path      string
		wantError bool
	}{
		{"filesystem root", "/", true},
		{"home dir", homeDir, true},
		{"etc", "/etc", true},
		{"usr", "/usr", true},
		{"data dir itself", dataDir, true},
		{"data dir child", filepath.Join(dataDir, "config.zen"), true},
		{"data dir nested", filepath.Join(dataDir, "session-transcripts", "log.jsonl"), true},
		{"normal temp path", filepath.Join(t.TempDir(), "file.txt"), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := svc.ensureLocalDeleteAllowed(tc.path)
			if tc.wantError && !errors.Is(err, ErrProtectedLocalPath) {
				t.Fatalf("ensureLocalDeleteAllowed(%q) error = %v, want %v", tc.path, err, ErrProtectedLocalPath)
			}
			if !tc.wantError && err != nil {
				t.Fatalf("ensureLocalDeleteAllowed(%q) error = %v, want nil", tc.path, err)
			}
		})
	}
}

func TestUploadFileReportsMonotonicProgress(t *testing.T) {
	dir := t.TempDir()

	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-progress", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	localPath := filepath.Join(dir, "payload.bin")
	content := make([]byte, 4*1024*1024) // 4 MiB，确保多次复制循环
	for i := range content {
		content[i] = byte(i % 251)
	}
	if err := os.WriteFile(localPath, content, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/project": "/srv/project"},
			dirs:      map[string][]os.FileInfo{"/srv/project": {}},
			stats: map[string]os.FileInfo{
				"/srv/project": stubFileInfo{name: "project", mode: os.ModeDir | 0o755, modTime: time.Unix(1710000000, 0), dir: true},
			},
			files: map[string][]byte{},
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	var ticks []TransferProgress
	_, err = svc.UploadFile(host.ID, localPath, "/srv/project", false, func(p TransferProgress) {
		ticks = append(ticks, p)
	})
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}

	if len(ticks) < 2 {
		t.Fatalf("progress ticks = %d, want at least 2 (start and end)", len(ticks))
	}
	if ticks[0].DoneBytes != 0 || ticks[0].Percent != 0 {
		t.Fatalf("first tick = %+v, want doneBytes 0 / percent 0", ticks[0])
	}
	last := ticks[len(ticks)-1]
	if last.DoneBytes != int64(len(content)) || last.Percent != 100 {
		t.Fatalf("last tick = %+v, want doneBytes %d / percent 100", last, len(content))
	}
	if ticks[0].Direction != "upload" || ticks[0].FileName != "payload.bin" {
		t.Fatalf("first tick direction/fileName = %q/%q, want upload/payload.bin", ticks[0].Direction, ticks[0].FileName)
	}
	if last.TotalBytes != int64(len(content)) {
		t.Fatalf("totalBytes = %d, want %d", last.TotalBytes, len(content))
	}
	for i := 1; i < len(ticks); i++ {
		if ticks[i].DoneBytes < ticks[i-1].DoneBytes {
			t.Fatalf("progress went backwards at tick %d: %d -> %d", i, ticks[i-1].DoneBytes, ticks[i].DoneBytes)
		}
	}
}

func TestDownloadFileReportsFullProgress(t *testing.T) {
	dir := t.TempDir()

	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{ID: "host-progress-dl", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	content := []byte("download progress payload")
	client := &stubSSHClient{
		sftp: &stubSFTPClient{
			cwd:       "/home/zen",
			realPaths: map[string]string{"/srv/app.log": "/srv/app.log"},
			stats: map[string]os.FileInfo{
				"/srv/app.log": stubFileInfo{name: "app.log", mode: 0o644, size: int64(len(content)), modTime: time.Unix(1710000000, 0)},
			},
			files: map[string][]byte{"/srv/app.log": content},
		},
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	downloadDir := filepath.Join(dir, "downloads")
	if err := os.MkdirAll(downloadDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	var ticks []TransferProgress
	_, err = svc.DownloadFile(host.ID, "/srv/app.log", downloadDir, false, func(p TransferProgress) {
		ticks = append(ticks, p)
	})
	if err != nil {
		t.Fatalf("DownloadFile() error = %v", err)
	}

	if len(ticks) < 2 {
		t.Fatalf("progress ticks = %d, want at least 2", len(ticks))
	}
	if ticks[0].Direction != "download" || ticks[0].FileName != "app.log" {
		t.Fatalf("first tick direction/fileName = %q/%q, want download/app.log", ticks[0].Direction, ticks[0].FileName)
	}
	last := ticks[len(ticks)-1]
	if last.DoneBytes != int64(len(content)) || last.Percent != 100 {
		t.Fatalf("last tick = %+v, want doneBytes %d / percent 100", last, len(content))
	}
}

func TestReadAndWriteLocalFileForEditor(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "app.conf")
	if err := os.WriteFile(filePath, []byte("key=value\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	content, err := svc.ReadLocalFile(filePath)
	if err != nil {
		t.Fatalf("ReadLocalFile() error = %v", err)
	}
	if !content.Editable || content.Content != "key=value\n" {
		t.Fatalf("ReadLocalFile() = %+v, want editable key=value", content)
	}

	if _, err := svc.WriteLocalFile(filePath, "key=changed\n"); err != nil {
		t.Fatalf("WriteLocalFile() error = %v", err)
	}
	updated, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(updated) != "key=changed\n" {
		t.Fatalf("file content = %q, want key=changed", updated)
	}

	// 目录不可编辑
	if _, err := svc.ReadLocalFile(dir); err == nil {
		t.Fatalf("ReadLocalFile(dir) expected error, got nil")
	}

	// 二进制文件返回不可编辑而不是报错
	binPath := filepath.Join(dir, "blob.bin")
	if err := os.WriteFile(binPath, []byte{0x89, 0x50, 0x00, 0x4e}, 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	binary, err := svc.ReadLocalFile(binPath)
	if err != nil {
		t.Fatalf("ReadLocalFile(binary) error = %v", err)
	}
	if binary.Editable || binary.Reason == "" {
		t.Fatalf("binary content = %+v, want editable=false with reason", binary)
	}
}

func TestReadAndWriteRemoteFileForEditor(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	if err := store.AddHost(model.Host{ID: "host-edit", Address: "example.com", Username: "zen"}, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	content := []byte("server {\n listen 80;\n}\n")
	sftp := &stubSFTPClient{
		cwd:       "/home/zen",
		realPaths: map[string]string{"/etc/nginx/site.conf": "/etc/nginx/site.conf"},
		stats: map[string]os.FileInfo{
			"/etc/nginx/site.conf": stubFileInfo{name: "site.conf", mode: 0o644, size: int64(len(content)), modTime: time.Unix(1710000000, 0)},
		},
		files: map[string][]byte{"/etc/nginx/site.conf": content},
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{sftp: sftp}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	loaded, err := svc.ReadRemoteFile("host-edit", "/etc/nginx/site.conf")
	if err != nil {
		t.Fatalf("ReadRemoteFile() error = %v", err)
	}
	if !loaded.Editable || loaded.Content != string(content) {
		t.Fatalf("ReadRemoteFile() = %+v, want editable content", loaded)
	}

	if _, err := svc.WriteRemoteFile("host-edit", "/etc/nginx/site.conf", "server {\n listen 443;\n}\n"); err != nil {
		t.Fatalf("WriteRemoteFile() error = %v", err)
	}
	if got := string(sftp.files["/etc/nginx/site.conf"]); got != "server {\n listen 443;\n}\n" {
		t.Fatalf("remote content = %q, want updated payload", got)
	}
}

func TestReadRemoteFileRejectsOversizedFile(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	if err := store.AddHost(model.Host{ID: "host-big", Address: "example.com", Username: "zen"}, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	huge := stubFileInfo{name: "huge.log", mode: 0o644, size: 3 << 20, modTime: time.Unix(1710000000, 0)}
	sftp := &stubSFTPClient{
		cwd:       "/home/zen",
		realPaths: map[string]string{"/var/huge.log": "/var/huge.log"},
		stats:     map[string]os.FileInfo{"/var/huge.log": huge},
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{sftp: sftp}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	if _, err := svc.ReadRemoteFile("host-big", "/var/huge.log"); err == nil {
		t.Fatalf("ReadRemoteFile(oversized) expected error, got nil")
	}
}

func TestWriteLocalFileCreatesBackupByDefault(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "app.conf")
	if err := os.WriteFile(filePath, []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if created, err := svc.WriteLocalFile(filePath, "v2\n"); err != nil || !created {
		t.Fatalf("WriteLocalFile() = (created=%v, err=%v), want created=true", created, err)
	}

	bak, err := os.ReadFile(filePath + ".bak")
	if err != nil {
		t.Fatalf("ReadFile(backup) error = %v", err)
	}
	if string(bak) != "v1\n" {
		t.Fatalf("backup content = %q, want v1", bak)
	}

	// 再次保存：.bak 覆盖为本次保存前的内容
	if created, err := svc.WriteLocalFile(filePath, "v3\n"); err != nil || !created {
		t.Fatalf("WriteLocalFile() = (created=%v, err=%v), want created=true", created, err)
	}
	bak, err = os.ReadFile(filePath + ".bak")
	if err != nil {
		t.Fatalf("ReadFile(backup) error = %v", err)
	}
	if string(bak) != "v2\n" {
		t.Fatalf("backup content = %q, want v2", bak)
	}

	// 关闭偏好后不再备份
	if err := store.SaveAppPreferences(model.AppPreferences{DisableEditorBackup: true}); err != nil {
		t.Fatalf("SaveAppPreferences() error = %v", err)
	}
	created, err := svc.WriteLocalFile(filePath, "v4\n")
	if err != nil {
		t.Fatalf("WriteLocalFile() error = %v", err)
	}
	if created {
		t.Fatalf("WriteLocalFile() created backup despite preference disabled")
	}
	bak, err = os.ReadFile(filePath + ".bak")
	if err != nil {
		t.Fatalf("ReadFile(backup) error = %v", err)
	}
	if string(bak) != "v2\n" {
		t.Fatalf("backup content = %q, want untouched v2", bak)
	}
}

func TestWriteRemoteFileCreatesBackupByDefault(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.AddHost(model.Host{ID: "host-bak", Address: "example.com", Username: "zen"}, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	original := []byte("listen 80;\n")
	sftp := &stubSFTPClient{
		cwd:       "/home/zen",
		realPaths: map[string]string{"/etc/nginx/site.conf": "/etc/nginx/site.conf"},
		stats: map[string]os.FileInfo{
			"/etc/nginx/site.conf": stubFileInfo{name: "site.conf", mode: 0o644, size: int64(len(original)), modTime: time.Unix(1710000000, 0)},
		},
		files: map[string][]byte{"/etc/nginx/site.conf": original},
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{sftp: sftp}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	created, err := svc.WriteRemoteFile("host-bak", "/etc/nginx/site.conf", "listen 443;\n")
	if err != nil {
		t.Fatalf("WriteRemoteFile() error = %v", err)
	}
	if !created {
		t.Fatalf("WriteRemoteFile() created=false, want true")
	}

	bak, ok := sftp.files["/etc/nginx/site.conf.bak"]
	if !ok {
		t.Fatalf("backup file missing on remote")
	}
	if string(bak) != string(original) {
		t.Fatalf("backup content = %q, want %q", bak, original)
	}
	if got := string(sftp.files["/etc/nginx/site.conf"]); got != "listen 443;\n" {
		t.Fatalf("file content = %q, want updated payload", got)
	}

	// 关闭偏好后不再备份
	if err := store.SaveAppPreferences(model.AppPreferences{DisableEditorBackup: true}); err != nil {
		t.Fatalf("SaveAppPreferences() error = %v", err)
	}
	created, err = svc.WriteRemoteFile("host-bak", "/etc/nginx/site.conf", "listen 8080;\n")
	if err != nil {
		t.Fatalf("WriteRemoteFile() error = %v", err)
	}
	if created {
		t.Fatalf("WriteRemoteFile() created backup despite preference disabled")
	}
	if got := string(sftp.files["/etc/nginx/site.conf.bak"]); got != string(original) {
		t.Fatalf("backup content = %q, want untouched %q", got, original)
	}
}

func TestForwardOutputPreservesSplitMultibyteChars(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	// 模拟 btop 输出：大量 3 字节 UTF-8 字符（braille 图形）+ 控制序列
	payload := "\x1b[?2026h"
	for i := 0; i < 3000; i++ {
		payload += "\u28ff\u28c0\u2588\u2593"
	}
	payload += "\x1b[?2026l"

	var mu sync.Mutex
	var chunks []string
	svc.SetEventEmitter(func(event string, data any) {
		if event != "term:data:sess-test" {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		chunks = append(chunks, data.(string))
	})

	pr, pw := io.Pipe()
	done := make(chan struct{})
	go func() {
		svc.forwardOutput("sess-test", "", pr)
		close(done)
	}()

	// 以故意劈开多字节字符的偏移分块写入（模拟 Read 边界落在字符中间）
	go func() {
		for i := 0; i < len(payload); i += 5 {
			end := i + 5
			if end > len(payload) {
				end = len(payload)
			}
			if _, err := pw.Write([]byte(payload[i:end])); err != nil {
				return
			}
		}
		_ = pw.Close()
	}()
	<-done

	mu.Lock()
	defer mu.Unlock()
	for i, chunk := range chunks {
		if !utf8.ValidString(chunk) {
			t.Fatalf("chunk %d contains invalid UTF-8 (split multibyte char leaked to JSON layer): %q", i, chunk)
		}
	}
	rebuilt := strings.Join(chunks, "")
	if rebuilt != payload {
		t.Fatalf("rebuilt output differs: len(rebuilt)=%d len(payload)=%d", len(rebuilt), len(payload))
	}
	if strings.ContainsRune(rebuilt, '\uFFFD') {
		t.Fatalf("rebuilt output contains U+FFFD replacement chars")
	}
}
