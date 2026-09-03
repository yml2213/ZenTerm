package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

// Connect 解密指定主机的身份信息并建立 SSH 连接，返回用于后续会话管理的 sessionID / decrypts the identity for a host, establishes an SSH connection, and returns a sessionID for later session management.
func (s *Service) Connect(hostID string) (string, error) {
	return s.ConnectContext(context.Background(), hostID)
}

// ConnectContext 建立 SSH 会话，并允许调用方在握手期间取消连接。
func (s *Service) ConnectContext(parent context.Context, hostID string) (string, error) {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	if !s.registerConnectingHost(hostID, cancel) {
		cancel()
		return "", ErrConnectionInProgress
	}
	defer func() {
		cancel()
		s.clearConnectingHost(hostID)
	}()

	host, err := s.store.GetHost(hostID)
	if err != nil {
		return "", err
	}
	logID := s.beginSessionLog(host)

	identity, err := s.store.GetIdentity(hostID, s.vault)
	if err != nil {
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", err
	}

	config, err := s.newClientConfigContext(ctx, host, identity)
	if err != nil {
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", err
	}

	client, remoteAddr, err := s.openSSHClientContext(ctx, host, config)
	if err != nil {
		s.markSessionLogFinished(logID, statusForConnectError(err), err.Error())
		return "", err
	}

	sshSession, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", fmt.Errorf("create ssh session: %w", err)
	}

	stdin, err := sshSession.StdinPipe()
	if err != nil {
		_ = sshSession.Close()
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", fmt.Errorf("create stdin pipe: %w", err)
	}

	stdout, err := sshSession.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", fmt.Errorf("create stdout pipe: %w", err)
	}

	stderr, err := sshSession.StderrPipe()
	if err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
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
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", fmt.Errorf("request pty: %w", err)
	}

	if err := sshSession.Shell(); err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", fmt.Errorf("start shell: %w", err)
	}

	sessionID, err := newSessionID()
	if err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", fmt.Errorf("generate session id: %w", err)
	}
	if err := ctx.Err(); err != nil {
		_ = stdin.Close()
		_ = sshSession.Close()
		_ = client.Close()
		s.markSessionLogFinished(logID, model.SessionLogStatusFailed, err.Error())
		return "", err
	}

	s.sessionMu.Lock()
	managed := &managedSession{
		Session: Session{
			ID:          sessionID,
			HostID:      hostID,
			RemoteAddr:  remoteAddr,
			ConnectedAt: time.Now().UTC(),
		},
		client: client,
		ssh:    sshSession,
		stdin:  stdin,
		logID:  logID,
	}
	managed.stopKeepAlive = s.startKeepAliveLoop(client)
	s.sessions[sessionID] = managed
	s.sessionMu.Unlock()

	s.markSessionLogActive(logID, sessionID, remoteAddr)
	go s.forwardOutput(sessionID, logID, stdout)
	go s.forwardOutput(sessionID, logID, stderr)
	go s.waitForSession(sessionID, managed)
	_ = s.store.UpdateLastConnectedAt(hostID, managed.ConnectedAt)
	if host.CredentialID != "" {
		_ = s.store.UpdateCredentialLastUsed(host.CredentialID)
	}
	if host.SystemTypeSource != "manual" {
		// 系统类型探测放到后台执行，避免阻塞 Connect 返回；探测完成后通过事件通知前端刷新 / probe the system type asynchronously so Connect can return immediately; the frontend refreshes via the emitted event.
		go func(hostID string, client sshClient) {
			systemType := detectHostSystemType(client)
			if systemType == "" {
				return
			}
			if err := s.store.UpdateHostSystemType(hostID, systemType, "auto"); err != nil {
				return
			}
			s.emit("host:system-type:"+hostID, map[string]string{
				"host_id":     hostID,
				"system_type": systemType,
				"source":      "auto",
			})
		}(hostID, client)
	}

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

	s.markSessionLogFinished(session.logID, model.SessionLogStatusClosed, "")
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
	s.cancelAllConnectingHosts()
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

	var errs []error
	if err := s.closeAllSFTPConnections(); err != nil {
		errs = append(errs, err)
	}
	for sessionID, session := range sessions {
		if err := session.close(); err != nil {
			errs = append(errs, err)
		}
		s.markSessionLogFinished(session.logID, model.SessionLogStatusClosed, "")
		s.emit("term:closed:"+sessionID, nil)
	}
	for _, confirmation := range pending {
		confirmation.respond(false)
	}
	if err := s.flushAllSessionTranscripts(); err != nil {
		errs = append(errs, err)
	}

	return errors.Join(errs...)
}

