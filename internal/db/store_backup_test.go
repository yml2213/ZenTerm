package db

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestBackupCurrentProducesUniquePathPerCall 验证：连续两次 BackupCurrent 即使落在同一秒也不会覆盖上一份备份（纳秒时间戳 + 随机后缀）/ verifies that back-to-back BackupCurrent calls in the same second never overwrite each other (nanosecond timestamp + random suffix).
func TestBackupCurrentProducesUniquePathPerCall(t *testing.T) {
	dir := t.TempDir()
	storePath := filepath.Join(dir, "config.zen")
	if err := os.WriteFile(storePath, []byte(`{"version":1}`), 0o600); err != nil {
		t.Fatalf("WriteFile(store) error = %v", err)
	}

	store, err := NewStore(storePath)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	first, err := store.BackupCurrent()
	if err != nil {
		t.Fatalf("BackupCurrent() #1 error = %v", err)
	}
	if first == "" {
		t.Fatal("BackupCurrent() #1 returned empty path")
	}
	second, err := store.BackupCurrent()
	if err != nil {
		t.Fatalf("BackupCurrent() #2 error = %v", err)
	}
	if second == "" {
		t.Fatal("BackupCurrent() #2 returned empty path")
	}
	if first == second {
		t.Fatalf("two consecutive backups share the same path: %q", first)
	}
}

// TestBackupCurrentSkipsMissingStore 验证：当前数据文件不存在时返回空路径且不报错 / verifies BackupCurrent returns an empty path with no error when the data file does not exist yet.
func TestBackupCurrentSkipsMissingStore(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	backupPath, err := store.BackupCurrent()
	if err != nil {
		t.Fatalf("BackupCurrent() on missing store error = %v", err)
	}
	if backupPath != "" {
		t.Fatalf("BackupCurrent() on missing store = %q, want empty", backupPath)
	}

	// 不应该创建 backups 目录 / must not create the backups directory either.
	if _, err := os.Stat(filepath.Join(dir, "backups")); !os.IsNotExist(err) {
		t.Fatalf("backups dir after missing-store backup: %v, want not-exist", err)
	}
}

// TestBackupCurrentCopiesContentAndUsesExpectedPrefix 验证：备份真实落盘、内容与源一致、文件名前缀符合约定 / verifies the backup lands on disk with matching content and the expected filename prefix.
func TestBackupCurrentCopiesContentAndUsesExpectedPrefix(t *testing.T) {
	dir := t.TempDir()
	storePath := filepath.Join(dir, "config.zen")
	payload := `{"version":1,"hosts":[]}`
	if err := os.WriteFile(storePath, []byte(payload), 0o600); err != nil {
		t.Fatalf("WriteFile(store) error = %v", err)
	}

	store, err := NewStore(storePath)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	backupPath, err := store.BackupCurrent()
	if err != nil {
		t.Fatalf("BackupCurrent() error = %v", err)
	}
	if !strings.HasPrefix(filepath.Base(backupPath), "config-") {
		t.Fatalf("backup filename = %q, want config- prefix", filepath.Base(backupPath))
	}
	if !strings.HasSuffix(backupPath, ".zen") {
		t.Fatalf("backup filename = %q, want .zen suffix", backupPath)
	}

	got, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("ReadFile(backup) error = %v", err)
	}
	if string(got) != payload {
		t.Fatalf("backup payload = %q, want %q", string(got), payload)
	}
}
