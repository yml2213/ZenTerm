package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zenterm/internal/db"
	"zenterm/internal/model"
)

func TestAppExportImportAndRestoreData(t *testing.T) {
	const password = "master-password"
	source, err := NewApp(filepath.Join(t.TempDir(), "source", "config.zen"))
	if err != nil {
		t.Fatalf("NewApp(source) error = %v", err)
	}
	if err := source.InitializeVaultWithPreferences(password, false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences(source) error = %v", err)
	}
	wantHost := Host{ID: "source-host", Name: "Source", Address: "source.example", Port: 22, Username: "root"}
	if err := source.AddHost(wantHost, model.Identity{Password: "source-secret"}); err != nil {
		t.Fatalf("AddHost(source) error = %v", err)
	}

	exportPath := filepath.Join(t.TempDir(), "export", "zenterm.zen")
	if err := source.ExportDataToPath(exportPath); err != nil {
		t.Fatalf("ExportDataToPath() error = %v", err)
	}
	if info, err := os.Stat(exportPath); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("export file info = (%v, %v), want mode 0600", info, err)
	}

	targetRoot := t.TempDir()
	target, err := NewApp(filepath.Join(targetRoot, "config.zen"))
	if err != nil {
		t.Fatalf("NewApp(target) error = %v", err)
	}
	if err := target.ImportDataFromPath(exportPath, password); err != nil {
		t.Fatalf("ImportDataFromPath() error = %v", err)
	}
	hosts, err := target.ListHosts()
	if err != nil || len(hosts) != 1 || hosts[0].ID != wantHost.ID {
		t.Fatalf("ListHosts() = (%#v, %v), want imported host", hosts, err)
	}
	secret, err := target.GetHostSecret(wantHost.ID)
	if err != nil || secret.Password != "source-secret" {
		t.Fatalf("GetHostSecret() = (%#v, %v), want imported secret", secret, err)
	}

	backupDir := filepath.Join(targetRoot, "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		t.Fatalf("MkdirAll(backups) error = %v", err)
	}
	restorePath := filepath.Join(backupDir, "manual-export.zen")
	payload, err := os.ReadFile(exportPath)
	if err != nil {
		t.Fatalf("ReadFile(export) error = %v", err)
	}
	if err := os.WriteFile(restorePath, payload, 0o600); err != nil {
		t.Fatalf("WriteFile(restore) error = %v", err)
	}
	if err := target.AddHost(Host{ID: "extra", Address: "extra.example", Port: 22, Username: "root"}, model.Identity{Password: "extra"}); err != nil {
		t.Fatalf("AddHost(extra) error = %v", err)
	}
	if err := target.RestoreBackup(restorePath, password); err != nil {
		t.Fatalf("RestoreBackup() error = %v", err)
	}
	hosts, err = target.ListHosts()
	if err != nil || len(hosts) != 1 || hosts[0].ID != wantHost.ID {
		t.Fatalf("ListHosts() after restore = (%#v, %v), want source snapshot", hosts, err)
	}

	backups, err := target.ListBackups()
	if err != nil || len(backups) == 0 {
		t.Fatalf("ListBackups() = (%#v, %v), want at least one backup", backups, err)
	}
	if err := target.DeleteBackup(restorePath); err != nil {
		t.Fatalf("DeleteBackup() error = %v", err)
	}
	if _, err := os.Stat(restorePath); !os.IsNotExist(err) {
		t.Fatalf("Stat(deleted backup) error = %v, want not exist", err)
	}
}

func TestAppDataValidationAndStats(t *testing.T) {
	root := t.TempDir()
	app, err := NewApp(filepath.Join(root, "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}
	if err := app.AddHost(Host{ID: "host-1", Address: "example.com", Port: 22, Username: "root"}, model.Identity{Password: "secret"}); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}
	stats, err := app.GetDataStats()
	if err != nil || stats.HostCount != 1 || stats.FileSize == 0 || stats.StorePath != filepath.Join(root, "config.zen") {
		t.Fatalf("GetDataStats() = (%#v, %v)", stats, err)
	}

	outside := filepath.Join(root, "backups-elsewhere", "backup.zen")
	if err := app.DeleteBackup(outside); err == nil || !strings.Contains(err.Error(), "not in backups directory") {
		t.Fatalf("DeleteBackup(outside) error = %v, want path rejection", err)
	}
	if err := app.RestoreBackup(outside, "master-password"); err == nil || !strings.Contains(err.Error(), "not in backups directory") {
		t.Fatalf("RestoreBackup(outside) error = %v, want path rejection", err)
	}
}

func TestLoadSavedWindowState(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "config.zen")
	store, err := db.NewStore(storePath)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	want := model.WindowState{Width: 1360, Height: 840, Maximised: true}
	if err := store.SaveWindowState(want); err != nil {
		t.Fatalf("SaveWindowState() error = %v", err)
	}
	got, err := LoadSavedWindowState(storePath)
	if err != nil || got != want {
		t.Fatalf("LoadSavedWindowState() = (%#v, %v), want %#v", got, err, want)
	}
}
