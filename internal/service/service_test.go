package service

import (
	"errors"
	"path/filepath"
	"testing"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
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

func TestConnectCreatesManagedSession(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
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
		Name:     "SSH Host",
		Address:  "example.com",
		Port:     2222,
		Username: "zen",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	dialer := &stubDialer{client: &stubSSHClient{}}
	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	sessionID, err := svc.Connect(host.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	if sessionID == "" {
		t.Fatal("Connect() sessionID = empty, want non-empty")
	}

	if dialer.network != "tcp" {
		t.Fatalf("Dial() network = %q, want %q", dialer.network, "tcp")
	}
	if dialer.addr != "example.com:2222" {
		t.Fatalf("Dial() addr = %q, want %q", dialer.addr, "example.com:2222")
	}
	if dialer.config == nil {
		t.Fatal("Dial() config = nil, want non-nil")
	}
	if dialer.config.User != "zen" {
		t.Fatalf("Dial() user = %q, want %q", dialer.config.User, "zen")
	}
	if len(dialer.config.Auth) != 1 {
		t.Fatalf("len(Dial() auth) = %d, want 1", len(dialer.config.Auth))
	}

	sessions := svc.ListSessions()
	if len(sessions) != 1 {
		t.Fatalf("len(ListSessions()) = %d, want 1", len(sessions))
	}
	if sessions[0].ID != sessionID {
		t.Fatalf("ListSessions()[0].ID = %q, want %q", sessions[0].ID, sessionID)
	}
	if sessions[0].HostID != host.ID {
		t.Fatalf("ListSessions()[0].HostID = %q, want %q", sessions[0].HostID, host.ID)
	}
}

func TestConnectRequiresUnlockedVault(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	unlocked := security.NewVault()
	if err := unlocked.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	host := model.Host{
		ID:       "host-1",
		Address:  "example.com",
		Username: "zen",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, unlocked); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	_, err = svc.Connect(host.ID)
	if !errors.Is(err, security.ErrVaultLocked) {
		t.Fatalf("Connect() error = %v, want %v", err, security.ErrVaultLocked)
	}
}

func TestConnectFailsWhenIdentityHasNoAuthMethod(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
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
		Address:  "example.com",
		Username: "zen",
	}
	if err := store.AddHost(host, model.Identity{}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	_, err = svc.Connect(host.ID)
	if !errors.Is(err, ErrNoIdentityAuth) {
		t.Fatalf("Connect() error = %v, want %v", err, ErrNoIdentityAuth)
	}
}

func TestDisconnectRemovesActiveSession(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
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
		Address:  "example.com",
		Username: "zen",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	client := &stubSSHClient{}
	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	sessionID, err := svc.Connect(host.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	if err := svc.Disconnect(sessionID); err != nil {
		t.Fatalf("Disconnect() error = %v", err)
	}
	if !client.closed {
		t.Fatal("Disconnect() did not close the client")
	}
	if len(svc.ListSessions()) != 0 {
		t.Fatalf("len(ListSessions()) = %d, want 0", len(svc.ListSessions()))
	}
}

type stubDialer struct {
	network string
	addr    string
	config  *ssh.ClientConfig
	client  sshClient
	err     error
}

func (d *stubDialer) Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error) {
	d.network = network
	d.addr = addr
	d.config = config
	if d.err != nil {
		return nil, d.err
	}

	return d.client, nil
}

type stubSSHClient struct {
	closed bool
}

func (c *stubSSHClient) Close() error {
	c.closed = true
	return nil
}
