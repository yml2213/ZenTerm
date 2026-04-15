package service

import (
	"bytes"
	"crypto/md5"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
)

var (
	ErrNilDependency               = errors.New("service dependencies cannot be nil")
	ErrNoIdentityAuth              = errors.New("no supported ssh authentication method configured")
	ErrHostAddressRequired         = errors.New("host address is required")
	ErrHostUsernameRequired        = errors.New("host username is required")
	ErrInvalidTerminalSize         = errors.New("invalid terminal size")
	ErrSessionNotFound             = errors.New("session not found")
	ErrHostKeyRejected             = errors.New("host key was rejected")
	ErrHostKeyConfirmationPending  = errors.New("host key confirmation already pending")
	ErrHostKeyConfirmationNotFound = errors.New("host key confirmation not found")
	ErrHostKeyMismatch             = errors.New("host key does not match the pending confirmation")
	ErrHostKeyConfirmationTimeout  = errors.New("host key confirmation timed out")
)

const (
	defaultSSHPort        = 22
	defaultTerm           = "xterm-256color"
	defaultRows           = 24
	defaultCols           = 80
	hostKeyConfirmTimeout = 2 * time.Minute
)

// EventEmitter 用于将会话事件转发给应用层 / forwards session events to the application layer.
type EventEmitter func(event string, payload any)

// HostKeyPrompt 表示发送给前端的主机指纹确认请求 / represents a host fingerprint confirmation request emitted to the frontend.
type HostKeyPrompt struct {
	HostID     string `json:"hostID"`
	RemoteAddr string `json:"remoteAddr"`
	Key        string `json:"key"`
	SHA256     string `json:"sha256"`
	MD5        string `json:"md5"`
}

type sshDialer interface {
	Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error)
}

type sshClient interface {
	NewSession() (sshSession, error)
	Close() error
}

type sshSession interface {
	StdinPipe() (io.WriteCloser, error)
	StdoutPipe() (io.Reader, error)
	StderrPipe() (io.Reader, error)
	RequestPty(term string, h, w int, modes ssh.TerminalModes) error
	Shell() error
	WindowChange(h, w int) error
	Wait() error
	Close() error
}

type realSSHDialer struct{}

func (d realSSHDialer) Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error) {
	client, err := ssh.Dial(network, addr, config)
	if err != nil {
		return nil, err
	}

	return &realSSHClient{client: client}, nil
}

type realSSHClient struct {
	client *ssh.Client
}

func (c *realSSHClient) NewSession() (sshSession, error) {
	session, err := c.client.NewSession()
	if err != nil {
		return nil, err
	}

	return &realSSHSession{session: session}, nil
}

func (c *realSSHClient) Close() error {
	return c.client.Close()
}

type realSSHSession struct {
	session *ssh.Session
}

func (s *realSSHSession) StdinPipe() (io.WriteCloser, error) {
	return s.session.StdinPipe()
}

func (s *realSSHSession) StdoutPipe() (io.Reader, error) {
	return s.session.StdoutPipe()
}

func (s *realSSHSession) StderrPipe() (io.Reader, error) {
	return s.session.StderrPipe()
}

func (s *realSSHSession) RequestPty(term string, h, w int, modes ssh.TerminalModes) error {
	return s.session.RequestPty(term, h, w, modes)
}

func (s *realSSHSession) Shell() error {
	return s.session.Shell()
}

func (s *realSSHSession) WindowChange(h, w int) error {
	return s.session.WindowChange(h, w)
}

func (s *realSSHSession) Wait() error {
	return s.session.Wait()
}

func (s *realSSHSession) Close() error {
	return s.session.Close()
}

// Session 表示一个活跃的 SSH 连接会话 / represents an active SSH connection session.
type Session struct {
	ID          string
	HostID      string
	RemoteAddr  string
	ConnectedAt time.Time
}

