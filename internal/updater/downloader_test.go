package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// validSHA256 是一个占位的合法 64 位 hex 校验和，实际值在测试中按内容动态计算 / a placeholder valid 64-hex checksum; tests compute the real value from the served content.
const validSHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

func TestDownload_RejectsMissingChecksum(t *testing.T) {
	dir := t.TempDir()
	d := NewDownloader(dir, nil)

	_, err := d.Download("https://example.com/asset.zip", "")
	if !errors.Is(err, ErrChecksumMissing) {
		t.Fatalf("Download() with empty checksum err = %v, want ErrChecksumMissing", err)
	}

	// 不应发起任何下载，目录为空
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("expected empty download dir, got %d entries", len(entries))
	}
}

func TestDownload_RejectsMalformedChecksum(t *testing.T) {
	dir := t.TempDir()
	d := NewDownloader(dir, nil)

	cases := []string{
		"abc",
		"tooshort",
		strings.Repeat("g", 64), // 非 hex 字符
		strings.Repeat("a", 63),
		strings.Repeat("a", 65),
	}
	for _, cs := range cases {
		if _, err := d.Download("https://example.com/asset.zip", cs); !errors.Is(err, ErrChecksumMissing) {
			t.Errorf("Download() checksum=%q err = %v, want ErrChecksumMissing", cs, err)
		}
	}
}

func TestDownload_RejectsChecksumMismatch(t *testing.T) {
	payload := []byte("hello world")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	d := NewDownloader(dir, nil)

	// 提供一个格式合法但内容不匹配的校验和
	mismatch := strings.Repeat("0", 64)
	_, err := d.Download(srv.URL+"/asset.zip", mismatch)
	if err == nil {
		t.Fatal("Download() with mismatched checksum should fail")
	}
	if errors.Is(err, ErrChecksumMissing) {
		t.Errorf("mismatch should not be reported as ErrChecksumMissing: %v", err)
	}

	// 校验失败应清理临时文件
	name := filepath.Base(srv.URL + "/asset.zip")
	if _, statErr := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(statErr) {
		t.Errorf("expected download file removed after checksum failure, statErr=%v", statErr)
	}
}

func TestDownload_SuccessWithValidChecksum(t *testing.T) {
	payload := []byte("zenterm update payload")
	sum := sha256.Sum256(payload)
	expected := hex.EncodeToString(sum[:])

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer srv.Close()

	dir := t.TempDir()
	d := NewDownloader(dir, nil)

	path, err := d.Download(srv.URL+"/asset.zip", expected)
	if err != nil {
		t.Fatalf("Download() valid err = %v", err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read downloaded file: %v", err)
	}
	if string(got) != string(payload) {
		t.Errorf("downloaded content = %q, want %q", got, payload)
	}
}
