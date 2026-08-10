package db

import (
	"encoding/base64"
	"fmt"
	"os"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

const vaultCheckToken = "zenterm:vault-check:v1"

type vaultData struct {
	Salt  string               `json:"salt"`
	Check *security.Ciphertext `json:"check,omitempty"`
	// KDF 持久化 Argon2 参数；旧 vault 缺该字段时读取端走默认值，保持向后兼容 / persists Argon2 params; legacy vaults without this field fall back to defaults on read.
	KDF *security.Argon2Params `json:"kdf,omitempty"`
}

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

// LoadKDFParams 读取持久化的 Argon2 参数；旧 vault 没有 KDF 字段时返回默认值，保证向后兼容 / reads persisted Argon2 params, falling back to defaults for legacy vaults that predate the KDF field.
func (s *Store) LoadKDFParams() (security.Argon2Params, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return security.Argon2Params{}, err
	}

	if data.Vault.KDF == nil {
		return security.DefaultArgon2Params(), nil
	}
	params, err := security.ValidateArgon2Params(*data.Vault.KDF)
	if err != nil {
		return security.Argon2Params{}, fmt.Errorf("validate stored KDF parameters: %w", err)
	}
	return params, nil
}

// SaveKDFParams 持久化当前使用的 KDF 参数，供下次启动时按同一参数派生密钥 / persists the KDF params in use so the next launch derives the key with the same cost.
func (s *Store) SaveKDFParams(params security.Argon2Params) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	sanitized, err := security.ValidateArgon2Params(params)
	if err != nil {
		return err
	}
	data.Vault.KDF = &sanitized
	return s.saveLocked(data)
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
		hostID := data.Hosts[i].Host.ID
		password, err := decryptOptional(data.Hosts[i].Identity.Password, currentVault, hostAAD(hostID, aadFieldPassword))
		if err != nil {
			return fmt.Errorf("decrypt password: %w", err)
		}
		privateKey, err := decryptOptional(data.Hosts[i].Identity.PrivateKey, currentVault, hostAAD(hostID, aadFieldPrivateKey))
		if err != nil {
			return fmt.Errorf("decrypt private key: %w", err)
		}

		encryptedPassword, err := encryptOptional(password, nextVault, hostAAD(hostID, aadFieldPassword))
		if err != nil {
			return fmt.Errorf("encrypt password: %w", err)
		}
		encryptedPrivateKey, err := encryptOptional(privateKey, nextVault, hostAAD(hostID, aadFieldPrivateKey))
		if err != nil {
			return fmt.Errorf("encrypt private key: %w", err)
		}

		data.Hosts[i].Identity.Password = encryptedPassword
		data.Hosts[i].Identity.PrivateKey = encryptedPrivateKey
	}

	// 凭据同样以 currentVault 加密落盘，必须随 rekey 一起重加密，否则改密码后绑定了 credential 的主机 GetIdentity 会解密失败 / credentials are encrypted with currentVault too and must be re-encrypted alongside hosts, otherwise hosts bound to a credential fail to decrypt their identity after rekey.
	for i := range data.Credentials {
		credID := data.Credentials[i].Credential.ID
		privateKey, err := decryptOptional(data.Credentials[i].Secret.PrivateKey, currentVault, credentialAAD(credID, aadFieldPrivateKey))
		if err != nil {
			return fmt.Errorf("decrypt credential private key: %w", err)
		}
		password, err := decryptOptional(data.Credentials[i].Secret.Password, currentVault, credentialAAD(credID, aadFieldPassword))
		if err != nil {
			return fmt.Errorf("decrypt credential password: %w", err)
		}

		encryptedPrivateKey, err := encryptOptional(privateKey, nextVault, credentialAAD(credID, aadFieldPrivateKey))
		if err != nil {
			return fmt.Errorf("encrypt credential private key: %w", err)
		}
		encryptedPassword, err := encryptOptional(password, nextVault, credentialAAD(credID, aadFieldPassword))
		if err != nil {
			return fmt.Errorf("encrypt credential password: %w", err)
		}

		data.Credentials[i].Secret.PrivateKey = encryptedPrivateKey
		data.Credentials[i].Secret.Password = encryptedPassword
	}

	for i := range data.SessionTranscripts {
		transcriptAADValue := transcriptAAD(data.SessionTranscripts[i].LogID)
		content, err := decryptOptional(data.SessionTranscripts[i].Content, currentVault, transcriptAADValue)
		if err != nil {
			return fmt.Errorf("decrypt session transcript: %w", err)
		}
		encryptedContent, err := encryptOptional(content, nextVault, transcriptAADValue)
		if err != nil {
			return fmt.Errorf("encrypt session transcript: %w", err)
		}
		data.SessionTranscripts[i].Content = encryptedContent

		for j := range data.SessionTranscripts[i].Chunks {
			chunk, err := decryptOptional(data.SessionTranscripts[i].Chunks[j].Content, currentVault, transcriptAADValue)
			if err != nil {
				return fmt.Errorf("decrypt session transcript chunk: %w", err)
			}
			encryptedChunk, err := encryptOptional(chunk, nextVault, transcriptAADValue)
			if err != nil {
				return fmt.Errorf("encrypt session transcript chunk: %w", err)
			}
			data.SessionTranscripts[i].Chunks[j].Content = encryptedChunk
		}
	}
	// 收集所有会话日志 ID，重新加密对应的分片文件 / collect session log IDs so the shard files are re-encrypted with the correct per-logID aad.
	logIDs := make([]string, 0, len(data.SessionLogs))
	for _, log := range data.SessionLogs {
		logIDs = append(logIDs, log.ID)
	}
	if err := s.rekeyTranscriptFilesLocked(currentVault, nextVault, logIDs); err != nil {
		return err
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
	data.SessionTranscripts = []sessionTranscriptEntry{}
	if err := s.saveLocked(data); err != nil {
		return err
	}
	if err := os.RemoveAll(s.transcriptDirPath()); err != nil {
		return fmt.Errorf("remove session transcript files: %w", err)
	}
	return nil
}

// AddHost 保存主机信息，并在写盘前加密其身份凭据 / stores a host and encrypts the provided identity before writing it to disk.
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
