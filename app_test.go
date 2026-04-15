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

func TestAppUnlockAddHostAndListHosts(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.Unlock("master-password"); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{
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

func TestAppPreservesVaultLockedErrorForFrontend(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	err = app.AddHost(model.Host{ID: "host-1"}, model.Identity{Password: "secret"})
	if !errors.Is(err, security.ErrVaultLocked) {
		t.Fatalf("AddHost() error = %v, want %v", err, security.ErrVaultLocked)
	}
}

func TestAppConnectPropagatesHostLookupError(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.Unlock("master-password"); err != nil {
		t.Fatalf("Unlock() error = %v", err)
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

	if err := app.Unlock("master-password"); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	err = app.UpdateHost(model.Host{ID: "missing-host"}, model.Identity{})
	if !errors.Is(err, db.ErrHostNotFound) {
		t.Fatalf("UpdateHost() error = %v, want %v", err, db.ErrHostNotFound)
	}
}

func TestAppDeleteHostRemovesSavedHost(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	if err := app.Unlock("master-password"); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{
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

func TestNormalizeFrontendErrorUnwrapsKnownBackendErrors(t *testing.T) {
	err := normalizeFrontendError(errors.Join(
		errors.New("wrapped"),
		db.ErrHostIDRequired,
	))

	if !errors.Is(err, db.ErrHostIDRequired) {
		t.Fatalf("normalizeFrontendError() error = %v, want %v", err, db.ErrHostIDRequired)
	}
}
