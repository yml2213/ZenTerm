package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"time"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

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

	client, remoteAddr, err := s.openSSHClient(host, config)
	if err != nil {
		return "", err
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
			RemoteAddr:  remoteAddr,
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
	if err := s.closeAllSFTPConnections(); err != nil && closeErr == nil {
		closeErr = err
	}
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

func (s *Service) openSSHClient(host model.Host, config *ssh.ClientConfig) (sshClient, string, error) {
	remoteAddr := host.Address
	port := host.Port
	if port == 0 {
		port = defaultSSHPort
	}

	fullAddr := net.JoinHostPort(remoteAddr, strconv.Itoa(port))
	client, err := s.dialer.Dial("tcp", fullAddr, config)
	if err != nil {
		return nil, fullAddr, fmt.Errorf("dial ssh: %w", err)
	}

	return client, fullAddr, nil
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

func (s *Service) hasActiveSessionForHost(hostID string) bool {
	s.sessionMu.RLock()
	defer s.sessionMu.RUnlock()

	for _, session := range s.sessions {
		if session.HostID == hostID {
			return true
		}
	}

	return false
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