// ZenService 定义暴露给应用层的后端服务契约 / is the backend contract exposed to the application layer.
type ZenService interface {
	UnlockVault(masterPassword string) error
	GetHosts() ([]model.Host, error)
	AddHost(host model.Host, identity model.Identity) error
	Connect(hostID string) (string, error)
	AcceptHostKey(hostID, key string) error
	RejectHostKey(hostID string) error
	SendInput(sessionID, data string) error
	ResizeTerminal(sessionID string, cols, rows int) error
	Disconnect(sessionID string) error
	CloseAll() error
}

// Service 负责把 Vault 生命周期与 JSON 存储连接起来 / wires the vault lifecycle to the JSON-backed store.
type Service struct {
	store           *db.Store
	vault           *security.Vault
	dialer          sshDialer
	emitter         EventEmitter
	emitterMu       sync.RWMutex
	sessionMu       sync.RWMutex
	sessions        map[string]*managedSession
	hostKeyMu       sync.Mutex
	pendingHostKeys map[string]*pendingHostKeyConfirmation
}

// New 使用显式依赖创建服务实现 / creates a service implementation with explicit dependencies.
func New(store *db.Store, vault *security.Vault) (*Service, error) {
	return newWithDialer(store, vault, realSSHDialer{})
}

func newWithDialer(store *db.Store, vault *security.Vault, dialer sshDialer) (*Service, error) {
	if store == nil || vault == nil {
		return nil, ErrNilDependency
	}
	if dialer == nil {
		return nil, ErrNilDependency
	}

	return &Service{
		store:           store,
		vault:           vault,
		dialer:          dialer,
		emitter:         func(string, any) {},
		sessions:        make(map[string]*managedSession),
		pendingHostKeys: make(map[string]*pendingHostKeyConfirmation),
	}, nil
}

// SetEventEmitter 设置会话事件发射器，供上层接入 Wails Events / sets the session event emitter so the app layer can bridge to Wails Events.
func (s *Service) SetEventEmitter(emitter EventEmitter) {
	if emitter == nil {
		emitter = func(string, any) {}
	}

	s.emitterMu.Lock()
	defer s.emitterMu.Unlock()
	s.emitter = emitter
}

// UnlockVault 使用存储中的盐值初始化并解锁内存中的 Vault / initializes the in-memory vault from the persisted store salt.
func (s *Service) UnlockVault(masterPassword string) error {
	salt, err := s.store.EnsureSalt()
	if err != nil {
		return err
	}

	return s.vault.Unlock(masterPassword, salt)
}

// GetHosts 返回供 UI 使用的非敏感主机元数据 / returns non-sensitive host metadata for the UI.
func (s *Service) GetHosts() ([]model.Host, error) {
	return s.store.GetHosts()
}

// AddHost 使用已解锁的 Vault 加密并持久化主机身份信息 / encrypts and persists a host identity using the unlocked vault.
func (s *Service) AddHost(host model.Host, identity model.Identity) error {
	return s.store.AddHost(host, identity, s.vault)
}

// AcceptHostKey 接受待确认的主机公钥并将其持久化 / accepts a pending host public key confirmation and persists it.
func (s *Service) AcceptHostKey(hostID, key string) error {
	s.hostKeyMu.Lock()
	pending, ok := s.pendingHostKeys[hostID]
	if !ok {
		s.hostKeyMu.Unlock()
		return ErrHostKeyConfirmationNotFound
	}
	if subtle.ConstantTimeCompare([]byte(pending.key), []byte(strings.TrimSpace(key))) != 1 {
		s.hostKeyMu.Unlock()
		return ErrHostKeyMismatch
	}
	delete(s.pendingHostKeys, hostID)
	s.hostKeyMu.Unlock()

	host, err := s.store.GetHost(hostID)
	if err != nil {
		pending.respond(false)
		return err
	}

	if err := s.store.UpdateKnownHosts(hostID, mergeKnownHosts(host.KnownHosts, pending.key)); err != nil {
		pending.respond(false)
		return err
	}

	pending.respond(true)
	return nil
}

