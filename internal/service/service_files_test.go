package service

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
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

	result, err := svc.UploadFile(host.ID, localPath, "/srv/project", false)
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

	result, err := svc.DownloadFile(host.ID, "/srv/app.log", dir, false)
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

	result, err := svc.UploadFile(host.ID, localPath, "/srv/project", true)
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

	result, err := svc.DownloadFile(host.ID, "/srv/app.log", dir, true)
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
