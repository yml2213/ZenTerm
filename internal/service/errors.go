package service

import (
	"errors"
	"io"
	"os"
	"sync"
	"time"

	"zenterm/internal/model"
)

var (
	ErrNilDependency               = errors.New("service dependencies cannot be nil")
	ErrNoIdentityAuth              = errors.New("no supported ssh authentication method configured")
	ErrHostAddressRequired         = errors.New("host address is required")
	ErrHostUsernameRequired        = errors.New("host username is required")
	ErrInvalidTerminalSize         = errors.New("invalid terminal size")
	ErrSessionNotFound             = errors.New("session not found")
	ErrHostHasActiveSession        = errors.New("host has active sessions")
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
	ListLocalFiles(path string) (model.FileListing, error)
	ListRemoteFiles(hostID, path string) (model.FileListing, error)
	AddHost(host model.Host, identity model.Identity) error
	UpdateHost(host model.Host, identity model.Identity) error
	DeleteHost(hostID string) error
	Connect(hostID string) (string, error)
	AcceptHostKey(hostID, key string) error
	RejectHostKey(hostID string) error
	ListSessions() []Session
	SendInput(sessionID, data string) error
	ResizeTerminal(sessionID string, cols, rows int) error
	Disconnect(sessionID string) error
	CloseAll() error
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

type sftpClient interface {
	ReadDir(path string) ([]os.FileInfo, error)
	RealPath(path string) (string, error)
	Getwd() (string, error)
	Close() error
}
