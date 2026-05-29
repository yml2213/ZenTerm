package service

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"zenterm/internal/security"
)

const syncEnvelopeVersion = 1

// SyncSnapshotEnvelope 是上传到远端 WebDAV 的外层加密包 / wraps the encrypted sync snapshot stored on WebDAV.
type SyncSnapshotEnvelope struct {
	Version   int                 `json:"version"`
	App       string              `json:"app"`
	DeviceID  string              `json:"device_id"`
	Salt      string              `json:"salt"`
	Payload   security.Ciphertext `json:"payload"`
	CreatedAt time.Time           `json:"created_at"`
}

// BuildEncryptedSyncSnapshot 构建可上传到 WebDAV 的端到端加密快照 / builds an end-to-end encrypted snapshot for WebDAV upload.
func (s *Service) BuildEncryptedSyncSnapshot(deviceID string, includeSessionLogs bool) ([]byte, string, error) {
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
		Version:   syncEnvelopeVersion,
		App:       "ZenTerm",
		DeviceID:  deviceID,
		Salt:      base64.StdEncoding.EncodeToString(salt),
		Payload:   encrypted,
		CreatedAt: time.Now().UTC(),
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
func (s *Service) ApplyEncryptedSyncSnapshot(masterPassword string, envelopeBytes []byte) (string, string, error) {
	var envelope SyncSnapshotEnvelope
	if err := json.Unmarshal(envelopeBytes, &envelope); err != nil {
		return "", "", fmt.Errorf("decode sync envelope: %w", err)
	}
	if envelope.Version != syncEnvelopeVersion {
		return "", "", fmt.Errorf("unsupported sync envelope version: %d", envelope.Version)
	}
	if envelope.App != "" && envelope.App != "ZenTerm" {
		return "", "", fmt.Errorf("unsupported sync envelope app: %s", envelope.App)
	}

	salt, err := base64.StdEncoding.DecodeString(envelope.Salt)
	if err != nil {
		return "", "", fmt.Errorf("decode sync salt: %w", err)
	}

	remoteVault := security.NewVault()
	if err := remoteVault.Unlock(masterPassword, salt); err != nil {
		return "", "", err
	}
	defer remoteVault.Lock()

	payload, err := remoteVault.DecryptString(envelope.Payload)
	if err != nil {
		return "", "", security.ErrInvalidMasterPassword
	}

	if err := s.CloseAll(); err != nil {
		return "", "", err
	}
	if err := s.store.ImportSyncSnapshot([]byte(payload)); err != nil {
		return "", "", err
	}
	if err := s.vault.Unlock(masterPassword, salt); err != nil {
		s.vault.Lock()
		return "", "", err
	}
	if err := s.store.VerifyOrInitVaultCheck(s.vault); err != nil {
		s.vault.Lock()
		return "", "", err
	}

	return envelope.DeviceID, hashBytes([]byte(payload)), nil
}

func hashBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}
