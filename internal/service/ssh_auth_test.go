package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
)

func TestParseJumpAddress(t *testing.T) {
	t.Parallel()

	tests := []struct {
		in     string
		want   jumpAddress
		wantOK bool
	}{
		{in: "jump.example.com", want: jumpAddress{Address: "jump.example.com", Port: 22}, wantOK: true},
		{in: "ops@jump.example.com:2222", want: jumpAddress{Username: "ops", Address: "jump.example.com", Port: 2222}, wantOK: true},
		{in: "localhost", want: jumpAddress{Address: "localhost", Port: 22}, wantOK: true},
		{in: "[2001:db8::1]:2200", want: jumpAddress{Address: "2001:db8::1", Port: 2200}, wantOK: true},
		{in: "prod-bastion", wantOK: false},
	}

	for _, tt := range tests {
		got, ok := parseJumpAddress(tt.in)
		if ok != tt.wantOK {
			t.Fatalf("parseJumpAddress(%q) ok = %v, want %v", tt.in, ok, tt.wantOK)
		}
		if !ok {
			continue
		}
		if got != tt.want {
			t.Fatalf("parseJumpAddress(%q) = %#v, want %#v", tt.in, got, tt.want)
		}
	}
}

func TestResolveJumpChainSavedHost(t *testing.T) {
	svc, jump, target := setupJumpHosts(t)
	hops, err := svc.resolveJumpChain(target)
	if err != nil {
		t.Fatalf("resolveJumpChain() error = %v", err)
	}
	if len(hops) != 1 {
		t.Fatalf("len(hops) = %d, want 1", len(hops))
	}
	if hops[0].host.ID != jump.ID {
		t.Fatalf("hop host ID = %q, want %q", hops[0].host.ID, jump.ID)
	}
}

func TestResolveJumpChainRejectsSelf(t *testing.T) {
	svc, _, _ := setupJumpHosts(t)
	host := model.Host{ID: "self-jump", Address: "10.0.0.9", Username: "zen", JumpHostID: "self-jump"}
	if err := svc.store.AddHost(host, model.Identity{Password: "secret"}, svc.vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}
	if _, err := svc.resolveJumpChain(host); !errors.Is(err, ErrJumpHostSelf) {
		t.Fatalf("resolveJumpChain() error = %v, want %v", err, ErrJumpHostSelf)
	}
}

func TestResolveJumpChainRejectsCycle(t *testing.T) {
	svc, jump, target := setupJumpHosts(t)
	jump.JumpHostID = target.ID
	if err := svc.store.AddHost(jump, model.Identity{Password: "jump-secret"}, svc.vault); err != nil {
		t.Fatalf("AddHost(jump) error = %v", err)
	}
	if _, err := svc.resolveJumpChain(target); !errors.Is(err, ErrJumpHostCycle) {
		t.Fatalf("resolveJumpChain() error = %v, want %v", err, ErrJumpHostCycle)
	}
}

func TestNewClientConfigUsesAgentWhenRequested(t *testing.T) {
	svc, _, host := setupJumpHosts(t)
	host.UseAgent = true
	called := false
	svc.agentAuth = func() (ssh.AuthMethod, func(), error) {
		called = true
		return ssh.Password("agent-unused"), func() {}, nil
	}

	config, cleanup, err := svc.newClientConfigContext(context.Background(), host, model.Identity{Password: "secret"})
	if err != nil {
		t.Fatalf("newClientConfigContext() error = %v", err)
	}
	defer cleanup()
	if !called {
		t.Fatal("expected agent auth to be requested")
	}
	if len(config.Auth) < 3 {
		t.Fatalf("len(Auth) = %d, want at least password + agent + keyboard-interactive", len(config.Auth))
	}
}

func TestNewClientConfigFallsBackToAgentWithoutIdentity(t *testing.T) {
	svc, _, host := setupJumpHosts(t)
	svc.agentAuth = func() (ssh.AuthMethod, func(), error) {
		return ssh.Password("agent-unused"), func() {}, nil
	}

	config, cleanup, err := svc.newClientConfigContext(context.Background(), host, model.Identity{})
	if err != nil {
		t.Fatalf("newClientConfigContext() error = %v", err)
	}
	defer cleanup()
	if len(config.Auth) < 2 {
		t.Fatalf("len(Auth) = %d, want agent + keyboard-interactive", len(config.Auth))
	}
}

func TestKeyboardInteractiveAutoFillsPasswordPrompt(t *testing.T) {
	svc, _, host := setupJumpHosts(t)
	challenge := svc.keyboardInteractiveCallback(context.Background(), host, model.Identity{Password: "secret"})
	answers, err := challenge("login", "", []string{"Password:"}, []bool{false})
	if err != nil {
		t.Fatalf("keyboardInteractiveCallback() error = %v", err)
	}
	if len(answers) != 1 || answers[0] != "secret" {
		t.Fatalf("answers = %#v, want auto-filled password", answers)
	}
}