// RejectHostKey 拒绝待确认的主机公钥 / rejects a pending host public key confirmation.
func (s *Service) RejectHostKey(hostID string) error {
	s.hostKeyMu.Lock()
	pending, ok := s.pendingHostKeys[hostID]
	if ok {
		delete(s.pendingHostKeys, hostID)
	}
	s.hostKeyMu.Unlock()

	if !ok {
		return ErrHostKeyConfirmationNotFound
	}

	pending.respond(false)
	return nil
}

// Connect 解密指定主机的身份信息并建立 SSH 连接，返回用于后续会话管理的 sessionID / decrypts the identity for a host, establishes an SSH connection, and returns a sessionID for later session management.
func (s *Service) Connect(hostID string) (string, error) {
	host, err := s.store.GetHost(hostID)
	if err != nil {
		return "", err
	}

	identity, err := s.store.GetIdentity(hostID, s.vault)
	if err != nil {
		return "", err
	}

	config, err := s.newClientConfig(host, identity)
	if err != nil {
		return "", err
	}

	remoteAddr := host.Address
	port := host.Port
	if port == 0 {
		port = defaultSSHPort
	}

	client, err := s.dialer.Dial("tcp", net.JoinHostPort(remoteAddr, strconv.Itoa(port)), config)
	if err != nil {
		return "", fmt.Errorf("dial ssh: %w", err)
	}

	sshSession, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		return "", fmt.Errorf("create ssh session: %w", err)
	}

	stdin, err := sshSession.StdinPipe()
	if err != nil {
		_ = sshSession.Close()
		_ = client.Close()
		return "", fmt.Errorf("create stdin pipe: %w", err)
	}

	stdout, err := sshSession.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		return "", fmt.Errorf("create stdout pipe: %w", err)
	}

	stderr, err := sshSession.StderrPipe()
	if err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		return "", fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := sshSession.RequestPty(defaultTerm, defaultRows, defaultCols, ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14_400,
		ssh.TTY_OP_OSPEED: 14_400,
	}); err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		return "", fmt.Errorf("request pty: %w", err)
	}

	if err := sshSession.Shell(); err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		return "", fmt.Errorf("start shell: %w", err)
	}

	sessionID, err := newSessionID()
	if err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		return "", fmt.Errorf("generate session id: %w", err)
	}

	s.sessionMu.Lock()
	s.sessions[sessionID] = &managedSession{
		Session: Session{
			ID:          sessionID,
			HostID:      hostID,
			RemoteAddr:  net.JoinHostPort(remoteAddr, strconv.Itoa(port)),
			ConnectedAt: time.Now().UTC(),
		},
		client: client,
		ssh:    sshSession,
		stdin:  stdin,
	}
	managed := s.sessions[sessionID]
	s.sessionMu.Unlock()

	go s.forwardOutput(sessionID, stdout)
	go s.forwardOutput(sessionID, stderr)
	go s.waitForSession(sessionID, managed)

	return sessionID, nil
}

// Disconnect 关闭指定的活跃 SSH 会话 / closes the requested active SSH session.
func (s *Service) Disconnect(sessionID string) error {
	session, ok := s.detachSession(sessionID)
	if !ok {
		return ErrSessionNotFound
	}

	if err := session.close(); err != nil {
		return err
	}

	s.emit("term:closed:"+sessionID, nil)
	return nil
}

// ListSessions 返回当前活跃连接的只读快照 / returns a read-only snapshot of the active sessions.
func (s *Service) ListSessions() []Session {
	s.sessionMu.RLock()
	defer s.sessionMu.RUnlock()

	sessions := make([]Session, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session.Session)
	}

	return sessions
}

// SendInput 将前端输入写入指定 SSH 会话的 stdin / writes frontend input into the target SSH session stdin.
func (s *Service) SendInput(sessionID, data string) error {
	session, err := s.getSession(sessionID)
	if err != nil {
		return err
	}

	if _, err := io.WriteString(session.stdin, data); err != nil {
		return fmt.Errorf("write session input: %w", err)
	}

	return nil
}

