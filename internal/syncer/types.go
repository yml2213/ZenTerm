package syncer

import (
	"errors"
	"time"
)

var (
	ErrSyncNotConfigured = errors.New("sync is not configured")
	ErrSyncConflict      = errors.New("sync conflict detected")
	ErrRemoteNotFound    = errors.New("remote sync file not found")
)

const (
	stateVersion       = 1
	defaultRemotePath  = "/ZenTerm/zenterm-sync-v1.json"
	defaultProvider    = "webdav"
	defaultUserAgent   = "ZenTerm-WebDAV-Sync/1.0"
	defaultHTTPTimeout = 30 * time.Second
)

// WebDAVConfig 保存非敏感 WebDAV 同步配置 / stores non-sensitive WebDAV sync settings.
type WebDAVConfig struct {
	URL        string `json:"url"`
	Username   string `json:"username"`
	RemotePath string `json:"remote_path"`
}

// State 保存本机同步状态，密码不写入这里 / stores local sync state without persisting passwords.
type State struct {
	Version          int          `json:"version"`
	Provider         string       `json:"provider"`
	DeviceID         string       `json:"device_id"`
	DeviceName       string       `json:"device_name,omitempty"`
	WebDAV           WebDAVConfig `json:"webdav"`
	LastRemoteETag   string       `json:"last_remote_etag,omitempty"`
	LastSnapshotHash string       `json:"last_snapshot_hash,omitempty"`
	LastSyncAt       time.Time    `json:"last_sync_at,omitempty"`
	UpdatedAt        time.Time    `json:"updated_at,omitempty"`
}

// Status 是返回给前端的同步状态 / is the sync status returned to the frontend.
type Status struct {
	Configured       bool   `json:"configured"`
	Provider         string `json:"provider,omitempty"`
	DeviceID         string `json:"device_id,omitempty"`
	DeviceName       string `json:"device_name,omitempty"`
	URL              string `json:"url,omitempty"`
	Username         string `json:"username,omitempty"`
	RemotePath       string `json:"remote_path,omitempty"`
	LastRemoteETag   string `json:"last_remote_etag,omitempty"`
	LastSnapshotHash string `json:"last_snapshot_hash,omitempty"`
	LastSyncAt       string `json:"last_sync_at,omitempty"`
	UpdatedAt        string `json:"updated_at,omitempty"`
}

// Result 描述一次同步操作结果 / describes a sync operation result.
type Result struct {
	Direction  string `json:"direction"`
	RemoteETag string `json:"remote_etag,omitempty"`
	Bytes      int    `json:"bytes"`
	Conflict   bool   `json:"conflict,omitempty"`
	Message    string `json:"message,omitempty"`
	SyncedAt   string `json:"synced_at,omitempty"`
}

// TestResult 描述 WebDAV 连接测试结果 / describes a WebDAV connection test result.
type TestResult struct {
	OK         bool   `json:"ok"`
	Exists     bool   `json:"exists"`
	RemoteETag string `json:"remote_etag,omitempty"`
	Message    string `json:"message,omitempty"`
}

// RemoteMeta 保存远端文件元数据 / stores remote file metadata.
type RemoteMeta struct {
	Exists       bool
	ETag         string
	LastModified time.Time
	Size         int64
}
