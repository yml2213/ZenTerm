package model

import "time"

// Host 保存不包含敏感信息的 SSH 连接元数据 / contains non-sensitive SSH connection metadata.
type Host struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Address          string    `json:"address"`
	Port             int       `json:"port"`
	Username         string    `json:"username"`
	Group            string    `json:"group,omitempty"`
	Tags             string    `json:"tags,omitempty"` // 逗号分隔标签 / comma-separated labels.
	Favorite         bool      `json:"favorite,omitempty"`
	SystemType       string    `json:"system_type,omitempty"`
	SystemTypeSource string    `json:"system_type_source,omitempty"`
	LastConnectedAt  time.Time `json:"last_connected_at,omitempty"`
	KnownHosts       string    `json:"known_hosts,omitempty"`
	CredentialID     string    `json:"credential_id,omitempty"` // 引用凭据中心的ID，为空则使用内联Identity
}

// Identity 保存主机认证所需的敏感凭据（内联模式）/ contains the sensitive authentication material for a host (inline mode).
type Identity struct {
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"private_key,omitempty"`
}

// CredentialType 定义凭据类型 / defines credential types.
type CredentialType string

const (
	CredentialTypeSSHKey      CredentialType = "ssh_key"
	CredentialTypePassword    CredentialType = "password"
	CredentialTypeCertificate CredentialType = "certificate"
)

// Credential 表示凭据中心的一条记录 / represents a single entry in the credential center.
type Credential struct {
	ID         string         `json:"id"`
	Label      string         `json:"label"`
	Type       CredentialType `json:"type"`
	Algorithm  string         `json:"algorithm,omitempty"` // ed25519, rsa, ecdsa (for ssh_key)
	PublicKey  string         `json:"public_key,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at,omitempty"`
	LastUsedAt time.Time      `json:"last_used_at,omitempty"`
}

// CredentialUsage 记录凭据被哪些主机使用 / tracks which hosts are using this credential.
type CredentialUsage struct {
	CredentialID   string   `json:"credential_id"`
	HostIDs        []string `json:"host_ids"`
	ActiveSessions int      `json:"active_sessions"`
}

const (
	SessionLogStatusConnecting = "connecting"
	SessionLogStatusActive     = "active"
	SessionLogStatusClosed     = "closed"
	SessionLogStatusFailed     = "failed"
	SessionLogStatusRejected   = "rejected"
)

// SessionLog 保存一次 SSH 连接尝试或会话的元数据 / stores metadata for one SSH connection attempt or session.
type SessionLog struct {
	ID             string    `json:"id"`
	SessionID      string    `json:"session_id,omitempty"`
	HostID         string    `json:"host_id"`
	HostName       string    `json:"host_name,omitempty"`
	HostAddress    string    `json:"host_address"`
	HostPort       int       `json:"host_port"`
	SSHUsername    string    `json:"ssh_username"`
	LocalUsername  string    `json:"local_username,omitempty"`
	Protocol       string    `json:"protocol"`
	Status         string    `json:"status"`
	StartedAt      time.Time `json:"started_at"`
	EndedAt        time.Time `json:"ended_at,omitempty"`
	DurationMillis int64     `json:"duration_millis,omitempty"`
	RemoteAddr     string    `json:"remote_addr,omitempty"`
	ErrorMessage   string    `json:"error_message,omitempty"`
	Favorite       bool      `json:"favorite,omitempty"`
	Note           string    `json:"note,omitempty"`
}

// SessionTranscript 保存一次 SSH 会话的可见终端输出内容 / stores visible terminal output for one SSH session.
type SessionTranscript struct {
	LogID      string    `json:"log_id"`
	SessionID  string    `json:"session_id,omitempty"`
	Content    string    `json:"content"`
	SizeBytes  int64     `json:"size_bytes,omitempty"`
	UpdatedAt  time.Time `json:"updated_at,omitempty"`
	RecordedAt time.Time `json:"recorded_at,omitempty"`
}

// WindowState 保存窗口尺寸与启动状态 / stores persisted window dimensions and startup state.
type WindowState struct {
	Width     int  `json:"width,omitempty"`
	Height    int  `json:"height,omitempty"`
	Maximised bool `json:"maximised,omitempty"`
}

// VaultStatus 描述当前 Vault 是否已初始化以及是否已解锁 / describes whether the vault has been initialised and unlocked.
type VaultStatus struct {
	Initialized bool `json:"initialized"`
	Unlocked    bool `json:"unlocked"`
}

// KeychainStatus 描述系统钥匙串当前是否可用，以及是否已经保存主密码 / describes whether the system keychain is usable and whether a master password is stored.
type KeychainStatus struct {
	Supported bool   `json:"supported"`
	Saved     bool   `json:"saved"`
	Provider  string `json:"provider,omitempty"`
	Message   string `json:"message,omitempty"`
}

// FileEntry 表示文件浏览器中的单个条目 / represents a single file-system entry in the browser.
type FileEntry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	Mode    string    `json:"mode"`
	ModTime time.Time `json:"modTime"`
	Type    string    `json:"type"`
	IsDir   bool      `json:"isDir"`
}

// FileListing 表示一个目录列表响应 / represents a directory listing response.
type FileListing struct {
	Path       string      `json:"path"`
	ParentPath string      `json:"parentPath,omitempty"`
	Entries    []FileEntry `json:"entries"`
}

// FileTransferResult 表示一次文件传输的结果 / represents the result of a file transfer.
type FileTransferResult struct {
	SourcePath  string `json:"sourcePath"`
	TargetPath  string `json:"targetPath"`
	BytesCopied int64  `json:"bytesCopied"`
}