// ResizeTerminal 调整远端 PTY 的行列尺寸 / resizes the remote PTY rows and columns.
func (s *Service) ResizeTerminal(sessionID string, cols, rows int) error {
	if cols <= 0 || rows <= 0 {
		return ErrInvalidTerminalSize
	}

	session, err := s.getSession(sessionID)
	if err != nil {
		return err
	}

	if err := session.ssh.WindowChange(rows, cols); err != nil {
		return fmt.Errorf("resize terminal: %w", err)
	}

	return nil
}

// CloseAll 强制关闭所有活跃会话，避免应用退出时泄露连接 / force closes all active sessions to prevent leaked connections when the app exits.
func (s *Service) CloseAll() error {
	s.sessionMu.Lock()
	sessions := make(map[string]*managedSession, len(s.sessions))
	for sessionID, session := range s.sessions {
		sessions[sessionID] = session
	}
	s.sessions = make(map[string]*managedSession)
	s.sessionMu.Unlock()

	s.hostKeyMu.Lock()
	pending := make([]*pendingHostKeyConfirmation, 0, len(s.pendingHostKeys))
	for hostID, confirmation := range s.pendingHostKeys {
		delete(s.pendingHostKeys, hostID)
		pending = append(pending, confirmation)
	}
	s.hostKeyMu.Unlock()

	var closeErr error
	for sessionID, session := range sessions {
		if err := session.close(); err != nil && closeErr == nil {
			closeErr = err
		}
		s.emit("term:closed:"+sessionID, nil)
	}
	for _, confirmation := range pending {
		confirmation.respond(false)
	}

	return closeErr
}

type managedSession struct {
	Session
	client    sshClient
	ssh       sshSession
	stdin     io.WriteCloser
	closeOnce sync.Once
}

type pendingHostKeyConfirmation struct {
	hostID string
	key    string
	result chan bool
	once   sync.Once
}

func (m *managedSession) close() error {
	var closeErr error

	m.closeOnce.Do(func() {
		if m.stdin != nil {
			if err := m.stdin.Close(); err != nil && closeErr == nil {
				closeErr = fmt.Errorf("close stdin: %w", err)
			}
		}
		if m.ssh != nil {
			if err := m.ssh.Close(); err != nil && closeErr == nil {
				closeErr = fmt.Errorf("close ssh session: %w", err)
			}
		}
		if m.client != nil {
			if err := m.client.Close(); err != nil && closeErr == nil {
				closeErr = fmt.Errorf("close ssh client: %w", err)
			}
		}
	})

	return closeErr
}

func (s *Service) newClientConfig(host model.Host, identity model.Identity) (*ssh.ClientConfig, error) {
	if host.Address == "" {
		return nil, ErrHostAddressRequired
	}
	if host.Username == "" {
		return nil, ErrHostUsernameRequired
	}

	authMethods := make([]ssh.AuthMethod, 0, 2)
	if identity.Password != "" {
		authMethods = append(authMethods, ssh.Password(identity.Password))
	}
	if identity.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(identity.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}
	if len(authMethods) == 0 {
		return nil, ErrNoIdentityAuth
	}

	return &ssh.ClientConfig{
		User:            host.Username,
		Auth:            authMethods,
		HostKeyCallback: s.hostKeyCallback(host),
		Timeout:         10 * time.Second,
	}, nil
}

func newSessionID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return hex.EncodeToString(buf), nil
}

func (s *Service) getSession(sessionID string) (*managedSession, error) {
	s.sessionMu.RLock()
	defer s.sessionMu.RUnlock()

	session, ok := s.sessions[sessionID]
	if !ok {
		return nil, ErrSessionNotFound
	}

	return session, nil
}

func (s *Service) detachSession(sessionID string) (*managedSession, bool) {
	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()

	session, ok := s.sessions[sessionID]
	if ok {
		delete(s.sessions, sessionID)
	}

	return session, ok
}

func (s *Service) forwardOutput(sessionID string, reader io.Reader) {
	buf := make([]byte, 4096)
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			s.emit("term:data:"+sessionID, string(buf[:n]))
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				s.emit("term:error:"+sessionID, err.Error())
			}
			return
		}
	}
}

