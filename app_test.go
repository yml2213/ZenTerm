package main

import (
	"errors"
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

func TestNormalizeFrontendErrorUnwrapsKnownBackendErrors(t *testing.T) {
	err := normalizeFrontendError(errors.Join(
		errors.New("wrapped"),
		db.ErrHostIDRequired,
	))

	if !errors.Is(err, db.ErrHostIDRequired) {
		t.Fatalf("normalizeFrontendError() error = %v, want %v", err, db.ErrHostIDRequired)
	}
}
