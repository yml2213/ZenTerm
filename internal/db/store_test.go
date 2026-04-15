package db

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

func TestStoreAddHostEncryptsIdentity(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-1",
		Name:     "Production",
		Address:  "prod.example.com",
		Port:     22,
		Username: "root",
	}
	identity := model.Identity{
		Password:   "super-secret",
		PrivateKey: "PRIVATE KEY",
	}

	if err := store.AddHost(host, identity, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	bytes, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}

	content := string(bytes)
	if strings.Contains(content, identity.Password) {
		t.Fatal("store file contains plaintext password")
	}
	if strings.Contains(content, identity.PrivateKey) {
		t.Fatal("store file contains plaintext private key")
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 1 {
		t.Fatalf("len(GetHosts()) = %d, want 1", len(hosts))
	}
	if hosts[0] != host {
		t.Fatalf("GetHosts()[0] = %#v, want %#v", hosts[0], host)
	}

	loadedIdentity, err := store.GetIdentity(host.ID, vault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
}

func TestStoreEnsureSaltPersistsAcrossRestarts(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	first, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	second, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	saltA, err := first.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	saltB, err := second.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}

	if string(saltA) != string(saltB) {
		t.Fatal("EnsureSalt() returned different salts for the same store")
	}
}

func TestStoreGetHostReturnsRequestedHost(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-lookup",
		Name:     "Lookup",
		Address:  "lookup.example.com",
		Port:     22,
		Username: "zen",
	}

	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	got, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}

	if got != host {
		t.Fatalf("GetHost() = %#v, want %#v", got, host)
	}
}

func TestStoreUpdateKnownHostsPreservesIdentity(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-known-hosts",
		Name:     "Known Hosts",
		Address:  "known.example.com",
		Port:     22,
		Username: "zen",
	}
	identity := model.Identity{
		Password: "secret-password",
	}

	if err := store.AddHost(host, identity, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	const knownHosts = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKnownHostKeyValue"
	if err := store.UpdateKnownHosts(host.ID, knownHosts); err != nil {
		t.Fatalf("UpdateKnownHosts() error = %v", err)
	}

	updatedHost, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if updatedHost.KnownHosts != knownHosts {
		t.Fatalf("GetHost().KnownHosts = %q, want %q", updatedHost.KnownHosts, knownHosts)
	}

	loadedIdentity, err := store.GetIdentity(host.ID, vault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
}

func TestStoreDeleteHostRemovesHostAndIdentity(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-delete",
		Name:     "Delete Me",
		Address:  "delete.example.com",
		Port:     22,
		Username: "zen",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := store.DeleteHost(host.ID); err != nil {
		t.Fatalf("DeleteHost() error = %v", err)
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("len(GetHosts()) = %d, want 0", len(hosts))
	}

	_, err = store.GetIdentity(host.ID, vault)
	if err == nil {
		t.Fatal("GetIdentity() error = nil, want host not found")
	}
	if err != ErrHostNotFound {
		t.Fatalf("GetIdentity() error = %v, want %v", err, ErrHostNotFound)
	}
}

func TestStoreVerifyOrInitVaultCheckRejectsWrongPassword(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	store, err := NewStore(path)
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

	if err := store.VerifyOrInitVaultCheck(vault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}
	if err := store.AddHost(
		model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
		vault,
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	reopened, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	wrongVault := security.NewVault()
	salt, err = reopened.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := wrongVault.Unlock("wrong-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	err = reopened.VerifyOrInitVaultCheck(wrongVault)
	if err != security.ErrInvalidMasterPassword {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v, want %v", err, security.ErrInvalidMasterPassword)
	}
}

func TestStoreIsVaultInitializedTracksLifecycle(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	initialized, err := store.IsVaultInitialized()
	if err != nil {
		t.Fatalf("IsVaultInitialized() error = %v", err)
	}
	if initialized {
		t.Fatal("IsVaultInitialized() = true, want false")
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.VerifyOrInitVaultCheck(vault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}

	initialized, err = store.IsVaultInitialized()
	if err != nil {
		t.Fatalf("IsVaultInitialized() error = %v", err)
	}
	if !initialized {
		t.Fatal("IsVaultInitialized() = false, want true")
	}
}

func TestStoreRekeyVaultMigratesSecretsToNewPassword(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")
	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	currentVault := security.NewVault()
	currentSalt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := currentVault.Unlock("master-password", currentSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.VerifyOrInitVaultCheck(currentVault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}

	host := model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"}
	identity := model.Identity{Password: "secret", PrivateKey: "PRIVATE KEY"}
	if err := store.AddHost(host, identity, currentVault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	nextSalt, err := security.NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}
	nextVault := security.NewVault()
	if err := nextVault.Unlock("next-password", nextSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	if err := store.RekeyVault(currentVault, nextVault, nextSalt); err != nil {
		t.Fatalf("RekeyVault() error = %v", err)
	}

	reopened, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	wrongVault := security.NewVault()
	reopenedSalt, err := reopened.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := wrongVault.Unlock("master-password", reopenedSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := reopened.VerifyOrInitVaultCheck(wrongVault); err != security.ErrInvalidMasterPassword {
		t.Fatalf("VerifyOrInitVaultCheck(old) error = %v, want %v", err, security.ErrInvalidMasterPassword)
	}

	verifiedVault := security.NewVault()
	if err := verifiedVault.Unlock("next-password", reopenedSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := reopened.VerifyOrInitVaultCheck(verifiedVault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck(new) error = %v", err)
	}

	loadedIdentity, err := reopened.GetIdentity(host.ID, verifiedVault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
}

func TestStoreResetVaultClearsHostsAndInitialization(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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
	if err := store.VerifyOrInitVaultCheck(vault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}
	if err := store.AddHost(
		model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
		vault,
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := store.ResetVault(); err != nil {
		t.Fatalf("ResetVault() error = %v", err)
	}

	initialized, err := store.IsVaultInitialized()
	if err != nil {
		t.Fatalf("IsVaultInitialized() error = %v", err)
	}
	if initialized {
		t.Fatal("IsVaultInitialized() = true, want false")
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("len(GetHosts()) = %d, want 0", len(hosts))
	}
}

func TestStoreSaveAndLoadWindowState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	expected := model.WindowState{
		Width:     1520,
		Height:    980,
		Maximised: true,
	}
	if err := store.SaveWindowState(expected); err != nil {
		t.Fatalf("SaveWindowState() error = %v", err)
	}

	reopened, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	state, err := reopened.LoadWindowState()
	if err != nil {
		t.Fatalf("LoadWindowState() error = %v", err)
	}
	if state != expected {
		t.Fatalf("LoadWindowState() = %#v, want %#v", state, expected)
	}
}
