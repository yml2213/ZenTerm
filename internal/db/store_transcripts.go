package db

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

const (
	transcriptDirName = "session-transcripts"
	transcriptFileExt = ".jsonl"
)

type sessionTranscriptEntry struct {
	LogID      string                        `json:"log_id"`
	SessionID  string                        `json:"session_id,omitempty"`
	Content    *security.Ciphertext          `json:"content,omitempty"`
	Chunks     []sessionTranscriptChunkEntry `json:"chunks,omitempty"`
	SizeBytes  int64                         `json:"size_bytes,omitempty"`
	UpdatedAt  time.Time                     `json:"updated_at,omitempty"`
	RecordedAt time.Time                     `json:"recorded_at,omitempty"`
}
type sessionTranscriptChunkEntry struct {
	Seq        int                  `json:"seq"`
	Content    *security.Ciphertext `json:"content,omitempty"`
	SizeBytes  int64                `json:"size_bytes,omitempty"`
	RecordedAt time.Time            `json:"recorded_at,omitempty"`
}
type sessionTranscriptFileChunk struct {
	SessionID  string              `json:"session_id,omitempty"`
	Seq        int                 `json:"seq,omitempty"`
	Content    security.Ciphertext `json:"content"`
	SizeBytes  int64               `json:"size_bytes,omitempty"`
	RecordedAt time.Time           `json:"recorded_at,omitempty"`
}

func (s *Store) AppendSessionTranscript(logID, sessionID, chunk string, vault *security.Vault) error {
	if logID == "" {
		return ErrSessionLogIDRequired
	}
	if chunk == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	exists := false
	for _, log := range data.SessionLogs {
		if log.ID == logID {
			exists = true
			break
		}
	}
	if !exists {
		return ErrSessionLogNotFound
	}

	return s.appendTranscriptFileChunkLocked(logID, sessionID, chunk, vault)
}

// GetSessionTranscript 解密并返回指定日志的终端输出 / decrypts and returns terminal output for a connection log.
func (s *Store) GetSessionTranscript(logID string, vault *security.Vault) (model.SessionTranscript, error) {
	if logID == "" {
		return model.SessionTranscript{}, ErrSessionLogIDRequired
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.SessionTranscript{}, err
	}

	var result model.SessionTranscript
	found := false

	for _, transcript := range data.SessionTranscripts {
		if transcript.LogID != logID {
			continue
		}

		content, err := decryptSessionTranscriptContent(transcript, vault)
		if err != nil {
			return model.SessionTranscript{}, fmt.Errorf("decrypt session transcript: %w", err)
		}
		sizeBytes := transcript.SizeBytes
		if sizeBytes == 0 {
			sizeBytes = int64(len([]byte(content)))
		}
		result = model.SessionTranscript{
			LogID:      transcript.LogID,
			SessionID:  transcript.SessionID,
			Content:    content,
			SizeBytes:  sizeBytes,
			UpdatedAt:  transcript.UpdatedAt,
			RecordedAt: transcript.RecordedAt,
		}
		found = true
		break
	}

	fileTranscript, fileFound, err := s.readTranscriptFileLocked(logID, vault)
	if err != nil {
		return model.SessionTranscript{}, err
	}
	if fileFound {
		if !found {
			result = fileTranscript
		} else {
			result.Content += fileTranscript.Content
			result.SizeBytes += fileTranscript.SizeBytes
			if result.SessionID == "" {
				result.SessionID = fileTranscript.SessionID
			}
			if result.RecordedAt.IsZero() || (!fileTranscript.RecordedAt.IsZero() && fileTranscript.RecordedAt.Before(result.RecordedAt)) {
				result.RecordedAt = fileTranscript.RecordedAt
			}
			if fileTranscript.UpdatedAt.After(result.UpdatedAt) {
				result.UpdatedAt = fileTranscript.UpdatedAt
			}
		}
		found = true
	}

	if !found {
		return model.SessionTranscript{}, ErrSessionTranscriptNotFound
	}
	return result, nil
}

