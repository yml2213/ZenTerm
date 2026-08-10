package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/security"
)

const syncEnvelopeVersion = 1

// SyncSnapshotEnvelope 是上传到远端 WebDAV 的外层加密包 / wraps the encrypted sync snapshot stored on WebDAV.
type SyncSnapshotEnvelope struct {
	Version    int    `json:"version"`
	App        string `json:"app"`
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name,omitempty"`
	// KDF 参数不是秘密，但必须在解密 Payload 前可用；旧同步包缺失时按默认参数兼容。
	KDF       security.Argon2Params `json:"kdf,omitempty"`
	Salt      string                `json:"salt"`
	Payload   security.Ciphertext   `json:"payload"`
	CreatedAt time.Time             `json:"created_at"`
}

// BuildEncryptedSyncSnapshot 构建可上传到 WebDAV 的端到端加密快照 / builds an end-to-end encrypted snapshot for WebDAV upload.
func (s *Service) BuildEncryptedSyncSnapshot(deviceID, deviceName string, includeSessionLogs bool) ([]byte, string, error) {
	if !s.vault.IsUnlocked() {
		return nil, "", security.ErrVaultLocked
	}

	salt, err := s.store.EnsureSalt()
	if err != nil {
		return nil, "", err
	}

	payload, err := s.store.ExportSyncSnapshot(includeSessionLogs)
	if err != nil {
		return nil, "", err
	}

	encrypted, err := s.vault.EncryptString(string(payload))
	if err != nil {
		return nil, "", fmt.Errorf("encrypt sync snapshot: %w", err)
	}

	envelope := SyncSnapshotEnvelope{
		Version:    syncEnvelopeVersion,
		App:        "ZenTerm",
		DeviceID:   deviceID,
		DeviceName: deviceName,
		KDF:        s.vault.Params(),
		Salt:       base64.StdEncoding.EncodeToString(salt),
		Payload:    encrypted,
		CreatedAt:  time.Now().UTC(),
	}
	bytes, err := json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		return nil, "", fmt.Errorf("encode sync envelope: %w", err)
	}

	return bytes, hashBytes(payload), nil
}

// CurrentSyncSnapshotHash 返回当前可同步数据的明文快照哈希，用于判断本地是否有未同步改动。
// CurrentSyncSnapshotHash returns the plaintext sync snapshot hash to detect unsynced local changes.
func (s *Service) CurrentSyncSnapshotHash(includeSessionLogs bool) (string, error) {
	payload, err := s.store.ExportSyncSnapshot(includeSessionLogs)
	if err != nil {
		return "", err
	}
	return hashBytes(payload), nil
}

// ApplyEncryptedSyncSnapshot 解密并导入远端同步快照 / decrypts and imports a remote sync snapshot.
func (s *Service) ApplyEncryptedSyncSnapshot(masterPassword string, envelopeBytes []byte) (string, string, string, error) {
	var envelope SyncSnapshotEnvelope
	if err := json.Unmarshal(envelopeBytes, &envelope); err != nil {
		return "", "", "", fmt.Errorf("decode sync envelope: %w", err)
	}
	if envelope.Version != syncEnvelopeVersion {
		return "", "", "", fmt.Errorf("unsupported sync envelope version: %d", envelope.Version)
	}
	if envelope.App != "" && envelope.App != "ZenTerm" {
		return "", "", "", fmt.Errorf("unsupported sync envelope app: %s", envelope.App)
	}

	salt, err := base64.StdEncoding.DecodeString(envelope.Salt)
	if err != nil {
		return "", "", "", fmt.Errorf("decode sync salt: %w", err)
	}

	remoteVault := security.NewVault()
	if err := remoteVault.SetParams(envelope.KDF); err != nil {
		return "", "", "", fmt.Errorf("validate sync KDF parameters: %w", err)
	}
	if err := remoteVault.Unlock(masterPassword, salt); err != nil {
		return "", "", "", err
	}
	defer remoteVault.Lock()

	payload, err := remoteVault.DecryptString(envelope.Payload)
	if err != nil {
		return "", "", "", security.ErrInvalidMasterPassword
	}
	metadata, err := db.InspectSyncSnapshot([]byte(payload))
	if err != nil {
		return "", "", "", fmt.Errorf("inspect sync snapshot: %w", err)
	}
	if !bytes.Equal(metadata.Salt, salt) {
		return "", "", "", errors.New("sync snapshot salt does not match envelope")
	}
	envelopeKDF, err := security.ValidateArgon2Params(envelope.KDF)
	if err != nil {
		return "", "", "", fmt.Errorf("validate sync KDF parameters: %w", err)
	}
	if metadata.KDF != envelopeKDF {
		return "", "", "", errors.New("sync snapshot KDF does not match envelope")
	}
	if err := db.ValidateSyncSnapshotSecrets([]byte(payload), remoteVault); err != nil {
		return "", "", "", fmt.Errorf("validate sync snapshot secrets: %w", err)
	}
	oldParams := s.vault.Params()
	oldVaultUnlocked := s.vault.IsUnlocked()
	oldSalt, err := s.store.EnsureSalt()
	if err != nil {
		return "", "", "", fmt.Errorf("read local vault salt: %w", err)
	}

	// 导入远端快照会覆盖本地数据，先备份再关闭会话：备份失败时直接返回，避免出现"会话已关闭但同步未导入"的中间态 / back up before closing sessions: on backup failure we bail out untouched, so we never end up with sessions closed but the import not applied.
	backupPath, err := s.store.BackupCurrent()
	if err != nil {
		return "", "", "", fmt.Errorf("backup before sync import: %w", err)
	}
	if err := s.CloseAll(); err != nil {
		return "", "", "", err
	}
	if err := s.store.ImportSyncSnapshot([]byte(payload)); err != nil {
		return "", "", "", err
	}
	imported := true
	rollback := func(cause error) error {
		if !imported {
			return cause
		}
		if restoreErr := s.store.RestoreBackup(backupPath); restoreErr != nil {
			return errors.Join(cause, fmt.Errorf("rollback sync import: %w", restoreErr))
		}
		if oldVaultUnlocked {
			s.vault.Lock()
			restoreErr := s.vault.SetParams(oldParams)
			if restoreErr == nil {
				restoreErr = s.vault.Unlock(masterPassword, oldSalt)
			}
			if restoreErr != nil {
				return errors.Join(cause, fmt.Errorf("restore local vault: %w", restoreErr))
			}
		} else {
			s.vault.Lock()
		}
		return cause
	}
	// 导入后用快照自带的 KDF 参数派生本地密钥，保证与源端一致 / after import, derive the local key with the snapshot's own KDF params so it matches the source.
	importedParams, err := s.store.LoadKDFParams()
	if err != nil {
		return "", "", "", rollback(err)
	}
	if err := s.vault.SetParams(importedParams); err != nil {
		return "", "", "", rollback(err)
	}
	if err := s.vault.Unlock(masterPassword, salt); err != nil {
		s.vault.Lock()
		return "", "", "", rollback(err)
	}
	if err := s.store.VerifyOrInitVaultCheck(s.vault); err != nil {
		s.vault.Lock()
		return "", "", "", rollback(err)
	}

	return envelope.DeviceID, envelope.DeviceName, hashBytes([]byte(payload)), nil
}

func hashBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
