package db

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"zenterm/internal/model"
)

// TestStoreLoadLockedQuarantinesCorruptFile 验证：存储文件 JSON 损坏时，loadLocked 将坏字节隔离到 backups 并显式报错，避免 UI 静默显示空数据 / verifies that a corrupt store payload is quarantined to backups and loadLocked returns an explicit error instead of silently showing empty data.
func TestStoreLoadLockedQuarantinesCorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	// 写入损坏 JSON
	corrupt := []byte(`{"version": 1, "hosts": [ BROKEN JSON`)
	if err := os.WriteFile(path, corrupt, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	// 通过 GetHosts 触发 loadLocked；应显式提示损坏，而不是静默返回空数据
	_, err = store.GetHosts()
	if !errors.Is(err, ErrStoreCorrupt) {
		t.Fatalf("GetHosts() on corrupt store err = %v, want %v", err, ErrStoreCorrupt)
	}

	// 原损坏文件应已被移除
	if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("corrupt original file still exists, statErr = %v, want ErrNotExist", statErr)
	}

	// 损坏内容应被隔离到 backups
	backupDir := filepath.Join(dir, "backups")
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		t.Fatalf("ReadDir(backups) error = %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 quarantined file, got %d", len(entries))
	}
	got, err := os.ReadFile(filepath.Join(backupDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("read quarantined file error = %v", err)
	}
	if string(got) != string(corrupt) {
		t.Fatalf("quarantined content = %q, want %q", got, corrupt)
	}

	// 后续应能正常写入新数据：坏文件已移走，但第一次调用已经明确报错
	if err := store.CreateSessionLog(model.SessionLog{
		ID: "log-after-heal", HostID: "h", HostAddress: "10.0.0.1", HostPort: 22,
		SSHUsername: "root", Protocol: "ssh", Status: model.SessionLogStatusClosed,
	}); err != nil {
		t.Fatalf("CreateSessionLog() after self-heal error = %v", err)
	}
}

// TestStoreLoadLockedRejectsFutureVersion 验证：存储文件版本高于 currentVersion 时返回 ErrUnsupportedStoreVersion，拒绝降级解释未来格式 / verifies a store version newer than currentVersion is rejected rather than silently misread.
func TestStoreLoadLockedRejectsFutureVersion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	future := []byte(`{"version": 999, "hosts": [], "credentials": []}`)
	if err := os.WriteFile(path, future, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	_, err = store.GetHosts()
	if !errors.Is(err, ErrUnsupportedStoreVersion) {
		t.Fatalf("GetHosts() future-version err = %v, want ErrUnsupportedStoreVersion", err)
	}
}
