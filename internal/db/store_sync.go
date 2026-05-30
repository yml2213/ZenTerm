package db

import (
	"encoding/json"
	"errors"
	"fmt"

	"zenterm/internal/model"
)

type syncSnapshotData struct {
	Version     int                 `json:"version"`
	Vault       vaultData           `json:"vault"`
	Hosts       []hostEntry         `json:"hosts"`
	Credentials []credentialEntry   `json:"credentials"`
	SessionLogs *[]model.SessionLog `json:"session_logs,omitempty"`
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
	if len(payload) == 0 {
		return errors.New("sync snapshot is empty")
	}

	var snapshot syncSnapshotData
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return fmt.Errorf("decode sync snapshot: %w", err)
	}
	if snapshot.Version <= 0 || snapshot.Version > currentVersion {
		return fmt.Errorf("unsupported sync snapshot version: %d", snapshot.Version)
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
