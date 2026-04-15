package db

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

const currentVersion = 1

const vaultCheckToken = "zenterm:vault-check:v1"

var (
	ErrHostIDRequired = errors.New("host id is required")
	ErrStorePathEmpty = errors.New("store path is required")
	ErrHostNotFound   = errors.New("host not found")
)

// Store 将 ZenTerm 数据持久化到本地 JSON 文件 / persists ZenTerm data in a local JSON file.
type Store struct {
	path     string
	saltSize int
	mu       sync.RWMutex
}

type fileData struct {
	Version int               `json:"version"`
	Vault   vaultData         `json:"vault"`
	Window  model.WindowState `json:"window,omitempty"`
	Hosts   []hostEntry       `json:"hosts"`
}

type vaultData struct {
	Salt  string               `json:"salt"`
	Check *security.Ciphertext `json:"check,omitempty"`
}

type hostEntry struct {
	Host     model.Host      `json:"host"`
	Identity encryptedSecret `json:"identity"`
}

type encryptedSecret struct {
	Password   *security.Ciphertext `json:"password,omitempty"`
	PrivateKey *security.Ciphertext `json:"private_key,omitempty"`
}

// NewStore 为指定文件路径创建一个基于 JSON 的存储实现 / creates a JSON-backed store for the given file path.
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

// EnsureSalt 返回已持久化的 Vault 盐值；如果存储尚未初始化则自动创建 / returns the persisted vault salt, creating one if the store does not exist yet.
func (s *Store) EnsureSalt() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	if data.Vault.Salt != "" {
		return decodeSalt(data.Vault.Salt)
	}

	salt, err := security.NewSalt(s.saltSize)
	if err != nil {
		return nil, err
	}

	data.Vault.Salt = base64.StdEncoding.EncodeToString(salt)
	if err := s.saveLocked(data); err != nil {
		return nil, err
	}

	return salt, nil
}

// VerifyOrInitVaultCheck 校验当前 Vault 派生出的密钥是否正确；如果还没有校验哨兵则自动补齐 / validates the active vault key and bootstraps a verifier payload when missing.
func (s *Store) VerifyOrInitVaultCheck(vault *security.Vault) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	if data.Vault.Check != nil {
		plaintext, err := vault.DecryptString(*data.Vault.Check)
		if err != nil || plaintext != vaultCheckToken {
			return security.ErrInvalidMasterPassword
		}
		return nil
	}

	if hasEncryptedSecrets(data.Hosts) {
		if !canDecryptExistingSecret(data.Hosts, vault) {
			return security.ErrInvalidMasterPassword
		}
	}

	check, err := vault.EncryptString(vaultCheckToken)
	if err != nil {
		return fmt.Errorf("encrypt vault check: %w", err)
	}

	data.Vault.Check = &check
	return s.saveLocked(data)
}

// IsVaultInitialized 返回当前存储是否已经完成 Vault 初始化 / reports whether the persisted vault has been initialized.
func (s *Store) IsVaultInitialized() (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return false, err
	}

	return data.Vault.Check != nil || hasEncryptedSecrets(data.Hosts), nil
}

// RekeyVault 使用新的主密码派生密钥重新加密全部敏感数据 / re-encrypts all sensitive data with a freshly derived vault key.
func (s *Store) RekeyVault(currentVault, nextVault *security.Vault, nextSalt []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	if data.Vault.Check != nil {
		plaintext, err := currentVault.DecryptString(*data.Vault.Check)
		if err != nil || plaintext != vaultCheckToken {
			return security.ErrInvalidMasterPassword
		}
	} else if hasEncryptedSecrets(data.Hosts) && !canDecryptExistingSecret(data.Hosts, currentVault) {
		return security.ErrInvalidMasterPassword
	}

	for i := range data.Hosts {
		password, err := decryptOptional(data.Hosts[i].Identity.Password, currentVault)
		if err != nil {
			return fmt.Errorf("decrypt password: %w", err)
		}
		privateKey, err := decryptOptional(data.Hosts[i].Identity.PrivateKey, currentVault)
		if err != nil {
			return fmt.Errorf("decrypt private key: %w", err)
		}

		encryptedPassword, err := encryptOptional(password, nextVault)
		if err != nil {
			return fmt.Errorf("encrypt password: %w", err)
		}
		encryptedPrivateKey, err := encryptOptional(privateKey, nextVault)
		if err != nil {
			return fmt.Errorf("encrypt private key: %w", err)
		}

		data.Hosts[i].Identity.Password = encryptedPassword
		data.Hosts[i].Identity.PrivateKey = encryptedPrivateKey
	}

	check, err := nextVault.EncryptString(vaultCheckToken)
	if err != nil {
		return fmt.Errorf("encrypt vault check: %w", err)
	}

	data.Vault.Salt = base64.StdEncoding.EncodeToString(nextSalt)
	data.Vault.Check = &check
	return s.saveLocked(data)
}

// ResetVault 清空所有主机与凭据，并重置 Vault 初始化状态 / clears all hosts and credentials and resets vault initialization.
func (s *Store) ResetVault() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	data.Vault = vaultData{}
	data.Hosts = []hostEntry{}
	return s.saveLocked(data)
}

