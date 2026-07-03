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
	// ErrUnsupportedStoreVersion 表示存储文件版本高于当前代码支持的最高版本，拒绝降级解释以避免误读未来格式 / indicates the store file version exceeds what this build supports; we refuse to interpret it rather than silently misreading a future format.
	ErrUnsupportedStoreVersion = errors.New("unsupported store version")
)

// migrations 按 from-version 索引迁移步骤：migrations[i] 把存储从版本 i+1 升级到 i+2 / migrations[i] upgrades the store from version i+1 to i+2. 当前 currentVersion=1，无迁移步骤；新增版本时在此追加迁移函数。
var migrations = []func(*fileData) error{}

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
			return emptyStoreData(), nil
		}

		return fileData{}, fmt.Errorf("read store: %w", err)
	}

	var data fileData
	if err := json.Unmarshal(bytes, &data); err != nil {
		// 存储文件损坏：把坏字节隔离到 backups，返回空数据让应用以全新状态启动，避免一次坏字节永久锁死应用 / a corrupt store is quarantined to backups and the app boots into empty state, so one bad byte can't permanently lock the user out.
		if qErr := s.quarantineCorruptLocked(bytes); qErr != nil {
			return fileData{}, fmt.Errorf("decode store: %w (quarantine failed: %v)", err, qErr)
		}
		return emptyStoreData(), nil
	}

	if data.Version == 0 {
		data.Version = currentVersion
	}
	if data.Version > currentVersion {
		return fileData{}, fmt.Errorf("%w: store version %d exceeds supported %d", ErrUnsupportedStoreVersion, data.Version, currentVersion)
	}
	// 按版本顺序应用迁移链，每步成功后推进版本号 / apply migrations in order, advancing the version after each successful step.
	for v := data.Version; v < currentVersion; v++ {
		if err := migrations[v-1](&data); err != nil {
			return fileData{}, fmt.Errorf("migrate store v%d -> v%d: %w", v, v+1, err)
		}
		data.Version = v + 1
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

// emptyStoreData 返回一份带 currentVersion 与空集合的全新 fileData，供新建或损坏自愈后初始化使用 / returns a fresh fileData with currentVersion and empty collections, used on first-run and after corrupt-file quarantine.
func emptyStoreData() fileData {
	return fileData{
		Version:            currentVersion,
		Hosts:              []hostEntry{},
		Credentials:        []credentialEntry{},
		SessionLogs:        []model.SessionLog{},
		SessionTranscripts: []sessionTranscriptEntry{},
	}
}

// quarantineCorruptLocked 把损坏的存储内容隔离到 backups/config-corrupt-{ts}-{rand}.zen 并删除原文件，使下次 saveLocked 能正常写入新数据 / quarantines a corrupt store payload to backups/config-corrupt-{ts}-{rand}.zen and removes the original so the next saveLocked can write cleanly. 调用方必须已持有 s.mu。
func (s *Store) quarantineCorruptLocked(corruptBytes []byte) error {
	backupDir := filepath.Join(filepath.Dir(s.path), "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		return fmt.Errorf("create quarantine directory: %w", err)
	}

	now := time.Now().UTC()
	suffix := make([]byte, 4)
	if _, err := cryptoRand.Read(suffix); err != nil {
		return fmt.Errorf("generate quarantine suffix: %w", err)
	}
	quarantinePath := filepath.Join(backupDir, fmt.Sprintf("config-corrupt-%s-%s.zen", now.Format("20060102-150405.000000000"), hex.EncodeToString(suffix)))
	if err := writeFileAtomic(quarantinePath, corruptBytes, 0o600); err != nil {
		return fmt.Errorf("write quarantined store: %w", err)
	}

	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove corrupt store: %w", err)
	}
	return nil
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
