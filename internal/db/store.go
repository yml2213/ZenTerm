package db

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

const currentVersion = 1

const vaultCheckToken = "zenterm:vault-check:v1"

var (
	ErrHostIDRequired       = errors.New("host id is required")
	ErrStorePathEmpty       = errors.New("store path is required")
	ErrHostNotFound         = errors.New("host not found")
	ErrCredentialIDRequired = errors.New("credential id is required")
	ErrCredentialNotFound   = errors.New("credential not found")
	ErrSessionLogIDRequired = errors.New("session log id is required")
	ErrSessionLogNotFound   = errors.New("session log not found")
)

// Store 将 ZenTerm 数据持久化到本地 JSON 文件 / persists ZenTerm data in a local JSON file.
type Store struct {
	path     string
	saltSize int
	mu       sync.RWMutex
}

type fileData struct {
	Version     int                `json:"version"`
	Vault       vaultData          `json:"vault"`
	Window      model.WindowState  `json:"window,omitempty"`
	Hosts       []hostEntry        `json:"hosts"`
	Credentials []credentialEntry  `json:"credentials"`
	SessionLogs []model.SessionLog `json:"session_logs,omitempty"`
}

type vaultData struct {
	Salt  string               `json:"salt"`
	Check *security.Ciphertext `json:"check,omitempty"`
}

type hostEntry struct {
	Host     model.Host      `json:"host"`
	Identity encryptedSecret `json:"identity"`
}

type credentialEntry struct {
	Credential model.Credential    `json:"credential"`
	Secret     encryptedCredential `json:"secret"`
}

