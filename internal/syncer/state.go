package syncer

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const stateFileName = "sync-state.json"

// Manager 管理本机同步配置和状态 / manages local sync configuration and state.
type Manager struct {
	dir string
}

// NewManager 创建同步状态管理器 / creates a sync state manager.
func NewManager(dataDir string) *Manager {
	return &Manager{dir: dataDir}
}

// ConfigureWebDAV 保存 WebDAV 同步配置 / saves WebDAV sync settings.
func (m *Manager) ConfigureWebDAV(config WebDAVConfig) (Status, error) {
	config.URL = strings.TrimSpace(config.URL)
	config.Username = strings.TrimSpace(config.Username)
	config.RemotePath = cleanRemotePath(config.RemotePath)
	if config.URL == "" {
		return Status{}, errors.New("webdav url is required")
	}
	if config.Username == "" {
		return Status{}, errors.New("webdav username is required")
	}

	state, err := m.Load()
	if err != nil {
		return Status{}, err
	}
	if state.DeviceID == "" {
		state.DeviceID = newDeviceID()
	}
	state.Version = stateVersion
	state.Provider = defaultProvider
	state.WebDAV = config
	state.UpdatedAt = time.Now().UTC()
	if err := m.Save(state); err != nil {
		return Status{}, err
	}
	return state.Status(), nil
}

// Load 读取本机同步状态 / loads local sync state.
func (m *Manager) Load() (State, error) {
	bytes, err := os.ReadFile(m.statePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return State{Version: stateVersion, DeviceID: newDeviceID(), Provider: defaultProvider}, nil
		}
		return State{}, fmt.Errorf("read sync state: %w", err)
	}

	var state State
	if err := json.Unmarshal(bytes, &state); err != nil {
		return State{}, fmt.Errorf("decode sync state: %w", err)
	}
	if state.Version == 0 {
		state.Version = stateVersion
	}
	if state.DeviceID == "" {
		state.DeviceID = newDeviceID()
	}
	if state.Provider == "" {
		state.Provider = defaultProvider
	}
	state.WebDAV.RemotePath = cleanRemotePath(state.WebDAV.RemotePath)
	return state, nil
}

// Save 写入同步状态 / saves sync state.
func (m *Manager) Save(state State) error {
	if state.Version == 0 {
		state.Version = stateVersion
	}
	if state.DeviceID == "" {
		state.DeviceID = newDeviceID()
	}
	if state.Provider == "" {
		state.Provider = defaultProvider
	}
	state.WebDAV.RemotePath = cleanRemotePath(state.WebDAV.RemotePath)

	bytes, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode sync state: %w", err)
	}
	return writeFileAtomic(m.statePath(), bytes, 0o600)
}

// Status 返回当前同步状态 / returns current sync status.
func (m *Manager) Status() (Status, error) {
	state, err := m.Load()
	if err != nil {
		return Status{}, err
	}
	return state.Status(), nil
}

// Status 将 State 转为前端结构 / converts State to frontend status.
func (s State) Status() Status {
	return Status{
		Configured:       strings.TrimSpace(s.WebDAV.URL) != "" && strings.TrimSpace(s.WebDAV.Username) != "",
		Provider:         s.Provider,
		DeviceID:         s.DeviceID,
		URL:              s.WebDAV.URL,
		Username:         s.WebDAV.Username,
		RemotePath:       cleanRemotePath(s.WebDAV.RemotePath),
		LastRemoteETag:   s.LastRemoteETag,
		LastSnapshotHash: s.LastSnapshotHash,
		LastSyncAt:       formatTime(s.LastSyncAt),
		UpdatedAt:        formatTime(s.UpdatedAt),
	}
}

func (m *Manager) statePath() string {
	return filepath.Join(m.dir, stateFileName)
}

func cleanRemotePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return defaultRemotePath
	}
	path = strings.ReplaceAll(path, "\\", "/")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return path
}

func newDeviceID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("device-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func writeFileAtomic(path string, payload []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create parent directory: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary file: %w", err)
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmp.Write(payload); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write temporary file: %w", err)
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("chmod temporary file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync temporary file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temporary file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("replace file: %w", err)
	}
	cleanup = false
	if dir, err := os.Open(filepath.Dir(path)); err == nil {
		_ = dir.Sync()
		_ = dir.Close()
	}
	return nil
}