// AddHost 保存主机信息，并在写盘前加密其身份凭据 / stores a host and encrypts the provided identity before writing it to disk.
func (s *Store) AddHost(host model.Host, identity model.Identity, vault *security.Vault) error {
	if host.ID == "" {
		return ErrHostIDRequired
	}

	password, err := encryptOptional(identity.Password, vault)
	if err != nil {
		return fmt.Errorf("encrypt password: %w", err)
	}

	privateKey, err := encryptOptional(identity.PrivateKey, vault)
	if err != nil {
		return fmt.Errorf("encrypt private key: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	entry := hostEntry{
		Host: host,
		Identity: encryptedSecret{
			Password:   password,
			PrivateKey: privateKey,
		},
	}

	replaced := false
	for i := range data.Hosts {
		if data.Hosts[i].Host.ID == host.ID {
			data.Hosts[i] = entry
			replaced = true
			break
		}
	}

	if !replaced {
		data.Hosts = append(data.Hosts, entry)
	}

	return s.saveLocked(data)
}

// GetHosts 返回所有已保存的主机，但不包含敏感身份信息 / returns all persisted hosts without any sensitive identity material.
func (s *Store) GetHosts() ([]model.Host, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	hosts := make([]model.Host, 0, len(data.Hosts))
	for _, entry := range data.Hosts {
		hosts = append(hosts, entry.Host)
	}

	return hosts, nil
}

// GetHost 返回指定 ID 的主机元数据 / returns the host metadata for the given host ID.
func (s *Store) GetHost(hostID string) (model.Host, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.Host{}, err
	}

	for _, entry := range data.Hosts {
		if entry.Host.ID == hostID {
			return entry.Host, nil
		}
	}

	return model.Host{}, ErrHostNotFound
}

// GetIdentity 解密并返回指定主机的身份凭据 / decrypts the stored identity for a specific host.
func (s *Store) GetIdentity(hostID string, vault *security.Vault) (model.Identity, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.Identity{}, err
	}

	for _, entry := range data.Hosts {
		if entry.Host.ID != hostID {
			continue
		}

		password, err := decryptOptional(entry.Identity.Password, vault)
		if err != nil {
			return model.Identity{}, fmt.Errorf("decrypt password: %w", err)
		}

		privateKey, err := decryptOptional(entry.Identity.PrivateKey, vault)
		if err != nil {
			return model.Identity{}, fmt.Errorf("decrypt private key: %w", err)
		}

		return model.Identity{
			Password:   password,
			PrivateKey: privateKey,
		}, nil
	}

	return model.Identity{}, ErrHostNotFound
}

// UpdateKnownHosts 更新指定主机保存的可信 Host Key 列表 / updates the trusted host key list stored for the target host.
func (s *Store) UpdateKnownHosts(hostID, knownHosts string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.Hosts {
		if data.Hosts[i].Host.ID != hostID {
			continue
		}

		data.Hosts[i].Host.KnownHosts = knownHosts
		return s.saveLocked(data)
	}

	return ErrHostNotFound
}

// DeleteHost 删除指定主机及其加密身份信息 / removes the host and its encrypted identity material.
func (s *Store) DeleteHost(hostID string) error {
	if hostID == "" {
		return ErrHostIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	filtered := data.Hosts[:0]
	deleted := false
	for _, entry := range data.Hosts {
		if entry.Host.ID == hostID {
			deleted = true
			continue
		}
		filtered = append(filtered, entry)
	}

	if !deleted {
		return ErrHostNotFound
	}

	data.Hosts = filtered
	return s.saveLocked(data)
}

// LoadWindowState 读取最近一次持久化的窗口状态 / loads the last persisted window state.
func (s *Store) LoadWindowState() (model.WindowState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.WindowState{}, err
	}

	return data.Window, nil
}

// SaveWindowState 持久化当前窗口状态 / persists the current window state.
func (s *Store) SaveWindowState(state model.WindowState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	data.Window = state
	return s.saveLocked(data)
}

func (s *Store) loadLocked() (fileData, error) {
	bytes, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fileData{Version: currentVersion, Hosts: []hostEntry{}}, nil
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

	if err := os.WriteFile(s.path, bytes, 0o600); err != nil {
		return fmt.Errorf("write store: %w", err)
	}

	return nil
}

func encryptOptional(value string, vault *security.Vault) (*security.Ciphertext, error) {
	if value == "" {
		return nil, nil
	}

	payload, err := vault.EncryptString(value)
	if err != nil {
		return nil, err
	}

	return &payload, nil
}

func decryptOptional(payload *security.Ciphertext, vault *security.Vault) (string, error) {
	if payload == nil {
		return "", nil
	}

	return vault.DecryptString(*payload)
}

func decodeSalt(encoded string) ([]byte, error) {
	salt, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode salt: %w", err)
	}

	return salt, nil
}

func hasEncryptedSecrets(hosts []hostEntry) bool {
	for _, entry := range hosts {
		if entry.Identity.Password != nil || entry.Identity.PrivateKey != nil {
			return true
		}
	}

	return false
}

func canDecryptExistingSecret(hosts []hostEntry, vault *security.Vault) bool {
	for _, entry := range hosts {
		if entry.Identity.Password != nil {
			if _, err := vault.DecryptString(*entry.Identity.Password); err == nil {
				return true
			}
		}
		if entry.Identity.PrivateKey != nil {
			if _, err := vault.DecryptString(*entry.Identity.PrivateKey); err == nil {
				return true
			}
		}
	}

	return false
}
