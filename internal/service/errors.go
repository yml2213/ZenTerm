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
	ErrNoIdentityAuth              = errors.New("未配置可用的 SSH 认证方式")
	ErrHostAddressRequired         = errors.New("host address is required")
	ErrHostUsernameRequired        = errors.New("host username is required")
	ErrInvalidTerminalSize         = errors.New("invalid terminal size")
	ErrSessionNotFound             = errors.New("session not found")
	ErrHostHasActiveSession        = errors.New("host has active sessions")
	ErrVaultAlreadyInitialized     = errors.New("vault is already initialized")
	ErrVaultNotInitialized         = errors.New("vault is not initialized")
	ErrHostKeyRejected             = errors.New("host key was rejected")
	ErrHostKeyConfirmationPending  = errors.New("host key confirmation already pending")
	ErrHostKeyConfirmationNotFound = errors.New("host key confirmation not found")
	ErrHostKeyMismatch             = errors.New("host key does not match the pending confirmation")
	ErrHostKeyConfirmationTimeout  = errors.New("host key confirmation timed out")
	ErrCredentialIDRequired        = errors.New("credential id is required")
	ErrCredentialLabelRequired     = errors.New("credential label is required")
	ErrCredentialInUse             = errors.New("credential is in use by one or more hosts")
	ErrInvalidAlgorithm            = errors.New("invalid key algorithm")
	ErrTransferSourceRequired      = errors.New("transfer source path is required")
	ErrTransferTargetRequired      = errors.New("transfer target path is required")
	ErrTransferSourceNotFile       = errors.New("transfer source must be a file")
	ErrTransferTargetNotDirectory  = errors.New("transfer target must be a directory")
	ErrTransferTargetExists        = errors.New("transfer target already exists")
	ErrFileActionPathRequired      = errors.New("file action path is required")
	ErrFileNameRequired            = errors.New("file name is required")
	ErrFileEntryAlreadyExists      = errors.New("file entry already exists")
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
	GetVaultStatus() (model.VaultStatus, error)
	InitializeVault(masterPassword string) error
	UnlockVault(masterPassword string) error
	ChangeMasterPassword(currentPassword, nextPassword string) error
	ResetVault() error
	GetHosts() ([]model.Host, error)
	ListLocalFiles(path string) (model.FileListing, error)
	ListRemoteFiles(hostID, path string) (model.FileListing, error)
	CreateLocalDirectory(parentPath, name string) (model.FileEntry, error)
	CreateRemoteDirectory(hostID, parentPath, name string) (model.FileEntry, error)
	RenameLocalEntry(path, nextName string) (model.FileEntry, error)
	RenameRemoteEntry(hostID, path, nextName string) (model.FileEntry, error)
	DeleteLocalEntry(path string) error
	DeleteRemoteEntry(hostID, path string) error
	UploadFile(hostID, localPath, remoteDir string, overwrite bool) (model.FileTransferResult, error)
	DownloadFile(hostID, remotePath, localDir string, overwrite bool) (model.FileTransferResult, error)
	AddHost(host model.Host, identity model.Identity) error
	UpdateHost(host model.Host, identity model.Identity) error
	DeleteHost(hostID string) error
	Connect(hostID string) (string, error)
	AcceptHostKey(hostID, key string) error
	RejectHostKey(hostID string) error
	ListSessionLogs(limit int) ([]model.SessionLog, error)
	GetSessionTranscript(logID string) (model.SessionTranscript, error)
	ToggleSessionLogFavorite(logID string, favorite bool) error
	DeleteSessionLog(logID string) error
	ListSessions() []Session
	SendInput(sessionID, data string) error
	ResizeTerminal(sessionID string, cols, rows int) error
	Disconnect(sessionID string) error
	CloseAll() error

	// Credential Center API
	GenerateCredential(label, algorithm string, keyBits int, passphrase string) (string, error)
	ImportCredential(label, privateKeyPEM, passphrase string) (string, error)
	GetCredentials() ([]model.Credential, error)
	GetCredential(credentialID string) (model.Credential, error)
	GetCredentialUsage(credentialID string) (model.CredentialUsage, error)
	DeleteCredential(credentialID string) error
}

type managedSession struct {
	Session
	client    sshClient
	ssh       sshSession
	stdin     io.WriteCloser
	logID     string
	closeOnce sync.Once
}

type managedSFTPConnection struct {
	hostID     string
	remoteAddr string
	client     sshClient
	closeOnce  sync.Once
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
	Stat(path string) (os.FileInfo, error)
	Open(path string) (io.ReadCloser, error)
	Create(path string) (io.WriteCloser, error)
	Mkdir(path string) error
	Rename(oldPath, newPath string) error
	Remove(path string) error
	RemoveDirectory(path string) error
	Close() error
}
