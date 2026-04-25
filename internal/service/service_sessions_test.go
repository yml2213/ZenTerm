package service

import (
	"errors"
	"io"
	"net"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
)

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
	if !dialer.client.session.shellStarted {
		t.Fatal("Connect() did not start remote shell")
	}
	if !dialer.client.session.ptyRequested {
		t.Fatal("Connect() did not request a PTY")
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

	logs, err := store.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("len(ListSessionLogs()) = %d, want 1", len(logs))
	}
	if logs[0].Status != model.SessionLogStatusActive {
		t.Fatalf("SessionLog.Status = %q, want %q", logs[0].Status, model.SessionLogStatusActive)
	}
	if logs[0].SessionID != sessionID {
		t.Fatalf("SessionLog.SessionID = %q, want %q", logs[0].SessionID, sessionID)
	}
	if logs[0].HostName != host.Name {
		t.Fatalf("SessionLog.HostName = %q, want %q", logs[0].HostName, host.Name)
	}
}

func TestDisconnectClosesSessionLog(t *testing.T) {
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

	host := model.Host{ID: "host-log-close", Address: "example.com", Port: 22, Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
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

	logs, err := store.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("len(ListSessionLogs()) = %d, want 1", len(logs))
	}
	if logs[0].Status != model.SessionLogStatusClosed {
		t.Fatalf("SessionLog.Status = %q, want %q", logs[0].Status, model.SessionLogStatusClosed)
	}
	if logs[0].EndedAt.IsZero() {
		t.Fatal("SessionLog.EndedAt is zero, want close time")
	}
}

func TestListSessionLogsClosesStaleActiveLog(t *testing.T) {
	dir := t.TempDir()
	store, err := db.NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	startedAt := time.Now().UTC().Add(-2 * time.Minute)
	log := model.SessionLog{
		ID:            "stale-log",
		SessionID:     "missing-session",
		HostID:        "host-stale",
		HostAddress:   "example.com",
		HostPort:      22,
		SSHUsername:   "zen",
		Protocol:      sessionLogProtocolSSH,
		Status:        model.SessionLogStatusActive,
		StartedAt:     startedAt,
		LocalUsername: "tester",
	}
	if err := store.CreateSessionLog(log); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}

	logs, err := svc.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("len(ListSessionLogs()) = %d, want 1", len(logs))
	}
	if logs[0].Status != model.SessionLogStatusClosed {
		t.Fatalf("SessionLog.Status = %q, want %q", logs[0].Status, model.SessionLogStatusClosed)
	}
	if logs[0].EndedAt.IsZero() {
		t.Fatal("SessionLog.EndedAt is zero, want close time")
	}
	if logs[0].DurationMillis <= 0 {
		t.Fatalf("SessionLog.DurationMillis = %d, want positive", logs[0].DurationMillis)
	}
}

func TestConnectFailureWritesFailedSessionLog(t *testing.T) {
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

	host := model.Host{ID: "host-log-failed", Address: "example.com", Port: 22, Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{err: errors.New("network down")})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	if _, err := svc.Connect(host.ID); err == nil {
		t.Fatal("Connect() error = nil, want failure")
	}

	logs, err := store.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("len(ListSessionLogs()) = %d, want 1", len(logs))
	}
	if logs[0].Status != model.SessionLogStatusFailed {
		t.Fatalf("SessionLog.Status = %q, want %q", logs[0].Status, model.SessionLogStatusFailed)
	}
	if logs[0].ErrorMessage == "" {
		t.Fatal("SessionLog.ErrorMessage = empty, want error summary")
	}
}

