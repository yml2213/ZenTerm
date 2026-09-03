package db

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

const (
	transcriptDirName       = "session-transcripts"
	transcriptFileExt       = ".jsonl"
	transcriptShardExt      = ".jsonl"
	transcriptShardMaxBytes = 4 * 1024 * 1024
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

	// 锁外加密：vault 的 AES-GCM 加密路径移出写锁，避免高频追加时阻塞其它读写 / encrypt outside the write lock so the vault's AES-GCM path doesn't block other readers/writers during high-frequency appends.
	plainSize := int64(len([]byte(chunk)))
	encrypted, err := vault.EncryptStringWithAAD(chunk, transcriptAAD(logID))
	if err != nil {
		return fmt.Errorf("encrypt session transcript chunk: %w", err)
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

	return s.appendTranscriptFileChunkLocked(logID, sessionID, encrypted, plainSize)
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

	aad := transcriptAAD(transcript.LogID)
	content, err := decryptOptional(transcript.Content, vault, aad)
	if err != nil {
		return "", err
	}
	builder.WriteString(content)

	for _, chunk := range transcript.Chunks {
		plaintext, err := decryptOptional(chunk.Content, vault, aad)
		if err != nil {
			return "", err
		}
		builder.WriteString(plaintext)
	}

	return builder.String(), nil
}
// appendTranscriptFileChunkLocked 把已加密的 chunk 追加到分片文件；加密在调用方锁外完成，这里只做文件 IO / appends an already-encrypted chunk to the shard file; encryption is done by the caller outside the lock, this only does file IO.
func (s *Store) appendTranscriptFileChunkLocked(logID, sessionID string, encrypted security.Ciphertext, plainSize int64) error {
	if err := os.MkdirAll(s.transcriptDirPath(), 0o700); err != nil {
		return fmt.Errorf("create session transcript directory: %w", err)
	}

	shardPath, err := s.activeTranscriptShardPath(logID)
	if err != nil {
		return err
	}

	file, err := os.OpenFile(shardPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("open session transcript file: %w", err)
	}
	defer func() { _ = file.Close() }()

	record := sessionTranscriptFileChunk{
		SessionID:  sessionID,
		Content:    encrypted,
		SizeBytes:  plainSize,
		RecordedAt: time.Now().UTC(),
	}
	if err := json.NewEncoder(file).Encode(record); err != nil {
		return fmt.Errorf("write session transcript chunk: %w", err)
	}
	return nil
}

// activeTranscriptShardPath 返回当前应写入的分片路径：若现有最新分片已达到 transcriptShardMaxBytes 上限，则滚动到下一个分片序号 / returns the shard path that should receive the next chunk, rolling over once the active shard reaches the size limit.
func (s *Store) activeTranscriptShardPath(logID string) (string, error) {
	shards, err := s.transcriptShardPaths(logID)
	if err != nil {
		return "", err
	}

	if len(shards) == 0 {
		return s.transcriptFilePath(logID), nil
	}

	latest := shards[len(shards)-1]
	info, err := os.Stat(latest)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return s.transcriptFilePath(logID), nil
		}
		return "", fmt.Errorf("stat session transcript shard: %w", err)
	}
	if info.Size() < transcriptShardMaxBytes {
		return latest, nil
	}

	return s.transcriptShardPath(logID, len(shards)), nil
}
func (s *Store) readTranscriptFileLocked(logID string, vault *security.Vault) (model.SessionTranscript, bool, error) {
	shards, err := s.transcriptShardPaths(logID)
	if err != nil {
		return model.SessionTranscript{}, false, err
	}
	if len(shards) == 0 {
		return model.SessionTranscript{}, false, nil
	}

	transcript := model.SessionTranscript{LogID: logID}
	var builder strings.Builder
	found := false

	for _, shardPath := range shards {
		file, err := os.Open(shardPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return model.SessionTranscript{}, false, fmt.Errorf("open session transcript file: %w", err)
		}

		decoder := json.NewDecoder(file)
		for {
			var record sessionTranscriptFileChunk
			if err := decoder.Decode(&record); err != nil {
				if errors.Is(err, io.EOF) {
					break
				}
				_ = file.Close()
				return model.SessionTranscript{}, false, fmt.Errorf("decode session transcript chunk: %w", err)
			}

			plaintext, err := vault.DecryptStringWithAAD(record.Content, transcriptAAD(logID))
			if err != nil {
				_ = file.Close()
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
		_ = file.Close()
	}

	transcript.Content = builder.String()
	return transcript, found, nil
}
// rekeyTranscriptFilesLocked 用 nextVault 重新加密所有给定 logID 的分片文件 / re-encrypts the shard files for the given logIDs with nextVault.
// logID 列表从 data.SessionLogs 提取，保证 aad 用原 logID 构造（文件名是 base64 编码的 logID，不能直接从文件名反解） / the logID list comes from data.SessionLogs so the aad is built from the original logID; the filename is a base64-encoded logID and can't be decoded back safely.
func (s *Store) rekeyTranscriptFilesLocked(currentVault, nextVault *security.Vault, logIDs []string) error {
	for _, logID := range logIDs {
		shards, err := s.transcriptShardPaths(logID)
		if err != nil {
			return fmt.Errorf("list session transcript shards: %w", err)
		}
		aad := transcriptAAD(logID)
		for _, shardPath := range shards {
			records, err := readTranscriptFileRecords(shardPath)
			if err != nil {
				return err
			}
			for i := range records {
				plaintext, err := currentVault.DecryptStringWithAAD(records[i].Content, aad)
				if err != nil {
					return fmt.Errorf("decrypt session transcript chunk: %w", err)
				}
				encrypted, err := nextVault.EncryptStringWithAAD(plaintext, aad)
				if err != nil {
					return fmt.Errorf("encrypt session transcript chunk: %w", err)
				}
				records[i].Content = encrypted
			}
			if err := replaceTranscriptFileRecords(shardPath, records); err != nil {
				return err
			}
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

		shards, err := s.transcriptShardPaths(logID)
		if err != nil {
			return err
		}
		for _, shard := range shards {
			if err := os.Remove(shard); err != nil && !errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("remove session transcript file: %w", err)
			}
		}
	}
	return nil
}
func (s *Store) transcriptDirPath() string {
	return filepath.Join(filepath.Dir(s.path), transcriptDirName)
}

// TranscriptBytes 统计会话终端输出文件的磁盘占用 / reports the total disk usage of session transcript files.
func (s *Store) TranscriptBytes() (int64, error) {
	var total int64
	err := filepath.Walk(s.transcriptDirPath(), func(_ string, info os.FileInfo, walkErr error) error {
		if walkErr == nil && !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return 0, err
	}
	return total, nil
}

// transcriptFilePath 返回该 logID 的主分片路径（seq=0），保留用于向后兼容的单文件入口 / returns the primary shard path (seq=0) for a log, kept as the backwards-compatible single-file entry point.
func (s *Store) transcriptFilePath(logID string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(logID))
	return filepath.Join(s.transcriptDirPath(), encoded+transcriptFileExt)
}

// transcriptShardPath 返回指定序号的分片路径；seq=0 等价于 transcriptFilePath / returns the shard path for the given sequence; seq=0 is equivalent to transcriptFilePath.
func (s *Store) transcriptShardPath(logID string, seq int) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(logID))
	name := encoded + transcriptShardExt
	if seq > 0 {
		name = fmt.Sprintf("%s.%d%s", encoded, seq, transcriptShardExt)
	}
	return filepath.Join(s.transcriptDirPath(), name)
}

