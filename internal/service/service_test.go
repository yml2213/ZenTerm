package service

import (
	"bytes"
	"crypto/ed25519"
	cryptorand "crypto/rand"
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

func newTestPublicKey(t *testing.T) ssh.PublicKey {
	t.Helper()

	publicKey, _, err := ed25519.GenerateKey(cryptorand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}

	sshKey, err := ssh.NewPublicKey(publicKey)
	if err != nil {
		t.Fatalf("NewPublicKey() error = %v", err)
	}

	return sshKey
}

type stubDialer struct {
	network string
	addr    string
	config  *ssh.ClientConfig
	client  *stubSSHClient
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
	session *stubSSHSession
	closed  bool
}

func (c *stubSSHClient) NewSession() (sshSession, error) {
	if c.session == nil {
		c.session = &stubSSHSession{}
	}

	c.session.ensureDefaults()
	return c.session, nil
}

func (c *stubSSHClient) Close() error {
	c.closed = true
	return nil
}

type stubSSHSession struct {
	stdin        bytes.Buffer
	stdout       io.ReadCloser
	stderr       io.ReadCloser
	ptyRequested bool
	shellStarted bool
	windowRows   int
	windowCols   int
	waitCh       chan struct{}
	closed       bool
}

func (s *stubSSHSession) ensureDefaults() {
	if s.stdout == nil {
		s.stdout = io.NopCloser(strings.NewReader(""))
	}
	if s.stderr == nil {
		s.stderr = io.NopCloser(strings.NewReader(""))
	}
	if s.waitCh == nil {
		s.waitCh = make(chan struct{})
	}
}

func (s *stubSSHSession) StdinPipe() (io.WriteCloser, error) {
	s.ensureDefaults()
	return nopWriteCloser{Writer: &s.stdin}, nil
}

func (s *stubSSHSession) StdoutPipe() (io.Reader, error) {
	s.ensureDefaults()
	return s.stdout, nil
}

func (s *stubSSHSession) StderrPipe() (io.Reader, error) {
	s.ensureDefaults()
	return s.stderr, nil
}

func (s *stubSSHSession) RequestPty(_ string, h, w int, _ ssh.TerminalModes) error {
	s.ensureDefaults()
	s.ptyRequested = true
	s.windowRows = h
	s.windowCols = w
	return nil
}

func (s *stubSSHSession) Shell() error {
	s.ensureDefaults()
	s.shellStarted = true
	return nil
}

func (s *stubSSHSession) WindowChange(h, w int) error {
	s.windowRows = h
	s.windowCols = w
	return nil
}

func (s *stubSSHSession) Wait() error {
	s.ensureDefaults()
	<-s.waitCh
	return nil
}

func (s *stubSSHSession) Close() error {
	if s.closed {
		return nil
	}
	s.closed = true
	if s.stdout != nil {
		_ = s.stdout.Close()
	}
	if s.stderr != nil {
		_ = s.stderr.Close()
	}
	if s.waitCh != nil {
		close(s.waitCh)
		s.waitCh = nil
	}
	return nil
}

type nopWriteCloser struct {
	io.Writer
}

func (n nopWriteCloser) Close() error {
	return nil
}

type sequenceDialer struct {
	clients []sshClient
	index   int
}

func (d *sequenceDialer) Dial(_ string, _ string, _ *ssh.ClientConfig) (sshClient, error) {
	client := d.clients[d.index]
	d.index++
	return client, nil
}
