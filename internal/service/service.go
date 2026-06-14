package service

import (
	"sync"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/security"
)

const (
	defaultTranscriptFlushDelay = 200 * time.Millisecond
	maxBufferedTranscriptBytes  = 32 * 1024
	// keepaliveInterval 控制空闲 SSH/SFTP 连接的心跳频率，避免 NAT/防火墙静默断开 / pings idle connections so NAT/firewall idle timeouts don't silently drop them.
	keepaliveInterval = 60 * time.Second
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
	sftpInFlight    map[string]*sftpDialCall
	hostKeyMu       sync.Mutex
	pendingHostKeys map[string]*pendingHostKeyConfirmation
}

type pendingTranscript struct {
	sessionID string
	chunks    []string
	sizeBytes int
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
		transcriptDelay: defaultTranscriptFlushDelay,
		sftpConnections: make(map[string]*managedSFTPConnection),
		sftpInFlight:    make(map[string]*sftpDialCall),
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

// startKeepaliveLoop 启动一个每 keepaliveInterval 周期向 SSH client 发送 keepalive 的 goroutine，直到返回的 stop 函数被调用或 client 发送失败 / starts a goroutine that pings the SSH client every keepaliveInterval; it stops when the returned stop func is called or the ping fails.
func (s *Service) startKeepAliveLoop(client sshClient) (stop func()) {
	ticker := time.NewTicker(keepaliveInterval)
	done := make(chan struct{})
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				// keepalive 失败说明底层连接已断，停止心跳；会话/SFTP 连接本身的关闭流程会接管后续清理 / a failed keepalive means the underlying connection is gone; the owning close path will clean up.
				if err := client.SendKeepAlive(); err != nil {
					return
				}
			}
		}
	}()
	return func() {
		select {
		case <-done:
		default:
			close(done)
		}
	}
}
