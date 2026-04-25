package service

import (
	"sync"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/security"
)

// Service 负责把 Vault 生命周期、SSH 会话与文件浏览能力连接起来 / wires the vault lifecycle, SSH sessions, and file browsing capabilities together.
type Service struct {
	store           *db.Store
	vault           *security.Vault
	dialer          sshDialer
	emitter         EventEmitter
	emitterMu       sync.RWMutex
	sessionMu       sync.RWMutex
	sessions        map[string]*managedSession
	transcriptMu    sync.Mutex
	transcripts     map[string]*pendingTranscript
	transcriptDelay time.Duration
	sftpMu          sync.Mutex
	sftpConnections map[string]*managedSFTPConnection
	hostKeyMu       sync.Mutex
	pendingHostKeys map[string]*pendingHostKeyConfirmation
}

type pendingTranscript struct {
	sessionID string
	chunks    []string
	timer     *time.Timer
}

// New 使用显式依赖创建服务实现 / creates a service implementation with explicit dependencies.
func New(store *db.Store, vault *security.Vault) (*Service, error) {
	return newWithDialer(store, vault, realSSHDialer{})
}

func newWithDialer(store *db.Store, vault *security.Vault, dialer sshDialer) (*Service, error) {
	if store == nil || vault == nil || dialer == nil {
		return nil, ErrNilDependency
	}

	return &Service{
		store:           store,
		vault:           vault,
		dialer:          dialer,
		emitter:         func(string, any) {},
		sessions:        make(map[string]*managedSession),
		transcripts:     make(map[string]*pendingTranscript),
		transcriptDelay: 200 * time.Millisecond,
		sftpConnections: make(map[string]*managedSFTPConnection),
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

func (s *Service) emit(event string, payload any) {
	s.emitterMu.RLock()
	emitter := s.emitter
	s.emitterMu.RUnlock()
	emitter(event, payload)
}