func TestConnectDetectsAndPersistsHostSystemType(t *testing.T) {
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
		ID:               "host-system-auto",
		Address:          "example.com",
		Username:         "zen",
		SystemTypeSource: "auto",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	client := &stubSSHClient{
		systemOutput: "kernel=Linux\nID=ubuntu\nPRETTY_NAME=\"Ubuntu 24.04 LTS\"\n",
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	sessionID, err := svc.Connect(host.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer func() { _ = svc.Disconnect(sessionID) }()

	updatedHost, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if updatedHost.SystemType != "ubuntu" {
		t.Fatalf("GetHost().SystemType = %q, want %q", updatedHost.SystemType, "ubuntu")
	}
	if updatedHost.SystemTypeSource != "auto" {
		t.Fatalf("GetHost().SystemTypeSource = %q, want %q", updatedHost.SystemTypeSource, "auto")
	}
	if client.newSessionHits != 2 {
		t.Fatalf("NewSession() hits = %d, want 2", client.newSessionHits)
	}
}

func TestConnectDoesNotOverwriteManualSystemType(t *testing.T) {
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
		ID:               "host-system-manual",
		Address:          "example.com",
		Username:         "zen",
		SystemType:       "debian",
		SystemTypeSource: "manual",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	client := &stubSSHClient{
		systemOutput: "kernel=Linux\nID=ubuntu\nPRETTY_NAME=\"Ubuntu 24.04 LTS\"\n",
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: client})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	sessionID, err := svc.Connect(host.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer func() { _ = svc.Disconnect(sessionID) }()

	updatedHost, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if updatedHost.SystemType != "debian" {
		t.Fatalf("GetHost().SystemType = %q, want %q", updatedHost.SystemType, "debian")
	}
	if updatedHost.SystemTypeSource != "manual" {
		t.Fatalf("GetHost().SystemTypeSource = %q, want %q", updatedHost.SystemTypeSource, "manual")
	}
	if client.newSessionHits != 1 {
		t.Fatalf("NewSession() hits = %d, want 1", client.newSessionHits)
	}
}

func TestConnectEmitsTerminalOutput(t *testing.T) {
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

	host := model.Host{ID: "host-1", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	dialer := &stubDialer{
		client: &stubSSHClient{
			session: &stubSSHSession{
				stdout: io.NopCloser(strings.NewReader("hello from ssh")),
				stderr: io.NopCloser(strings.NewReader("")),
			},
		},
	}
	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	eventCh := make(chan string, 1)
	svc.SetEventEmitter(func(event string, payload any) {
		if strings.HasPrefix(event, "term:data:") {
			if text, ok := payload.(string); ok {
				eventCh <- text
			}
		}
	})

	sessionID, err := svc.Connect(host.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer func() { _ = svc.Disconnect(sessionID) }()

	select {
	case got := <-eventCh:
		if got != "hello from ssh" {
			t.Fatalf("event payload = %q, want %q", got, "hello from ssh")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not receive terminal output event")
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

func TestUpdateHostPreservesExistingCredentialsWhenFieldsLeftBlank(t *testing.T) {
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
		ID:       "host-update",
		Name:     "Before",
		Address:  "before.example.com",
		Port:     22,
		Username: "zen",
	}
	identity := model.Identity{
		Password:   "password-1",
		PrivateKey: "PRIVATE KEY 1",
	}
	if err := store.AddHost(host, identity, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	updated := host
	updated.Name = "After"
	updated.Address = "after.example.com"
	if err := svc.UpdateHost(updated, model.Identity{}); err != nil {
		t.Fatalf("UpdateHost() error = %v", err)
	}

	loadedIdentity, err := store.GetIdentity(host.ID, vault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}

	loadedHost, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if loadedHost.Name != updated.Name || loadedHost.Address != updated.Address {
		t.Fatalf("GetHost() = %#v, want updated fields from %#v", loadedHost, updated)
	}
}

func TestDeleteHostRejectsWhenHostHasActiveSession(t *testing.T) {
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

	host := model.Host{ID: "host-busy", Address: "busy.example.com", Username: "zen"}
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
	defer func() { _ = svc.Disconnect(sessionID) }()

	err = svc.DeleteHost(host.ID)
	if !errors.Is(err, ErrHostHasActiveSession) {
		t.Fatalf("DeleteHost() error = %v, want %v", err, ErrHostHasActiveSession)
	}
}

func TestSendInputWritesIntoSessionStdin(t *testing.T) {
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

	host := model.Host{ID: "host-1", Address: "example.com", Username: "zen"}
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
	defer func() { _ = svc.Disconnect(sessionID) }()

	if err := svc.SendInput(sessionID, "ls -la\n"); err != nil {
		t.Fatalf("SendInput() error = %v", err)
	}

	if got := client.session.stdin.String(); got != "ls -la\n" {
		t.Fatalf("stdin = %q, want %q", got, "ls -la\n")
	}
}

func TestResizeTerminalChangesWindowSize(t *testing.T) {
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

	host := model.Host{ID: "host-1", Address: "example.com", Username: "zen"}
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
	defer func() { _ = svc.Disconnect(sessionID) }()

	if err := svc.ResizeTerminal(sessionID, 120, 40); err != nil {
		t.Fatalf("ResizeTerminal() error = %v", err)
	}
	if client.session.windowCols != 120 || client.session.windowRows != 40 {
		t.Fatalf("window size = %dx%d, want %dx%d", client.session.windowCols, client.session.windowRows, 120, 40)
	}
}

func TestCloseAllClosesEverySession(t *testing.T) {
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

	hostA := model.Host{ID: "host-a", Address: "a.example.com", Username: "zen"}
	hostB := model.Host{ID: "host-b", Address: "b.example.com", Username: "zen"}
	if err := store.AddHost(hostA, model.Identity{Password: "a"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}
	if err := store.AddHost(hostB, model.Identity{Password: "b"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	clientA := &stubSSHClient{}
	clientB := &stubSSHClient{}
	dialer := &sequenceDialer{
		clients: []sshClient{clientA, clientB},
	}
	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	if _, err := svc.Connect(hostA.ID); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	if _, err := svc.Connect(hostB.ID); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	if err := svc.CloseAll(); err != nil {
		t.Fatalf("CloseAll() error = %v", err)
	}
	if !clientA.closed || !clientB.closed {
		t.Fatal("CloseAll() did not close all clients")
	}
	if len(svc.ListSessions()) != 0 {
		t.Fatalf("len(ListSessions()) = %d, want 0", len(svc.ListSessions()))
	}
}

func TestHostKeyCallbackAcceptPersistsKnownHost(t *testing.T) {
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

	host := model.Host{ID: "host-key-accept", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	remoteKey := newTestPublicKey(t)
	callback := svc.hostKeyCallback(host)

	promptCh := make(chan HostKeyPrompt, 1)
	svc.SetEventEmitter(func(event string, payload any) {
		if event != "ssh:host-key:confirm" {
			return
		}
		prompt, ok := payload.(HostKeyPrompt)
		if ok {
			promptCh <- prompt
		}
	})

	resultCh := make(chan error, 1)
	go func() {
		resultCh <- callback(host.Address, &net.TCPAddr{IP: net.ParseIP("203.0.113.8"), Port: 22}, remoteKey)
	}()

	var prompt HostKeyPrompt
	select {
	case prompt = <-promptCh:
	case <-time.After(2 * time.Second):
		t.Fatal("did not receive host key prompt")
	}

	if prompt.HostID != host.ID {
		t.Fatalf("prompt.HostID = %q, want %q", prompt.HostID, host.ID)
	}
	if prompt.Key == "" || prompt.SHA256 == "" || prompt.MD5 == "" {
		t.Fatalf("prompt = %#v, want populated fingerprints and key", prompt)
	}

	if err := svc.AcceptHostKey(host.ID, prompt.Key); err != nil {
		t.Fatalf("AcceptHostKey() error = %v", err)
	}

	select {
	case err := <-resultCh:
		if err != nil {
			t.Fatalf("hostKeyCallback() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("hostKeyCallback() did not resume after accept")
	}

	updatedHost, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if !strings.Contains(updatedHost.KnownHosts, prompt.Key) {
		t.Fatalf("GetHost().KnownHosts = %q, want to contain %q", updatedHost.KnownHosts, prompt.Key)
	}

	trustedCallback := svc.hostKeyCallback(updatedHost)
	if err := trustedCallback(host.Address, nil, remoteKey); err != nil {
		t.Fatalf("hostKeyCallback() with trusted key error = %v", err)
	}
}

func TestHostKeyCallbackRejectStopsConnection(t *testing.T) {
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

	host := model.Host{ID: "host-key-reject", Address: "example.com", Username: "zen"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	remoteKey := newTestPublicKey(t)
	callback := svc.hostKeyCallback(host)

	promptCh := make(chan HostKeyPrompt, 1)
	svc.SetEventEmitter(func(event string, payload any) {
		if event == "ssh:host-key:confirm" {
			promptCh <- payload.(HostKeyPrompt)
		}
	})

	resultCh := make(chan error, 1)
	go func() {
		resultCh <- callback(host.Address, nil, remoteKey)
	}()

	select {
	case <-promptCh:
	case <-time.After(2 * time.Second):
		t.Fatal("did not receive host key prompt")
	}

	if err := svc.RejectHostKey(host.ID); err != nil {
		t.Fatalf("RejectHostKey() error = %v", err)
	}

	select {
	case err := <-resultCh:
		if !errors.Is(err, ErrHostKeyRejected) {
			t.Fatalf("hostKeyCallback() error = %v, want %v", err, ErrHostKeyRejected)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("hostKeyCallback() did not resume after reject")
	}
}
