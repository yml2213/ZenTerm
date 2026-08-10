package service

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
)

func TestEncryptedSyncSnapshotRoundTripAcrossStores(t *testing.T) {
	sourceStore, err := db.NewStore(filepath.Join(t.TempDir(), "source.zen"))
	if err != nil {
		t.Fatalf("NewStore(source) error = %v", err)
	}
	sourceVault := security.NewVault()
	sourceSvc, err := New(sourceStore, sourceVault)
	if err != nil {
		t.Fatalf("New(source) error = %v", err)
	}
	if err := sourceSvc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault(source) error = %v", err)
	}
	host := model.Host{ID: "host-sync", Name: "Synced", Address: "sync.example.com", Port: 22, Username: "root"}
	if err := sourceStore.AddHost(host, model.Identity{Password: "secret"}, sourceVault); err != nil {
		t.Fatalf("AddHost(source) error = %v", err)
	}

	envelope, sourceHash, err := sourceSvc.BuildEncryptedSyncSnapshot("device-a", "办公室 Mac", false)
	if err != nil {
		t.Fatalf("BuildEncryptedSyncSnapshot() error = %v", err)
	}
	if len(envelope) == 0 || sourceHash == "" {
		t.Fatalf("snapshot envelope length = %d hash = %q, want populated values", len(envelope), sourceHash)
	}

	targetStore, err := db.NewStore(filepath.Join(t.TempDir(), "target.zen"))
	if err != nil {
		t.Fatalf("NewStore(target) error = %v", err)
	}
	targetVault := security.NewVault()
	targetSvc, err := New(targetStore, targetVault)
	if err != nil {
		t.Fatalf("New(target) error = %v", err)
	}
	if err := targetSvc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault(target) error = %v", err)
	}
	if err := targetStore.AddHost(
		model.Host{ID: "local-only", Address: "local.example.com", Port: 22, Username: "root"},
		model.Identity{Password: "local"},
		targetVault,
	); err != nil {
		t.Fatalf("AddHost(target) error = %v", err)
	}

	deviceID, deviceName, targetHash, err := targetSvc.ApplyEncryptedSyncSnapshot("master-password", envelope)
	if err != nil {
		t.Fatalf("ApplyEncryptedSyncSnapshot() error = %v", err)
	}
	if deviceID != "device-a" {
		t.Fatalf("remote device id = %q, want device-a", deviceID)
	}
	if deviceName != "办公室 Mac" {
		t.Fatalf("remote device name = %q, want 办公室 Mac", deviceName)
	}
	if targetHash != sourceHash {
		t.Fatalf("target hash = %q, want %q", targetHash, sourceHash)
	}

	hosts, err := targetStore.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts(target) error = %v", err)
	}
	if len(hosts) != 1 || hosts[0].ID != host.ID {
		t.Fatalf("target hosts = %#v, want only synced host", hosts)
	}
	identity, err := targetStore.GetIdentity(host.ID, targetVault)
	if err != nil {
		t.Fatalf("GetIdentity(target) error = %v", err)
	}
	if identity.Password != "secret" {
		t.Fatalf("target identity password = %q, want secret", identity.Password)
	}
}

func TestEncryptedSyncSnapshotRoundTripWithNonDefaultKDF(t *testing.T) {
	sourceStore, err := db.NewStore(filepath.Join(t.TempDir(), "source.zen"))
	if err != nil {
		t.Fatalf("NewStore(source) error = %v", err)
	}
	sourceVault := security.NewVault()
	if err := sourceVault.SetParams(security.Argon2Params{Time: 1, Memory: 8 * 1024, Threads: 1, KeyLen: 32}); err != nil {
		t.Fatalf("SetParams(source) error = %v", err)
	}
	sourceSvc, err := New(sourceStore, sourceVault)
	if err != nil {
		t.Fatalf("New(source) error = %v", err)
	}
	if err := sourceSvc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault(source) error = %v", err)
	}

	envelope, _, err := sourceSvc.BuildEncryptedSyncSnapshot("device-kdf", "KDF device", false)
	if err != nil {
		t.Fatalf("BuildEncryptedSyncSnapshot() error = %v", err)
	}

	var decoded SyncSnapshotEnvelope
	if err := json.Unmarshal(envelope, &decoded); err != nil {
		t.Fatalf("json.Unmarshal(envelope) error = %v", err)
	}
	if decoded.KDF.Memory != 8*1024 || decoded.KDF.Threads != 1 {
		t.Fatalf("envelope KDF = %#v, want source parameters", decoded.KDF)
	}

	targetStore, err := db.NewStore(filepath.Join(t.TempDir(), "target.zen"))
	if err != nil {
		t.Fatalf("NewStore(target) error = %v", err)
	}
	targetVault := security.NewVault()
	targetSvc, err := New(targetStore, targetVault)
	if err != nil {
		t.Fatalf("New(target) error = %v", err)
	}
	if err := targetSvc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault(target) error = %v", err)
	}
	if _, _, _, err := targetSvc.ApplyEncryptedSyncSnapshot("master-password", envelope); err != nil {
		t.Fatalf("ApplyEncryptedSyncSnapshot() error = %v", err)
	}
	if got := targetVault.Params(); got.Memory != 8*1024 || got.Threads != 1 {
		t.Fatalf("target vault KDF = %#v, want source parameters", got)
	}
}

