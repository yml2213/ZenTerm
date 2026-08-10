package db

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

type syncSnapshotData struct {
	Version     int                 `json:"version"`
	Vault       vaultData           `json:"vault"`
	Hosts       []hostEntry         `json:"hosts"`
	Credentials []credentialEntry   `json:"credentials"`
	SessionLogs *[]model.SessionLog `json:"session_logs,omitempty"`
}

// SyncSnapshotMetadata 是导入前可安全检查的快照元数据 / contains snapshot metadata that can be checked before replacing local data.
type SyncSnapshotMetadata struct {
	Salt []byte
	KDF  security.Argon2Params
}

// InspectSyncSnapshot 解析并验证快照的版本、盐值和 KDF 参数，不修改本地存储 / parses and validates snapshot metadata without modifying local storage.
func InspectSyncSnapshot(payload []byte) (SyncSnapshotMetadata, error) {
	snapshot, err := decodeSyncSnapshot(payload)
	if err != nil {
		return SyncSnapshotMetadata{}, err
	}

	salt, err := base64.StdEncoding.DecodeString(snapshot.Vault.Salt)
	if err != nil {
		return SyncSnapshotMetadata{}, fmt.Errorf("decode sync snapshot salt: %w", err)
	}
	if len(salt) < 16 {
		return SyncSnapshotMetadata{}, security.ErrInvalidSalt
	}

	params := security.DefaultArgon2Params()
	if snapshot.Vault.KDF != nil {
		params = *snapshot.Vault.KDF
	}
	params, err = security.ValidateArgon2Params(params)
	if err != nil {
		return SyncSnapshotMetadata{}, fmt.Errorf("validate sync snapshot KDF parameters: %w", err)
	}

	return SyncSnapshotMetadata{Salt: salt, KDF: params}, nil
}

// ValidateSyncSnapshotSecrets 校验快照中的校验哨兵、主机和凭据密文，避免导入后才发现无法解密 / validates encrypted sentinels, hosts, and credentials before import.
func ValidateSyncSnapshotSecrets(payload []byte, vault *security.Vault) error {
	if vault == nil {
		return security.ErrVaultLocked
	}
	snapshot, err := decodeSyncSnapshot(payload)
	if err != nil {
		return err
	}

	if snapshot.Vault.Check != nil {
		plaintext, err := vault.DecryptString(*snapshot.Vault.Check)
		if err != nil || plaintext != vaultCheckToken {
			return security.ErrInvalidMasterPassword
		}
	}
	for _, entry := range snapshot.Hosts {
		if _, err := decryptOptional(entry.Identity.Password, vault, hostAAD(entry.Host.ID, aadFieldPassword)); err != nil {
			return fmt.Errorf("validate host password: %w", err)
		}
		if _, err := decryptOptional(entry.Identity.PrivateKey, vault, hostAAD(entry.Host.ID, aadFieldPrivateKey)); err != nil {
			return fmt.Errorf("validate host private key: %w", err)
		}
	}
	for _, entry := range snapshot.Credentials {
		if _, err := decryptOptional(entry.Secret.Password, vault, credentialAAD(entry.Credential.ID, aadFieldPassword)); err != nil {
			return fmt.Errorf("validate credential password: %w", err)
		}
		if _, err := decryptOptional(entry.Secret.PrivateKey, vault, credentialAAD(entry.Credential.ID, aadFieldPrivateKey)); err != nil {
			return fmt.Errorf("validate credential private key: %w", err)
		}
	}
	return nil
}

// NewStore 为指定文件路径创建一个基于 JSON 的存储实现 / creates a JSON-backed store for the given file path.
func (s *Store) ExportSyncSnapshot(includeSessionLogs bool) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	snapshot := syncSnapshotData{
		Version:     currentVersion,
		Vault:       data.Vault,
		Hosts:       append([]hostEntry(nil), data.Hosts...),
		Credentials: append([]credentialEntry(nil), data.Credentials...),
	}
	if includeSessionLogs {
		logs := append([]model.SessionLog(nil), data.SessionLogs...)
		snapshot.SessionLogs = &logs
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return nil, fmt.Errorf("encode sync snapshot: %w", err)
	}
	return payload, nil
}

// ImportSyncSnapshot 导入同步快照；只替换可同步数据，保留本机窗口状态和 transcript 文件。
// ImportSyncSnapshot imports a sync snapshot while preserving local-only window state and transcript files.
func (s *Store) ImportSyncSnapshot(payload []byte) error {
	snapshot, err := decodeSyncSnapshot(payload)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	data.Version = currentVersion
	data.Vault = snapshot.Vault
	data.Hosts = append([]hostEntry(nil), snapshot.Hosts...)
	data.Credentials = append([]credentialEntry(nil), snapshot.Credentials...)
	if snapshot.SessionLogs != nil {
		data.SessionLogs = append([]model.SessionLog(nil), (*snapshot.SessionLogs)...)
	}
	data.SessionTranscripts = nil

	return s.saveLocked(data)
}

func decodeSyncSnapshot(payload []byte) (syncSnapshotData, error) {
	if len(payload) == 0 {
		return syncSnapshotData{}, errors.New("sync snapshot is empty")
	}

	var snapshot syncSnapshotData
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return syncSnapshotData{}, fmt.Errorf("decode sync snapshot: %w", err)
	}
	if snapshot.Version <= 0 || snapshot.Version > currentVersion {
		return syncSnapshotData{}, fmt.Errorf("unsupported sync snapshot version: %d", snapshot.Version)
	}
	return snapshot, nil
}
