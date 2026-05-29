package service

import (
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

	envelope, sourceHash, err := sourceSvc.BuildEncryptedSyncSnapshot("device-a", false)
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

	deviceID, targetHash, err := targetSvc.ApplyEncryptedSyncSnapshot("master-password", envelope)
	if err != nil {
		t.Fatalf("ApplyEncryptedSyncSnapshot() error = %v", err)
	}
	if deviceID != "device-a" {
		t.Fatalf("remote device id = %q, want device-a", deviceID)
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