// TestApplyEncryptedSyncSnapshotCreatesBackup 验证：导入远端快照前会自动在 backups/ 目录创建本地数据备份，避免误覆盖 / verifies that importing a remote snapshot first creates a local backup under backups/, guarding against accidental overwrite.
func TestApplyEncryptedSyncSnapshotCreatesBackup(t *testing.T) {
	sourceStore, err := db.NewStore(filepath.Join(t.TempDir(), "source.zen"))
	if err != nil {
		t.Fatalf("NewStore(source) error = %v", err)
	}
	sourceVault := security.NewVault()
	sourceSvc, err := New(sourceStore, sourceVault)
	if err != nil {
		t.Fatalf("New(source) error = %v", err)
	}
	if err := sourceSvc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault(source) error = %v", err)
	}
	if err := sourceStore.AddHost(
		model.Host{ID: "host-sync", Address: "sync.example.com", Port: 22, Username: "root"},
		model.Identity{Password: "remote-secret"},
		sourceVault,
	); err != nil {
		t.Fatalf("AddHost(source) error = %v", err)
	}

	envelope, _, err := sourceSvc.BuildEncryptedSyncSnapshot("device-a", "Mac", false)
	if err != nil {
		t.Fatalf("BuildEncryptedSyncSnapshot() error = %v", err)
	}

	targetDir := t.TempDir()
	targetPath := filepath.Join(targetDir, "config.zen")
	targetStore, err := db.NewStore(targetPath)
	if err != nil {
		t.Fatalf("NewStore(target) error = %v", err)
	}
	targetVault := security.NewVault()
	targetSvc, err := New(targetStore, targetVault)
	if err != nil {
		t.Fatalf("New(target) error = %v", err)
	}
	if err := targetSvc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault(target) error = %v", err)
	}
	// 写入一条本地独有数据，导入后应该被远端快照覆盖；备份里应该仍能找到这条本地数据 / seed a local-only host that the import will overwrite; the backup must still contain it.
	if err := targetStore.AddHost(
		model.Host{ID: "local-only", Address: "local.example.com", Port: 22, Username: "root"},
		model.Identity{Password: "local"},
		targetVault,
	); err != nil {
		t.Fatalf("AddHost(target) error = %v", err)
	}

	if _, _, _, err := targetSvc.ApplyEncryptedSyncSnapshot("master-password", envelope); err != nil {
		t.Fatalf("ApplyEncryptedSyncSnapshot() error = %v", err)
	}

	backupDir := filepath.Join(targetDir, "backups")
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		t.Fatalf("ReadDir(backups) error = %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one backup file under backups/, found none")
	}

	// 备份内容应包含被覆盖前的本地数据，证明备份真实落盘 / the backup must contain the pre-import local data, proving it is a real on-disk copy.
	var foundLocal bool
	for _, entry := range entries {
		payload, err := os.ReadFile(filepath.Join(backupDir, entry.Name()))
		if err != nil {
			t.Fatalf("ReadFile(backup) error = %v", err)
		}
		if bytes.Contains(payload, []byte("local-only")) {
			foundLocal = true
			break
		}
	}
	if !foundLocal {
		t.Fatal("no backup file contains the overwritten local-only host")
	}
}