// PruneSessionLogs 保留最新的 maxEntries 条连接历史记录 / keeps only the newest maxEntries connection history records.
func decryptSessionTranscriptContent(transcript sessionTranscriptEntry, vault *security.Vault) (string, error) {
	var builder strings.Builder
	if transcript.SizeBytes > 0 {
		builder.Grow(int(transcript.SizeBytes))
	}

	content, err := decryptOptional(transcript.Content, vault)
	if err != nil {
		return "", err
	}
	builder.WriteString(content)

	for _, chunk := range transcript.Chunks {
		plaintext, err := decryptOptional(chunk.Content, vault)
		if err != nil {
			return "", err
		}
		builder.WriteString(plaintext)
	}

	return builder.String(), nil
}
func (s *Store) appendTranscriptFileChunkLocked(logID, sessionID, chunk string, vault *security.Vault) error {
	encrypted, err := vault.EncryptString(chunk)
	if err != nil {
		return fmt.Errorf("encrypt session transcript chunk: %w", err)
	}

	if err := os.MkdirAll(s.transcriptDirPath(), 0o700); err != nil {
		return fmt.Errorf("create session transcript directory: %w", err)
	}

	file, err := os.OpenFile(s.transcriptFilePath(logID), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("open session transcript file: %w", err)
	}
	defer func() { _ = file.Close() }()

	record := sessionTranscriptFileChunk{
		SessionID:  sessionID,
		Content:    encrypted,
		SizeBytes:  int64(len([]byte(chunk))),
		RecordedAt: time.Now().UTC(),
	}
	if err := json.NewEncoder(file).Encode(record); err != nil {
		return fmt.Errorf("write session transcript chunk: %w", err)
	}
	return nil
}
func (s *Store) readTranscriptFileLocked(logID string, vault *security.Vault) (model.SessionTranscript, bool, error) {
	file, err := os.Open(s.transcriptFilePath(logID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return model.SessionTranscript{}, false, nil
		}
		return model.SessionTranscript{}, false, fmt.Errorf("open session transcript file: %w", err)
	}
	defer func() { _ = file.Close() }()

	decoder := json.NewDecoder(file)
	transcript := model.SessionTranscript{LogID: logID}
	var builder strings.Builder
	found := false
	for {
		var record sessionTranscriptFileChunk
		if err := decoder.Decode(&record); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return model.SessionTranscript{}, false, fmt.Errorf("decode session transcript chunk: %w", err)
		}

		plaintext, err := vault.DecryptString(record.Content)
		if err != nil {
			return model.SessionTranscript{}, false, fmt.Errorf("decrypt session transcript chunk: %w", err)
		}
		builder.WriteString(plaintext)
		if record.SizeBytes > 0 {
			transcript.SizeBytes += record.SizeBytes
		} else {
			transcript.SizeBytes += int64(len([]byte(plaintext)))
		}
		if record.SessionID != "" {
			transcript.SessionID = record.SessionID
		}
		if transcript.RecordedAt.IsZero() || (!record.RecordedAt.IsZero() && record.RecordedAt.Before(transcript.RecordedAt)) {
			transcript.RecordedAt = record.RecordedAt
		}
		if record.RecordedAt.After(transcript.UpdatedAt) {
			transcript.UpdatedAt = record.RecordedAt
		}
		found = true
	}

	transcript.Content = builder.String()
	return transcript, found, nil
}
func (s *Store) rekeyTranscriptFilesLocked(currentVault, nextVault *security.Vault) error {
	entries, err := os.ReadDir(s.transcriptDirPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read session transcript directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), transcriptFileExt) {
			continue
		}

		path := filepath.Join(s.transcriptDirPath(), entry.Name())
		records, err := readTranscriptFileRecords(path)
		if err != nil {
			return err
		}
		for i := range records {
			plaintext, err := currentVault.DecryptString(records[i].Content)
			if err != nil {
				return fmt.Errorf("decrypt session transcript chunk: %w", err)
			}
			encrypted, err := nextVault.EncryptString(plaintext)
			if err != nil {
				return fmt.Errorf("encrypt session transcript chunk: %w", err)
			}
			records[i].Content = encrypted
		}
		if err := replaceTranscriptFileRecords(path, records); err != nil {
			return err
		}
	}
	return nil
}
func readTranscriptFileRecords(path string) ([]sessionTranscriptFileChunk, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open session transcript file: %w", err)
	}
	defer func() { _ = file.Close() }()

	decoder := json.NewDecoder(file)
	records := []sessionTranscriptFileChunk{}
	for {
		var record sessionTranscriptFileChunk
		if err := decoder.Decode(&record); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, fmt.Errorf("decode session transcript chunk: %w", err)
		}
		records = append(records, record)
	}
	return records, nil
}
func replaceTranscriptFileRecords(path string, records []sessionTranscriptFileChunk) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create transcript directory: %w", err)
	}

	tmp, err := os.CreateTemp(filepath.Dir(path), ".transcript-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary transcript file: %w", err)
	}
	tmpPath := tmp.Name()
	encoder := json.NewEncoder(tmp)
	for _, record := range records {
		if err := encoder.Encode(record); err != nil {
			_ = tmp.Close()
			_ = os.Remove(tmpPath)
			return fmt.Errorf("write temporary transcript file: %w", err)
		}
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("close temporary transcript file: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("chmod temporary transcript file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("replace transcript file: %w", err)
	}
	return nil
}
func (s *Store) deleteTranscriptFilesLocked(logIDs []string) error {
	seen := make(map[string]struct{}, len(logIDs))
	for _, logID := range logIDs {
		if logID == "" {
			continue
		}
		if _, ok := seen[logID]; ok {
			continue
		}
		seen[logID] = struct{}{}

		if err := os.Remove(s.transcriptFilePath(logID)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("remove session transcript file: %w", err)
		}
	}
	return nil
}
func (s *Store) transcriptDirPath() string {
	return filepath.Join(filepath.Dir(s.path), transcriptDirName)
}
func (s *Store) transcriptFilePath(logID string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(logID))
	return filepath.Join(s.transcriptDirPath(), encoded+transcriptFileExt)
}
