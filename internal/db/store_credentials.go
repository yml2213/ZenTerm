package db

import (
	"fmt"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

type credentialEntry struct {
	Credential model.Credential    `json:"credential"`
	Secret     encryptedCredential `json:"secret"`
}
type encryptedCredential struct {
	PrivateKey *security.Ciphertext `json:"private_key,omitempty"`
	Password   *security.Ciphertext `json:"password,omitempty"`
}

func (s *Store) AddCredential(cred model.Credential, privateKey, password string, vault *security.Vault) error {
	if cred.ID == "" {
		return ErrCredentialIDRequired
	}

	encPrivateKey, err := encryptOptional(privateKey, vault, credentialAAD(cred.ID, aadFieldPrivateKey))
	if err != nil {
		return fmt.Errorf("encrypt private key: %w", err)
	}

	encPassword, err := encryptOptional(password, vault, credentialAAD(cred.ID, aadFieldPassword))
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

		privateKey, err := decryptOptional(entry.Secret.PrivateKey, vault, credentialAAD(entry.Credential.ID, aadFieldPrivateKey))
		if err != nil {
			return "", "", fmt.Errorf("decrypt private key: %w", err)
		}

		password, err := decryptOptional(entry.Secret.Password, vault, credentialAAD(entry.Credential.ID, aadFieldPassword))
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
			data.Credentials[i].Credential.LastUsedAt = time.Now().UTC()
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
