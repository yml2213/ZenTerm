package db

import (
	"fmt"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

type hostEntry struct {
	Host     model.Host      `json:"host"`
	Identity encryptedSecret `json:"identity"`
}
type encryptedSecret struct {
	Password   *security.Ciphertext `json:"password,omitempty"`
	PrivateKey *security.Ciphertext `json:"private_key,omitempty"`
}

func (s *Store) AddHost(host model.Host, identity model.Identity, vault *security.Vault) error {
	if host.ID == "" {
		return ErrHostIDRequired
	}

	password, err := encryptOptional(identity.Password, vault, hostAAD(host.ID, aadFieldPassword))
	if err != nil {
		return fmt.Errorf("encrypt password: %w", err)
	}

	privateKey, err := encryptOptional(identity.PrivateKey, vault, hostAAD(host.ID, aadFieldPrivateKey))
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
			if !entry.Host.Pinned {
				entry.Host.Pinned = data.Hosts[i].Host.Pinned
			}
			if entry.Host.SortOrder == 0 {
				entry.Host.SortOrder = data.Hosts[i].Host.SortOrder
			}
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
					privateKey, err := decryptOptional(credEntry.Secret.PrivateKey, vault, credentialAAD(credEntry.Credential.ID, aadFieldPrivateKey))
					if err != nil {
						return model.Identity{}, fmt.Errorf("decrypt credential private key: %w", err)
					}

					password, err := decryptOptional(credEntry.Secret.Password, vault, credentialAAD(credEntry.Credential.ID, aadFieldPassword))
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

		password, err := decryptOptional(entry.Identity.Password, vault, hostAAD(entry.Host.ID, aadFieldPassword))
		if err != nil {
			return model.Identity{}, fmt.Errorf("decrypt password: %w", err)
		}

		privateKey, err := decryptOptional(entry.Identity.PrivateKey, vault, hostAAD(entry.Host.ID, aadFieldPrivateKey))
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

// UpdateHostPinned 更新主机置顶状态 / updates whether the host is pinned in the list.
func (s *Store) UpdateHostPinned(hostID string, pinned bool) error {
	if hostID == "" {
		return ErrHostIDRequired
	}

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

		data.Hosts[i].Host.Pinned = pinned
		return s.saveLocked(data)
	}

	return ErrHostNotFound
}

// ReorderHosts 按传入 ID 顺序更新主机排序，未列出的主机保持相对顺序并排在后面。
// ReorderHosts updates host order using the provided IDs and appends omitted hosts in their existing relative order.
func (s *Store) ReorderHosts(hostIDs []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	entriesByID := make(map[string]hostEntry, len(data.Hosts))
	for _, entry := range data.Hosts {
		entriesByID[entry.Host.ID] = entry
	}

	nextHosts := make([]hostEntry, 0, len(data.Hosts))
	seen := make(map[string]bool, len(data.Hosts))
	for _, hostID := range hostIDs {
		if hostID == "" || seen[hostID] {
			continue
		}

		entry, ok := entriesByID[hostID]
		if !ok {
			return ErrHostNotFound
		}

		seen[hostID] = true
		nextHosts = append(nextHosts, entry)
	}

	for _, entry := range data.Hosts {
		if seen[entry.Host.ID] {
			continue
		}

		nextHosts = append(nextHosts, entry)
	}

	for i := range nextHosts {
		nextHosts[i].Host.SortOrder = i + 1
	}

	data.Hosts = nextHosts
	return s.saveLocked(data)
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