func (s *Service) waitForSession(sessionID string, session *managedSession) {
	err := session.ssh.Wait()
	detached, ok := s.detachSession(sessionID)
	if !ok {
		return
	}

	if err != nil && !errors.Is(err, io.EOF) {
		s.emit("term:error:"+sessionID, err.Error())
	}
	_ = detached.close()
	s.emit("term:closed:"+sessionID, nil)
}

func (s *Service) emit(event string, payload any) {
	s.emitterMu.RLock()
	emitter := s.emitter
	s.emitterMu.RUnlock()
	emitter(event, payload)
}

func (s *Service) hostKeyCallback(host model.Host) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		if isKnownHostTrusted(host.KnownHosts, key) {
			return nil
		}

		prompt := HostKeyPrompt{
			HostID:     host.ID,
			RemoteAddr: remoteAddressString(remote, hostname),
			Key:        strings.TrimSpace(string(ssh.MarshalAuthorizedKey(key))),
			SHA256:     ssh.FingerprintSHA256(key),
			MD5:        md5Fingerprint(key),
		}

		pending, err := s.registerHostKeyConfirmation(prompt)
		if err != nil {
			return err
		}

		s.emit("ssh:host-key:confirm", prompt)

		select {
		case accepted := <-pending.result:
			if accepted {
				return nil
			}
			return ErrHostKeyRejected
		case <-time.After(hostKeyConfirmTimeout):
			s.clearHostKeyConfirmation(host.ID)
			return ErrHostKeyConfirmationTimeout
		}
	}
}

func (s *Service) registerHostKeyConfirmation(prompt HostKeyPrompt) (*pendingHostKeyConfirmation, error) {
	s.hostKeyMu.Lock()
	defer s.hostKeyMu.Unlock()

	if _, exists := s.pendingHostKeys[prompt.HostID]; exists {
		return nil, ErrHostKeyConfirmationPending
	}

	pending := &pendingHostKeyConfirmation{
		hostID: prompt.HostID,
		key:    prompt.Key,
		result: make(chan bool, 1),
	}
	s.pendingHostKeys[prompt.HostID] = pending
	return pending, nil
}

func (s *Service) clearHostKeyConfirmation(hostID string) {
	s.hostKeyMu.Lock()
	defer s.hostKeyMu.Unlock()
	delete(s.pendingHostKeys, hostID)
}

func (p *pendingHostKeyConfirmation) respond(accepted bool) {
	p.once.Do(func() {
		p.result <- accepted
		close(p.result)
	})
}

func isKnownHostTrusted(knownHosts string, key ssh.PublicKey) bool {
	for _, line := range strings.Split(knownHosts, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parsed, _, _, _, err := ssh.ParseAuthorizedKey([]byte(line))
		if err != nil {
			continue
		}
		if bytes.Equal(parsed.Marshal(), key.Marshal()) {
			return true
		}
	}

	return false
}

func mergeKnownHosts(knownHosts, key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return strings.TrimSpace(knownHosts)
	}

	parsed, _, _, _, err := ssh.ParseAuthorizedKey([]byte(key))
	if err != nil {
		return strings.TrimSpace(knownHosts)
	}
	if isKnownHostTrusted(knownHosts, parsed) {
		return strings.TrimSpace(knownHosts)
	}
	if strings.TrimSpace(knownHosts) == "" {
		return key
	}

	return strings.TrimSpace(knownHosts) + "\n" + key
}

func remoteAddressString(remote net.Addr, fallback string) string {
	if remote != nil && remote.String() != "" {
		return remote.String()
	}

	return fallback
}

func md5Fingerprint(key ssh.PublicKey) string {
	sum := md5.Sum(key.Marshal())
	parts := make([]string, 0, len(sum))
	for _, value := range sum {
		parts = append(parts, fmt.Sprintf("%02x", value))
	}

	return strings.Join(parts, ":")
}
