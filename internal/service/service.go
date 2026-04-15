package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
)

var (
	ErrNilDependency        = errors.New("service dependencies cannot be nil")
	ErrNoIdentityAuth       = errors.New("no supported ssh authentication method configured")
	ErrHostAddressRequired  = errors.New("host address is required")
	ErrHostUsernameRequired = errors.New("host username is required")
	ErrSessionNotFound      = errors.New("session not found")
)

const defaultSSHPort = 22

type sshDialer interface {
	Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error)
}

type sshClient interface {
	Close() error
}

type realSSHDialer struct{}

func (d realSSHDialer) Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error) {
	return ssh.Dial(network, addr, config)
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
}

// Service 负责把 Vault 生命周期与 JSON 存储连接起来 / wires the vault lifecycle to the JSON-backed store.
type Service struct {
	store     *db.Store
	vault     *security.Vault
	dialer    sshDialer
	sessionMu sync.RWMutex
	sessions  map[string]*managedSession
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
		store:    store,
		vault:    vault,
		dialer:   dialer,
		sessions: make(map[string]*managedSession),
	}, nil
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

	config, err := newClientConfig(host, identity)
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

	sessionID, err := newSessionID()
	if err != nil {
		_ = client.Close()
		return "", fmt.Errorf("generate session id: %w", err)
	}

	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()

	s.sessions[sessionID] = &managedSession{
		Session: Session{
			ID:          sessionID,
			HostID:      hostID,
			RemoteAddr:  net.JoinHostPort(remoteAddr, strconv.Itoa(port)),
			ConnectedAt: time.Now().UTC(),
		},
		client: client,
	}

	return sessionID, nil
}

// Disconnect 关闭指定的活跃 SSH 会话 / closes the requested active SSH session.
func (s *Service) Disconnect(sessionID string) error {
	s.sessionMu.Lock()
	session, ok := s.sessions[sessionID]
	if ok {
		delete(s.sessions, sessionID)
	}
	s.sessionMu.Unlock()

	if !ok {
		return ErrSessionNotFound
	}

	if err := session.client.Close(); err != nil {
		return fmt.Errorf("close ssh client: %w", err)
	}

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

type managedSession struct {
	Session
	client sshClient
}

func newClientConfig(host model.Host, identity model.Identity) (*ssh.ClientConfig, error) {
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
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
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