type encryptedCredential struct {
	PrivateKey *security.Ciphertext `json:"private_key,omitempty"`
	Password   *security.Ciphertext `json:"password,omitempty"`
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
	data.Credentials = []credentialEntry{}
	data.SessionLogs = []model.SessionLog{}
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

		if entry.Host.CredentialID != "" {
			for _, credEntry := range data.Credentials {
				if credEntry.Credential.ID == entry.Host.CredentialID {
					privateKey, err := decryptOptional(credEntry.Secret.PrivateKey, vault)
					if err != nil {
						return model.Identity{}, fmt.Errorf("decrypt credential private key: %w", err)
					}

					password, err := decryptOptional(credEntry.Secret.Password, vault)
					if err != nil {
						return model.Identity{}, fmt.Errorf("decrypt credential password: %w", err)
					}

					return model.Identity{
						Password:   password,
						PrivateKey: privateKey,
					}, nil
				}
			}

			return model.Identity{}, fmt.Errorf("credential %s not found", entry.Host.CredentialID)
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

// UpdateLastConnectedAt 记录主机最近成功连接时间 / records the most recent successful connection time for a host.
func (s *Store) UpdateLastConnectedAt(hostID string, connectedAt time.Time) error {
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

		data.Hosts[i].Host.LastConnectedAt = connectedAt
		return s.saveLocked(data)
	}

	return ErrHostNotFound
}

// UpdateHostSystemType 保存自动探测或手动设置的主机系统类型 / stores the detected or manually selected host system type.
func (s *Store) UpdateHostSystemType(hostID, systemType, source string) error {
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

		data.Hosts[i].Host.SystemType = systemType
		data.Hosts[i].Host.SystemTypeSource = source
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

// CreateSessionLog 保存新的连接历史记录 / stores a new connection history record.
func (s *Store) CreateSessionLog(log model.SessionLog) error {
	if log.ID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.SessionLogs {
		if data.SessionLogs[i].ID == log.ID {
			data.SessionLogs[i] = log
			return s.saveLocked(data)
		}
	}

	data.SessionLogs = append(data.SessionLogs, log)
	return s.saveLocked(data)
}

// GetSessionLog 返回指定连接历史记录 / returns the requested connection history record.
func (s *Store) GetSessionLog(logID string) (model.SessionLog, error) {
	if logID == "" {
		return model.SessionLog{}, ErrSessionLogIDRequired
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.SessionLog{}, err
	}

	for _, log := range data.SessionLogs {
		if log.ID == logID {
			return log, nil
		}
	}

	return model.SessionLog{}, ErrSessionLogNotFound
}

// UpdateSessionLog 更新已有连接历史记录 / updates an existing connection history record.
func (s *Store) UpdateSessionLog(log model.SessionLog) error {
	if log.ID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.SessionLogs {
		if data.SessionLogs[i].ID == log.ID {
			data.SessionLogs[i] = log
			return s.saveLocked(data)
		}
	}

	return ErrSessionLogNotFound
}

// ListSessionLogs 返回按开始时间倒序排列的连接历史记录 / returns connection history records sorted newest first.
func (s *Store) ListSessionLogs(limit int) ([]model.SessionLog, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	logs := append([]model.SessionLog(nil), data.SessionLogs...)
	sort.SliceStable(logs, func(i, j int) bool {
		return logs[i].StartedAt.After(logs[j].StartedAt)
	})
	if limit > 0 && len(logs) > limit {
		logs = logs[:limit]
	}
	return logs, nil
}

// ToggleSessionLogFavorite 更新连接历史收藏状态 / updates the favorite state for a connection history record.
func (s *Store) ToggleSessionLogFavorite(logID string, favorite bool) error {
	if logID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.SessionLogs {
		if data.SessionLogs[i].ID == logID {
			data.SessionLogs[i].Favorite = favorite
			return s.saveLocked(data)
		}
	}

	return ErrSessionLogNotFound
}

// DeleteSessionLog 删除一条连接历史记录 / deletes a connection history record.
func (s *Store) DeleteSessionLog(logID string) error {
	if logID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	filtered := data.SessionLogs[:0]
	deleted := false
	for _, log := range data.SessionLogs {
		if log.ID == logID {
			deleted = true
			continue
		}
		filtered = append(filtered, log)
	}
	if !deleted {
		return ErrSessionLogNotFound
	}
	data.SessionLogs = filtered
	return s.saveLocked(data)
}

// PruneSessionLogs 保留最新的 maxEntries 条连接历史记录 / keeps only the newest maxEntries connection history records.
func (s *Store) PruneSessionLogs(maxEntries int) error {
	if maxEntries <= 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	sort.SliceStable(data.SessionLogs, func(i, j int) bool {
		return data.SessionLogs[i].StartedAt.After(data.SessionLogs[j].StartedAt)
	})
	if len(data.SessionLogs) > maxEntries {
		data.SessionLogs = data.SessionLogs[:maxEntries]
	}
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
			return fileData{Version: currentVersion, Hosts: []hostEntry{}, SessionLogs: []model.SessionLog{}}, nil
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

// AddCredential 保存凭据信息，并加密敏感数据 / stores a credential and encrypts sensitive data.
func (s *Store) AddCredential(cred model.Credential, privateKey, password string, vault *security.Vault) error {
	if cred.ID == "" {
		return ErrCredentialIDRequired
	}

	encPrivateKey, err := encryptOptional(privateKey, vault)
	if err != nil {
		return fmt.Errorf("encrypt private key: %w", err)
	}

	encPassword, err := encryptOptional(password, vault)
	if err != nil {
		return fmt.Errorf("encrypt password: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	entry := credentialEntry{
		Credential: cred,
		Secret: encryptedCredential{
			PrivateKey: encPrivateKey,
			Password:   encPassword,
		},
	}

	replaced := false
	for i := range data.Credentials {
		if data.Credentials[i].Credential.ID == cred.ID {
			data.Credentials[i] = entry
			replaced = true
			break
		}
	}

	if !replaced {
		data.Credentials = append(data.Credentials, entry)
	}

	return s.saveLocked(data)
}

// GetCredentials 返回所有凭据的元数据（不含敏感信息）/ returns all credential metadata (without sensitive data).
func (s *Store) GetCredentials() ([]model.Credential, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	creds := make([]model.Credential, 0, len(data.Credentials))
	for _, entry := range data.Credentials {
		creds = append(creds, entry.Credential)
	}

	return creds, nil
}

// GetCredential 返回指定ID的凭据元数据 / returns the metadata for a specific credential ID.
func (s *Store) GetCredential(credentialID string) (model.Credential, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.Credential{}, err
	}

	for _, entry := range data.Credentials {
		if entry.Credential.ID == credentialID {
			return entry.Credential, nil
		}
	}

	return model.Credential{}, ErrCredentialNotFound
}

// GetCredentialSecret 解密并返回凭据的敏感数据 / decrypts and returns the sensitive data for a credential.
func (s *Store) GetCredentialSecret(credentialID string, vault *security.Vault) (string, string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return "", "", err
	}

	for _, entry := range data.Credentials {
		if entry.Credential.ID != credentialID {
			continue
		}

		privateKey, err := decryptOptional(entry.Secret.PrivateKey, vault)
		if err != nil {
			return "", "", fmt.Errorf("decrypt private key: %w", err)
		}

		password, err := decryptOptional(entry.Secret.Password, vault)
		if err != nil {
			return "", "", fmt.Errorf("decrypt password: %w", err)
		}

		return privateKey, password, nil
	}

	return "", "", ErrCredentialNotFound
}

// UpdateCredentialLastUsed 更新凭据的最后使用时间 / updates the last used timestamp for a credential.
func (s *Store) UpdateCredentialLastUsed(credentialID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.Credentials {
		if data.Credentials[i].Credential.ID == credentialID {
			data.Credentials[i].Credential.LastUsedAt = data.Credentials[i].Credential.UpdatedAt
			return s.saveLocked(data)
		}
	}

	return ErrCredentialNotFound
}

// DeleteCredential 删除指定凭据 / removes a specific credential.
func (s *Store) DeleteCredential(credentialID string) error {
	if credentialID == "" {
		return ErrCredentialIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	filtered := data.Credentials[:0]
	deleted := false
	for _, entry := range data.Credentials {
		if entry.Credential.ID == credentialID {
			deleted = true
			continue
		}
		filtered = append(filtered, entry)
	}

	if !deleted {
		return ErrCredentialNotFound
	}

	data.Credentials = filtered
	return s.saveLocked(data)
}

// GetCredentialUsage 获取凭据的使用情况 / gets usage information for a credential.
func (s *Store) GetCredentialUsage(credentialID string) (model.CredentialUsage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.CredentialUsage{}, err
	}

	var hostIDs []string
	for _, entry := range data.Hosts {
		if entry.Host.CredentialID == credentialID {
			hostIDs = append(hostIDs, entry.Host.ID)
		}
	}

	return model.CredentialUsage{
		CredentialID:   credentialID,
		HostIDs:        hostIDs,
		ActiveSessions: 0,
	}, nil
}
