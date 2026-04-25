package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
	"zenterm/internal/service"
)

type stubVaultCredentialStore struct {
	password   string
	found      bool
	loadErr    error
	saveErr    error
	deleteErr  error
	deleteHits int
	status     model.KeychainStatus
}

func (s *stubVaultCredentialStore) Load() (string, bool, error) {
	return s.password, s.found, s.loadErr
}

func (s *stubVaultCredentialStore) Save(password string) error {
	if s.saveErr != nil {
		return s.saveErr
	}

	s.password = password
	s.found = true
	return nil
}

func (s *stubVaultCredentialStore) Delete() error {
	s.deleteHits++
	if s.deleteErr != nil {
		return s.deleteErr
	}

	s.password = ""
	s.found = false
	return nil
}

func (s *stubVaultCredentialStore) Status() model.KeychainStatus {
	return s.status
}

func TestAppUnlockAddHostAndListHosts(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	host := Host{
		ID:       "host-1",
		Name:     "Zen Server",
		Address:  "127.0.0.1",
		Port:     22,
		Username: "root",
	}

	identity := model.Identity{
		Password: "super-secret",
	}

	if err := app.AddHost(host, identity); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	hosts, err := app.ListHosts()
	if err != nil {
		t.Fatalf("ListHosts() error = %v", err)
	}

	if len(hosts) != 1 {
		t.Fatalf("len(ListHosts()) = %d, want 1", len(hosts))
	}

	if hosts[0] != host {
		t.Fatalf("ListHosts()[0] = %#v, want %#v", hosts[0], host)
	}
}

func TestAppUnlockWithPreferencesStoresPasswordForAutoUnlock(t *testing.T) {
	credentials := &stubVaultCredentialStore{}
	storePath := filepath.Join(t.TempDir(), "config.zen")

	app, err := newAppWithCredentialStore(storePath, credentials)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", true); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	if credentials.password != "master-password" || !credentials.found {
		t.Fatalf("credentials = %#v, want remembered master password", credentials)
	}

	secondApp, err := newAppWithCredentialStore(storePath, credentials)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	unlocked, err := secondApp.TryAutoUnlock()
	if err != nil {
		t.Fatalf("TryAutoUnlock() error = %v", err)
	}
	if !unlocked {
		t.Fatal("TryAutoUnlock() = false, want true")
	}
}

