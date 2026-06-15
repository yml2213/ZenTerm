package db

import (
	cryptoRand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"zenterm/internal/model"
)

const currentVersion = 1

var (
	ErrHostIDRequired             = errors.New("host id is required")
	ErrStorePathEmpty             = errors.New("store path is required")
	ErrHostNotFound               = errors.New("host not found")
	ErrCredentialIDRequired       = errors.New("credential id is required")
	ErrCredentialNotFound         = errors.New("credential not found")
	ErrSessionLogIDRequired       = errors.New("session log id is required")
	ErrSessionLogNotFound         = errors.New("session log not found")
	ErrSessionTranscriptNotFound  = errors.New("session transcript not found")
	ErrSessionTranscriptEncrypted = errors.New("session transcript content is encrypted")
)

// Store 将 ZenTerm 数据持久化到本地 JSON 文件 / persists ZenTerm data in a local JSON file.
type Store struct {
	path     string
	saltSize int
	mu       sync.RWMutex
}
type fileData struct {
	Version            int                      `json:"version"`
	Vault              vaultData                `json:"vault"`
	Window             model.WindowState        `json:"window,omitempty"`
	UpdateConfig       model.UpdateConfig       `json:"update_config,omitempty"`
	AppPreferences     model.AppPreferences     `json:"app_preferences,omitempty"`
	Hosts              []hostEntry              `json:"hosts"`
	Credentials        []credentialEntry        `json:"credentials"`
	SessionLogs        []model.SessionLog       `json:"session_logs,omitempty"`
	SessionTranscripts []sessionTranscriptEntry `json:"session_transcripts,omitempty"`
}

func NewStore(path string) (*Store, error) {
	if path == "" {
		return nil, ErrStorePathEmpty
	}

	return &Store{
		path:     path,
		saltSize: 16,
	}, nil
}

// Path 返回当前 JSON 存储文件路径 / returns the configured file location for the JSON store.
func (s *Store) Path() string {
	return s.path
}

// BackupCurrent 把当前存储文件复制到同目录的 backups/config-{timestamp}-{rand}.zen，返回备份路径；如果当前还没有数据文件则跳过 / copies the current store file to backups/config-{timestamp}-{rand}.zen next to it and returns the backup path; no-op when the data file does not exist yet.
// 文件名带纳秒时间戳和随机后缀，避免连续导入落在同一秒互相覆盖 / the name carries a nanosecond timestamp plus a random suffix so back-to-back imports in the same second never overwrite each other.
func (s *Store) BackupCurrent() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	bytes, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", fmt.Errorf("read store for backup: %w", err)
	}

	backupDir := filepath.Join(filepath.Dir(s.path), "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		return "", fmt.Errorf("create backup directory: %w", err)
	}

	now := time.Now().UTC()
	suffix := make([]byte, 4)
	if _, err := cryptoRand.Read(suffix); err != nil {
		return "", fmt.Errorf("generate backup suffix: %w", err)
	}
	backupPath := filepath.Join(backupDir, fmt.Sprintf("config-%s-%s.zen", now.Format("20060102-150405.000000000"), hex.EncodeToString(suffix)))
	if err := writeFileAtomic(backupPath, bytes, 0o600); err != nil {
		return "", fmt.Errorf("write backup: %w", err)
	}

	return backupPath, nil
}

// EnsureSalt 返回已持久化的 Vault 盐值；如果存储尚未初始化则自动创建 / returns the persisted vault salt, creating one if the store does not exist yet.
func (s *Store) loadLocked() (fileData, error) {
	bytes, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fileData{
				Version:            currentVersion,
				Hosts:              []hostEntry{},
				Credentials:        []credentialEntry{},
				SessionLogs:        []model.SessionLog{},
				SessionTranscripts: []sessionTranscriptEntry{},
			}, nil
		}

		return fileData{}, fmt.Errorf("read store: %w", err)
	}

	var data fileData
	if err := json.Unmarshal(bytes, &data); err != nil {
		return fileData{}, fmt.Errorf("decode store: %w", err)
	}

	if data.Version == 0 {
		data.Version = currentVersion
	}
	if data.Hosts == nil {
		data.Hosts = []hostEntry{}
	}
	if data.Credentials == nil {
		data.Credentials = []credentialEntry{}
	}
	if data.SessionLogs == nil {
		data.SessionLogs = []model.SessionLog{}
	}
	if data.SessionTranscripts == nil {
		data.SessionTranscripts = []sessionTranscriptEntry{}
	}

	return data, nil
}
func (s *Store) saveLocked(data fileData) error {
	if data.Version == 0 {
		data.Version = currentVersion
	}

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create store directory: %w", err)
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("encode store: %w", err)
	}

	if err := writeFileAtomic(s.path, bytes, 0o600); err != nil {
		return fmt.Errorf("write store: %w", err)
	}

	return nil
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