func TestKeyboardInteractivePromptsFrontendForOTP(t *testing.T) {
	svc, _, host := setupJumpHosts(t)
	promptCh := make(chan KeyboardInteractivePrompt, 1)
	svc.SetEventEmitter(func(event string, payload any) {
		if event != keyboardInteractiveEvent {
			return
		}
		promptCh <- payload.(KeyboardInteractivePrompt)
	})

	done := make(chan []string, 1)
	errCh := make(chan error, 1)
	go func() {
		challenge := svc.keyboardInteractiveCallback(context.Background(), host, model.Identity{Password: "secret"})
		answers, err := challenge("2fa", "Enter token", []string{"Password:", "OTP:"}, []bool{false, true})
		if err != nil {
			errCh <- err
			return
		}
		done <- answers
	}()

	var prompt KeyboardInteractivePrompt
	select {
	case prompt = <-promptCh:
	case err := <-errCh:
		t.Fatalf("keyboardInteractiveCallback() error = %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for keyboard-interactive prompt")
	}
	if len(prompt.Questions) != 1 || prompt.Questions[0].Prompt != "OTP:" {
		t.Fatalf("prompt questions = %#v, want OTP only", prompt.Questions)
	}

	if err := svc.AnswerKeyboardInteractive(host.ID, prompt.PromptID, []string{"123456"}); err != nil {
		t.Fatalf("AnswerKeyboardInteractive() error = %v", err)
	}
	select {
	case answers := <-done:
		if len(answers) != 2 || answers[0] != "secret" || answers[1] != "123456" {
			t.Fatalf("answers = %#v, want [secret 123456]", answers)
		}
	case err := <-errCh:
		t.Fatalf("keyboardInteractiveCallback() error = %v", err)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for keyboard-interactive answers")
	}
}

func TestConnectDialsViaJumpHost(t *testing.T) {
	store, vault := setupAuthTestStore(t)
	jump := model.Host{ID: "bastion", Address: "jump.example.com", Port: 22, Username: "jump"}
	target := model.Host{ID: "app", Address: "app.example.com", Port: 22, Username: "zen", JumpHostID: jump.ID}
	if err := store.AddHost(jump, model.Identity{Password: "jump-secret"}, vault); err != nil {
		t.Fatalf("AddHost(jump) error = %v", err)
	}
	if err := store.AddHost(target, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost(target) error = %v", err)
	}

	dialer := &recordingViaDialer{
		clients: []*stubSSHClient{{}, {}},
	}
	svc, err := newWithDialer(store, vault, dialer)
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}

	sessionID, err := svc.Connect(target.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	if sessionID == "" {
		t.Fatal("Connect() returned empty session id")
	}
	if len(dialer.addrs) != 2 || dialer.addrs[0] != "jump.example.com:22" || dialer.addrs[1] != "via:app.example.com:22" {
		t.Fatalf("dial addrs = %#v, want jump then via target", dialer.addrs)
	}

	if err := svc.Disconnect(sessionID); err != nil {
		t.Fatalf("Disconnect() error = %v", err)
	}
	if !dialer.clients[0].closed || !dialer.clients[1].closed {
		t.Fatal("Disconnect() did not close jump and target clients")
	}
}

func TestLooksLikePasswordPrompt(t *testing.T) {
	t.Parallel()
	if !looksLikePasswordPrompt("Password:") {
		t.Fatal("expected Password: to match")
	}
	if !looksLikePasswordPrompt("请输入密码") {
		t.Fatal("expected 密码 to match")
	}
	if looksLikePasswordPrompt("OTP:") {
		t.Fatal("OTP should not be treated as a password prompt")
	}
}

func setupJumpHosts(t *testing.T) (*Service, model.Host, model.Host) {
	t.Helper()
	store, vault := setupAuthTestStore(t)
	jump := model.Host{ID: "bastion", Address: "jump.example.com", Port: 22, Username: "jump"}
	target := model.Host{ID: "app", Address: "app.example.com", Port: 22, Username: "zen", JumpHostID: jump.ID}
	if err := store.AddHost(jump, model.Identity{Password: "jump-secret"}, vault); err != nil {
		t.Fatalf("AddHost(jump) error = %v", err)
	}
	if err := store.AddHost(target, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost(target) error = %v", err)
	}
	svc, err := newWithDialer(store, vault, &stubDialer{client: &stubSSHClient{}})
	if err != nil {
		t.Fatalf("newWithDialer() error = %v", err)
	}
	svc.agentAuth = func() (ssh.AuthMethod, func(), error) {
		return nil, nil, errAgentUnavailable
	}
	return svc, jump, target
}

func setupAuthTestStore(t *testing.T) (*db.Store, *security.Vault) {
	t.Helper()
	store, err := db.NewStore(filepath.Join(t.TempDir(), "config.zen"))
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
	return store, vault
}

type recordingViaDialer struct {
	addrs   []string
	clients []*stubSSHClient
	index   int
}

func (d *recordingViaDialer) Dial(_ string, addr string, _ *ssh.ClientConfig) (sshClient, error) {
	d.addrs = append(d.addrs, addr)
	return d.next(), nil
}

func (d *recordingViaDialer) DialVia(_ context.Context, _ sshClient, _ string, addr string, _ *ssh.ClientConfig) (sshClient, error) {
	d.addrs = append(d.addrs, "via:"+addr)
	return d.next(), nil
}

func (d *recordingViaDialer) next() *stubSSHClient {
	if d.index >= len(d.clients) {
		return &stubSSHClient{}
	}
	client := d.clients[d.index]
	d.index++
	return client
}
