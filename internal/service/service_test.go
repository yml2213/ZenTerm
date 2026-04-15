package service

import (
	"path/filepath"
	"testing"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
)

func TestUnlockVaultInitializesVaultFromStoreSalt(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	svc, err := New(store, vault)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := svc.UnlockVault("master-password"); err != nil {
		t.Fatalf("UnlockVault() error = %v", err)
	}

	payload, err := vault.EncryptString("works-after-unlock")
	if err != nil {
		t.Fatalf("EncryptString() error = %v", err)
	}

	plaintext, err := vault.DecryptString(payload)
	if err != nil {
		t.Fatalf("DecryptString() error = %v", err)
	}
	if plaintext != "works-after-unlock" {
		t.Fatalf("DecryptString() = %q, want %q", plaintext, "works-after-unlock")
	}
}

func TestAddHostRequiresUnlockedVault(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	err = svc.AddHost(model.Host{ID: "host-1"}, model.Identity{Password: "secret"})
	if err == nil {
		t.Fatal("AddHost() error = nil, want non-nil")
	}
}
