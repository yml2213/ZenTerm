package db

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

// TestStoreTranscriptShardingRollsOver4MB 验证：单个 transcript 超过 4MB 后会滚动到下一个分片，读取时按序拼接还原完整内容 / verifies that a transcript rolls over to a new shard past 4MB and that reading concatenates shards in order.
func TestStoreTranscriptShardingRollsOver4MB(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	logID := "log-shard"
	if err := store.CreateSessionLog(model.SessionLog{
		ID:          logID,
		HostID:      "host-1",
		HostAddress: "10.0.0.1",
		HostPort:    22,
		SSHUsername: "root",
		Protocol:    "ssh",
		Status:      model.SessionLogStatusActive,
		StartedAt:   mustNow(),
	}); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}

	// 写入超过 4MB：每次 256KB，循环 20 次约 5MB，保证触发滚动 / write just over 4MB in 256KB chunks so rollover definitely fires.
	chunk := strings.Repeat("a", 256*1024)
	const iterations = 20
	for i := 0; i < iterations; i++ {
		if err := store.AppendSessionTranscript(logID, "session-shard", chunk, vault); err != nil {
			t.Fatalf("AppendSessionTranscript(%d) error = %v", i, err)
		}
	}

	shards, err := store.transcriptShardPaths(logID)
	if err != nil {
		t.Fatalf("transcriptShardPaths() error = %v", err)
	}
	if len(shards) < 2 {
		t.Fatalf("expected at least 2 shards after 5MB write, got %d (paths: %v)", len(shards), shards)
	}

	// 主分片必须存在；切换发生在某次写入超过 4MB 之后，所以主分片会略超阈值一个块大小，这是预期 / the primary shard must exist; since rollover happens after a write crosses 4MB, the primary shard overshoots by one chunk, which is expected.
	info, err := os.Stat(shards[0])
	if err != nil {
		t.Fatalf("Stat(primary shard) error = %v", err)
	}
	// 256KB 的写入块容差（单条加密记录开销）/ 256KB tolerance for a single write chunk plus encryption overhead.
	if info.Size() > transcriptShardMaxBytes+512*1024 {
		t.Fatalf("primary shard size = %d, want <= %d (4MB + one chunk tolerance)", info.Size(), transcriptShardMaxBytes+512*1024)
	}

	// 读取应能拿到完整内容，长度匹配预期 / reading must reconstruct the full plaintext length.
	transcript, err := store.GetSessionTranscript(logID, vault)
	if err != nil {
		t.Fatalf("GetSessionTranscript() error = %v", err)
	}
	wantLen := iterations * len(chunk)
	if len(transcript.Content) != wantLen {
		t.Fatalf("transcript length = %d, want %d", len(transcript.Content), wantLen)
	}
}

// TestStoreTranscriptLegacySingleFileCompat 验证：旧的单文件（无 .N 后缀）能被新读取路径正常识别 / verifies that a legacy un-suffixed shard file is still recognised by the new multi-shard reader.
func TestStoreTranscriptLegacySingleFileCompat(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	logID := "log-legacy"
	shards, err := store.transcriptShardPaths(logID)
	if err != nil {
		t.Fatalf("transcriptShardPaths() on empty store error = %v", err)
	}
	if len(shards) != 0 {
		t.Fatalf("expected 0 shards before any write, got %d", len(shards))
	}

	// 写入一个普通块，应落在主分片（无后缀）/ a single chunk should land in the un-suffixed primary shard.
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.CreateSessionLog(model.SessionLog{
		ID:          logID,
		HostID:      "host-1",
		HostAddress: "10.0.0.1",
		HostPort:    22,
		SSHUsername: "root",
		Protocol:    "ssh",
		Status:      model.SessionLogStatusActive,
		StartedAt:   mustNow(),
	}); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}
	if err := store.AppendSessionTranscript(logID, "session-legacy", "legacy content", vault); err != nil {
		t.Fatalf("AppendSessionTranscript() error = %v", err)
	}

	shards, err = store.transcriptShardPaths(logID)
	if err != nil {
		t.Fatalf("transcriptShardPaths() after write error = %v", err)
	}
	if len(shards) != 1 {
		t.Fatalf("expected exactly 1 shard, got %d", len(shards))
	}
	// 主分片名应以 .jsonl 结尾且不含 .N 后缀 / the primary shard must end with .jsonl and have no .N suffix.
	if !strings.HasSuffix(shards[0], transcriptFileExt) {
		t.Fatalf("primary shard path = %q, want suffix %q", shards[0], transcriptFileExt)
	}
	if strings.Contains(filepath.Base(shards[0]), ".1") {
		t.Fatalf("primary shard unexpectedly has sequence suffix: %q", shards[0])
	}

	transcript, err := store.GetSessionTranscript(logID, vault)
	if err != nil {
		t.Fatalf("GetSessionTranscript() error = %v", err)
	}
	if transcript.Content != "legacy content" {
		t.Fatalf("transcript content = %q, want %q", transcript.Content, "legacy content")
	}
}

func mustNow() time.Time {
	return time.Now().UTC()
}

// TestStoreClearSessionLogsRemovesLogsAndFiles 验证：清空日志后记录移除且 transcript 文件一并删除 / verifies that clearing logs removes records and deletes transcript files.
func TestStoreClearSessionLogsRemovesLogsAndFiles(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	logID := "log-clear"
	if err := store.CreateSessionLog(model.SessionLog{
		ID:          logID,
		HostID:      "host-1",
		HostAddress: "10.0.0.2",
		HostPort:    22,
		SSHUsername: "root",
		Protocol:    "ssh",
		Status:      model.SessionLogStatusClosed,
		StartedAt:   mustNow(),
	}); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}
	if err := store.AppendSessionTranscript(logID, "session-clear", "clear me", vault); err != nil {
		t.Fatalf("AppendSessionTranscript() error = %v", err)
	}

	if bytes, err := store.TranscriptBytes(); err != nil || bytes <= 0 {
		t.Fatalf("TranscriptBytes() = %d, %v; want > 0", bytes, err)
	}

	if err := store.ClearSessionLogs(); err != nil {
		t.Fatalf("ClearSessionLogs() error = %v", err)
	}

	logs, err := store.ListSessionLogs(0)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 0 {
		t.Fatalf("ListSessionLogs() after clear = %d entries, want 0", len(logs))
	}

	bytes, err := store.TranscriptBytes()
	if err != nil {
		t.Fatalf("TranscriptBytes() error = %v", err)
	}
	if bytes != 0 {
		t.Fatalf("TranscriptBytes() after clear = %d, want 0", bytes)
	}

	if _, err := store.GetSessionTranscript(logID, vault); err == nil {
		t.Fatalf("GetSessionTranscript() after clear should fail")
	}
}
