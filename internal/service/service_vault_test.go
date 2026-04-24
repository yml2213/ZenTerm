package service

import (
	"errors"
	"path/filepath"
	"testing"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
)

func TestInitializeVaultInitializesVaultFromStoreSalt(t *testing.T) {
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

	if err := svc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault() error = %v", err)
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

func TestUnlockVaultRequiresInitializedVault(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	err = svc.UnlockVault("master-password")
	if !errors.Is(err, ErrVaultNotInitialized) {
		t.Fatalf("UnlockVault() error = %v, want %v", err, ErrVaultNotInitialized)
	}
}

func TestUnlockVaultRejectsInvalidMasterPassword(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	bootstrapVault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := bootstrapVault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.VerifyOrInitVaultCheck(bootstrapVault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}
	if err := store.AddHost(
		model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
		bootstrapVault,
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	err = svc.UnlockVault("wrong-password")
	if !errors.Is(err, security.ErrInvalidMasterPassword) {
		t.Fatalf("UnlockVault() error = %v, want %v", err, security.ErrInvalidMasterPassword)
	}
}

func TestChangeMasterPasswordRekeysStoredSecrets(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := svc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault() error = %v", err)
	}

	host := model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"}
	identity := model.Identity{Password: "secret"}
	if err := svc.AddHost(host, identity); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := svc.ChangeMasterPassword("master-password", "next-password"); err != nil {
		t.Fatalf("ChangeMasterPassword() error = %v", err)
	}

	reopened, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := reopened.UnlockVault("master-password"); !errors.Is(err, security.ErrInvalidMasterPassword) {
		t.Fatalf("UnlockVault(old) error = %v, want %v", err, security.ErrInvalidMasterPassword)
	}
	if err := reopened.UnlockVault("next-password"); err != nil {
		t.Fatalf("UnlockVault(new) error = %v", err)
	}

	loadedIdentity, err := reopened.store.GetIdentity(host.ID, reopened.vault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
}

func TestResetVaultClearsInitializationAndHosts(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	if err := svc.InitializeVault("master-password"); err != nil {
		t.Fatalf("InitializeVault() error = %v", err)
	}
	if err := svc.AddHost(
		model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if _, err := svc.GenerateCredential("reset-cred", "ed25519", 0, ""); err != nil {
		t.Fatalf("GenerateCredential() error = %v", err)
	}

	if err := svc.ResetVault(); err != nil {
		t.Fatalf("ResetVault() error = %v", err)
	}

	status, err := svc.GetVaultStatus()
	if err != nil {
		t.Fatalf("GetVaultStatus() error = %v", err)
	}
	if status.Initialized || status.Unlocked {
		t.Fatalf("GetVaultStatus() = %#v, want uninitialized locked vault", status)
	}

	hosts, err := svc.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("len(GetHosts()) = %d, want 0", len(hosts))
	}

	creds, err := svc.GetCredentials()
	if err != nil {
		t.Fatalf("GetCredentials() error = %v", err)
	}
	if len(creds) != 0 {
		t.Fatalf("len(GetCredentials()) = %d, want 0", len(creds))
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