func (m *managedSession) close() error {
	var closeErr error

	m.closeOnce.Do(func() {
		if m.stopKeepAlive != nil {
			m.stopKeepAlive()
		}
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
	return s.newClientConfigContext(context.Background(), host, identity)
}

func (s *Service) newClientConfigContext(ctx context.Context, host model.Host, identity model.Identity) (*ssh.ClientConfig, error) {
	if host.Address == "" {
		return nil, ErrHostAddressRequired
	}
	if host.Username == "" {
		return nil, ErrHostUsernameRequired
	}

	authMethods := make([]ssh.AuthMethod, 0, 2)
	if identity.PrivateKey != "" {
		signer, err := parsePrivateKeySigner(identity.PrivateKey, identity.Password)
		if err != nil {
			return nil, ErrInvalidPrivateKey
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}
	if identity.Password != "" && identity.PrivateKey == "" {
		authMethods = append(authMethods, ssh.Password(identity.Password))
	}
	if len(authMethods) == 0 {
		return nil, ErrNoIdentityAuth
	}

	return &ssh.ClientConfig{
		User:            host.Username,
		Auth:            authMethods,
		HostKeyCallback: s.hostKeyCallbackContext(ctx, host),
		Timeout:         10 * time.Second,
	}, nil
}

func (s *Service) openSSHClient(host model.Host, config *ssh.ClientConfig) (sshClient, string, error) {
	return s.openSSHClientContext(context.Background(), host, config)
}

func (s *Service) openSSHClientContext(ctx context.Context, host model.Host, config *ssh.ClientConfig) (sshClient, string, error) {
	remoteAddr := host.Address
	port := host.Port
	if port == 0 {
		port = defaultSSHPort
	}

	fullAddr := net.JoinHostPort(remoteAddr, strconv.Itoa(port))
	if dialer, ok := s.dialer.(sshContextDialer); ok {
		client, err := dialer.DialContext(ctx, "tcp", fullAddr, config)
		if err != nil {
			return nil, fullAddr, fmt.Errorf("dial ssh: %w", err)
		}
		return client, fullAddr, nil
	}
	if err := ctx.Err(); err != nil {
		return nil, fullAddr, err
	}
	client, err := s.dialer.Dial("tcp", fullAddr, config)
	if err != nil {
		return nil, fullAddr, fmt.Errorf("dial ssh: %w", err)
	}

	return client, fullAddr, nil
}

// CancelConnection 取消指定主机正在进行的 SSH 握手；没有活动握手时为无操作。
func (s *Service) CancelConnection(hostID string) {
	s.connectMu.Lock()
	cancel := s.connectCancels[hostID]
	s.connectMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Service) registerConnectingHost(hostID string, cancel context.CancelFunc) bool {
	s.connectMu.Lock()
	defer s.connectMu.Unlock()
	if _, exists := s.connectCancels[hostID]; exists {
		return false
	}
	if s.connectCancels == nil {
		s.connectCancels = make(map[string]context.CancelFunc)
	}
	s.connectCancels[hostID] = cancel
	return true
}

func (s *Service) clearConnectingHost(hostID string) {
	s.connectMu.Lock()
	delete(s.connectCancels, hostID)
	s.connectMu.Unlock()
}

func (s *Service) cancelAllConnectingHosts() {
	s.connectMu.Lock()
	cancels := make([]context.CancelFunc, 0, len(s.connectCancels))
	for hostID, cancel := range s.connectCancels {
		delete(s.connectCancels, hostID)
		cancels = append(cancels, cancel)
	}
	s.connectMu.Unlock()
	for _, cancel := range cancels {
		cancel()
	}
}

func newSessionID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return hex.EncodeToString(buf), nil
}

func detectHostSystemType(client sshClient) string {
	session, err := client.NewSession()
	if err != nil {
		return ""
	}
	defer func() { _ = session.Close() }()

	output, err := session.CombinedOutput(`printf 'kernel=%s\n' "$(uname -s 2>/dev/null)"; if [ -r /etc/os-release ]; then cat /etc/os-release; fi`)
	if err != nil {
		return ""
	}

	return parseSystemType(string(output))
}

func parseSystemType(output string) string {
	values := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		values[key] = strings.ToLower(value)
	}

	kernel := values["kernel"]
	if strings.Contains(kernel, "darwin") {
		return "macos"
	}
	if strings.Contains(kernel, "mingw") || strings.Contains(kernel, "msys") || strings.Contains(kernel, "cygwin") {
		return "windows"
	}

	candidates := []string{values["id"], values["id_like"], values["pretty_name"], output}
	for _, candidate := range candidates {
		value := strings.ToLower(candidate)
		switch {
		case strings.Contains(value, "ubuntu"):
			return "ubuntu"
		case strings.Contains(value, "debian"):
			return "debian"
		case strings.Contains(value, "centos"):
			return "centos"
		case strings.Contains(value, "rhel") || strings.Contains(value, "red hat"):
			return "rhel"
		case strings.Contains(value, "fedora"):
			return "fedora"
		case strings.Contains(value, "alpine"):
			return "alpine"
		case strings.Contains(value, "arch"):
			return "arch"
		}
	}

	if strings.Contains(kernel, "linux") {
		return "linux"
	}
	return ""
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

// incompleteUTF8Tail 返回 data 末尾不完整 UTF-8 序列的字节数（最多 3），完整序列或纯 ASCII 返回 0 / returns the number of trailing bytes (at most 3) forming an incomplete UTF-8 sequence, or 0 when the tail is complete.
func incompleteUTF8Tail(data []byte) int {
	for i := len(data) - 1; i >= 0 && i > len(data)-utf8.UTFMax; i-- {
		b := data[i]
		if b&0xC0 == 0x80 {
			continue // continuation byte, keep scanning backwards
		}
		if b < 0xC0 {
			return 0 // ASCII lead byte, tail is complete
		}
		size := 0
		switch {
		case b >= 0xF0:
			size = 4
		case b >= 0xE0:
			size = 3
		case b >= 0xC0:
			size = 2
		}
		if remaining := len(data) - i; remaining < size {
			return remaining
		}
		return 0
	}
	return 0
}

func (s *Service) forwardOutput(sessionID, logID string, reader io.Reader) {
	buf := make([]byte, 4096)
	var pending []byte
	for {
		n, err := reader.Read(buf)
		if n > 0 {
			pending = append(pending, buf[:n]...)
			//? 多字节 UTF-8 字符可能被 Read 的分块边界截断；不完整的尾部留待下个分块，
			//? 否则 JSON 序列化会把它替换成 U+FFFD，终端上表现为随机的 "?"（如 btop 的图形符号）
			//? / a multi-byte UTF-8 char can be split at a read boundary; hold back the incomplete
			//? tail so JSON marshalling does not turn it into U+FFFD ("?" on screen, e.g. btop graphs).
			if cut := len(pending) - incompleteUTF8Tail(pending); cut > 0 {
				chunk := string(pending[:cut])
				s.appendSessionTranscript(logID, sessionID, chunk)
				s.emit("term:data:"+sessionID, chunk)
				pending = pending[cut:]
			}
		}
		if err != nil {
			//? 连接结束时把剩余字节冲出去（损坏的残缺序列已无法修复，但别丢内容） / flush leftovers on close.
			if len(pending) > 0 {
				chunk := string(pending)
				s.appendSessionTranscript(logID, sessionID, chunk)
				s.emit("term:data:"+sessionID, chunk)
			}
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
	s.markSessionLogFinished(detached.logID, model.SessionLogStatusClosed, "")
	s.emit("term:closed:"+sessionID, nil)
}
