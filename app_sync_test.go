package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBackupStoreBeforeSyncPullCopiesCurrentStore(t *testing.T) {
	dir := t.TempDir()
	storePath := filepath.Join(dir, "config.zen")
	payload := []byte(`{"version":1}`)
	if err := os.WriteFile(storePath, payload, 0o600); err != nil {
		t.Fatalf("WriteFile(store) error = %v", err)
	}

	backupPath, err := backupStoreBeforeSyncPull(storePath, time.Date(2026, 5, 30, 9, 45, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("backupStoreBeforeSyncPull() error = %v", err)
	}
	if backupPath != filepath.Join(dir, "backups", "config-20260530-094500.000000000.zen") {
		t.Fatalf("backupPath = %q", backupPath)
	}

	backupPayload, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("ReadFile(backup) error = %v", err)
	}
	if string(backupPayload) != string(payload) {
		t.Fatalf("backup payload = %q, want %q", backupPayload, payload)
	}
}

func TestBackupStoreBeforeSyncPullIgnoresMissingStore(t *testing.T) {
	backupPath, err := backupStoreBeforeSyncPull(filepath.Join(t.TempDir(), "missing.zen"), time.Now())
	if err != nil {
		t.Fatalf("backupStoreBeforeSyncPull() error = %v", err)
	}
	if backupPath != "" {
		t.Fatalf("backupPath = %q, want empty", backupPath)
	}
}