func TestAppTryAutoUnlockClearsInvalidRememberedPassword(t *testing.T) {
	storePath := filepath.Join(t.TempDir(), "config.zen")
	bootstrapCredentials := &stubVaultCredentialStore{}

	app, err := newAppWithCredentialStore(storePath, bootstrapCredentials)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	if err := app.AddHost(
		Host{ID: "host-1", Address: "127.0.0.1", Username: "root", Port: 22},
		model.Identity{Password: "secret"},
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	remembered := &stubVaultCredentialStore{
		password: "wrong-password",
		found:    true,
	}

	secondApp, err := newAppWithCredentialStore(storePath, remembered)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	unlocked, err := secondApp.TryAutoUnlock()
	if err != nil {
		t.Fatalf("TryAutoUnlock() error = %v", err)
	}
	if unlocked {
		t.Fatal("TryAutoUnlock() = true, want false")
	}
	if remembered.deleteHits != 1 || remembered.found {
		t.Fatalf("remembered credentials = %#v, want cleared entry", remembered)
	}
}

func TestAppPreservesVaultLockedErrorForFrontend(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	err = app.AddHost(Host{ID: "host-1"}, model.Identity{Password: "secret"})
	if !errors.Is(err, security.ErrVaultLocked) {
		t.Fatalf("AddHost() error = %v, want %v", err, security.ErrVaultLocked)
	}
}

func TestAppConnectPropagatesHostLookupError(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	_, err = app.Connect("missing-host")
	if !errors.Is(err, db.ErrHostNotFound) {
		t.Fatalf("Connect() error = %v, want %v", err, db.ErrHostNotFound)
	}
}

func TestAppSendInputPropagatesSessionError(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	err = app.SendInput("missing-session", "pwd\n")
	if !errors.Is(err, service.ErrSessionNotFound) {
		t.Fatalf("SendInput() error = %v, want %v", err, service.ErrSessionNotFound)
	}
}

func TestAppResizeTerminalValidatesSize(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	err = app.ResizeTerminal("missing-session", 0, 24)
	if !errors.Is(err, service.ErrInvalidTerminalSize) {
		t.Fatalf("ResizeTerminal() error = %v, want %v", err, service.ErrInvalidTerminalSize)
	}
}

func TestAppAcceptHostKeyPropagatesPendingError(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	err = app.AcceptHostKey("missing-host", "ssh-ed25519 AAAA")
	if !errors.Is(err, service.ErrHostKeyConfirmationNotFound) {
		t.Fatalf("AcceptHostKey() error = %v, want %v", err, service.ErrHostKeyConfirmationNotFound)
	}
}

func TestAppUpdateHostPreservesKnownErrorsForFrontend(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	err = app.UpdateHost(Host{ID: "missing-host"}, model.Identity{})
	if !errors.Is(err, db.ErrHostNotFound) {
		t.Fatalf("UpdateHost() error = %v, want %v", err, db.ErrHostNotFound)
	}
}

func TestAppDeleteHostRemovesSavedHost(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	host := Host{
		ID:       "host-delete",
		Name:     "To Delete",
		Address:  "127.0.0.1",
		Port:     22,
		Username: "root",
	}
	if err := app.AddHost(host, model.Identity{Password: "secret"}); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := app.DeleteHost(host.ID); err != nil {
		t.Fatalf("DeleteHost() error = %v", err)
	}

	hosts, err := app.ListHosts()
	if err != nil {
		t.Fatalf("ListHosts() error = %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("len(ListHosts()) = %d, want 0", len(hosts))
	}
}

func TestAppListSessionsReturnsServiceSnapshot(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	sessions := app.ListSessions()
	if len(sessions) != 0 {
		t.Fatalf("len(ListSessions()) = %d, want 0", len(sessions))
	}
}

func TestAppListLocalFilesReturnsDirectoryEntries(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "demo.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	listing, err := app.ListLocalFiles(dir)
	if err != nil {
		t.Fatalf("ListLocalFiles() error = %v", err)
	}
	if listing.Path != dir {
		t.Fatalf("listing.Path = %q, want %q", listing.Path, dir)
	}
	if len(listing.Entries) != 1 || listing.Entries[0].Name != "demo.txt" {
		t.Fatalf("listing.Entries = %#v, want demo.txt", listing.Entries)
	}
}

func TestAppGetVaultStatusReflectsInitialization(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	status, err := app.GetVaultStatus()
	if err != nil {
		t.Fatalf("GetVaultStatus() error = %v", err)
	}
	if status.Initialized || status.Unlocked {
		t.Fatalf("GetVaultStatus() = %#v, want uninitialized locked vault", status)
	}

	if err := app.InitializeVaultWithPreferences("master-password", false); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	status, err = app.GetVaultStatus()
	if err != nil {
		t.Fatalf("GetVaultStatus() error = %v", err)
	}
	if !status.Initialized || !status.Unlocked {
		t.Fatalf("GetVaultStatus() = %#v, want initialized unlocked vault", status)
	}
}

func TestAppGetKeychainStatusReflectsCredentialStore(t *testing.T) {
	credentials := &stubVaultCredentialStore{
		status: model.KeychainStatus{
			Supported: true,
			Saved:     true,
			Provider:  "测试钥匙串",
			Message:   "已保存主密码",
		},
	}
	app, err := newAppWithCredentialStore(filepath.Join(t.TempDir(), "config.zen"), credentials)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	status, err := app.GetKeychainStatus()
	if err != nil {
		t.Fatalf("GetKeychainStatus() error = %v", err)
	}
	if status != credentials.status {
		t.Fatalf("GetKeychainStatus() = %#v, want %#v", status, credentials.status)
	}
}

func TestAppChangeMasterPasswordUpdatesRememberedPassword(t *testing.T) {
	credentials := &stubVaultCredentialStore{}
	app, err := newAppWithCredentialStore(filepath.Join(t.TempDir(), "config.zen"), credentials)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", true); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}

	if err := app.ChangeMasterPassword("master-password", "next-password", true); err != nil {
		t.Fatalf("ChangeMasterPassword() error = %v", err)
	}

	if credentials.password != "next-password" || !credentials.found {
		t.Fatalf("credentials = %#v, want updated remembered password", credentials)
	}
}

func TestAppResetVaultClearsRememberedPassword(t *testing.T) {
	credentials := &stubVaultCredentialStore{}
	app, err := newAppWithCredentialStore(filepath.Join(t.TempDir(), "config.zen"), credentials)
	if err != nil {
		t.Fatalf("newAppWithCredentialStore() error = %v", err)
	}

	if err := app.InitializeVaultWithPreferences("master-password", true); err != nil {
		t.Fatalf("InitializeVaultWithPreferences() error = %v", err)
	}
	if err := app.AddHost(
		Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := app.ResetVault(); err != nil {
		t.Fatalf("ResetVault() error = %v", err)
	}

	status, err := app.GetVaultStatus()
	if err != nil {
		t.Fatalf("GetVaultStatus() error = %v", err)
	}
	if status.Initialized || status.Unlocked {
		t.Fatalf("GetVaultStatus() = %#v, want uninitialized locked vault", status)
	}
	if credentials.found || credentials.deleteHits == 0 {
		t.Fatalf("credentials = %#v, want cleared remembered password", credentials)
	}
}

func TestNormalizeFrontendErrorUnwrapsKnownBackendErrors(t *testing.T) {
	err := normalizeFrontendError(errors.Join(
		errors.New("wrapped"),
		db.ErrHostIDRequired,
	))

	if !errors.Is(err, db.ErrHostIDRequired) {
		t.Fatalf("normalizeFrontendError() error = %v, want %v", err, db.ErrHostIDRequired)
	}
}