// transcriptShardPaths 扫描 transcript 目录，返回该 logID 所有分片路径，按 seq 升序排列，seq=0（无后缀）排在最前 / scans the transcript directory and returns all shard paths for the log in ascending order, with the legacy un-suffixed file first.
func (s *Store) transcriptShardPaths(logID string) ([]string, error) {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(logID))
	prefix := encoded + "."
	suffix := transcriptShardExt

	dir := s.transcriptDirPath()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read session transcript directory: %w", err)
	}

	type shardEntry struct {
		seq  int
		path string
	}
	var shards []shardEntry
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if name == encoded+suffix {
			shards = append(shards, shardEntry{seq: 0, path: filepath.Join(dir, name)})
			continue
		}
		if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, suffix) {
			continue
		}
		mid := strings.TrimSuffix(strings.TrimPrefix(name, prefix), suffix)
		seq, err := strconv.Atoi(mid)
		if err != nil || seq < 1 {
			continue
		}
		shards = append(shards, shardEntry{seq: seq, path: filepath.Join(dir, name)})
	}

	sort.Slice(shards, func(i, j int) bool {
		return shards[i].seq < shards[j].seq
	})
	result := make([]string, len(shards))
	for i, shard := range shards {
		result[i] = shard.path
	}
	return result, nil
}
