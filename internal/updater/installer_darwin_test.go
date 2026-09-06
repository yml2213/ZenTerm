//go:build darwin

package updater

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestDetectCurrentAppBundle(t *testing.T) {
	bundle, err := DetectCurrentAppBundle()
	if err != nil {
		t.Fatalf("DetectCurrentAppBundle returned error: %v", err)
	}
	if bundle == "" {
		t.Errorf("DetectCurrentAppBundle should return a path")
	}
}

func TestExtractAndStageMacOSUpdate_FileNotFound(t *testing.T) {
	_, _, err := ExtractAndStageMacOSUpdate("/path/to/nonexistent.zip")
	if err == nil {
		t.Errorf("expected error for nonexistent zip")
	}
}

func TestExtractAndStageMacOSUpdate_InvalidArchive(t *testing.T) {
	tmpDir := t.TempDir()
	corruptZip := filepath.Join(tmpDir, "corrupt.zip")
	if err := os.WriteFile(corruptZip, []byte("not a real zip file"), 0644); err != nil {
		t.Fatalf("failed to write corrupt zip: %v", err)
	}

	_, _, err := ExtractAndStageMacOSUpdate(corruptZip)
	if err == nil {
		t.Errorf("expected error when extracting corrupted zip")
	}
}

func TestExtractAndStageMacOSUpdate_MissingApp(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "test.zip")

	// Create a zip with a plain text file, but no .app
	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip file failed: %v", err)
	}
	zw := zip.NewWriter(f)
	w, err := zw.Create("hello.txt")
	if err != nil {
		t.Fatalf("create entry in zip failed: %v", err)
	}
	if _, err := w.Write([]byte("hello world")); err != nil {
		t.Fatalf("write entry failed: %v", err)
	}
	zw.Close()
	f.Close()

	_, _, err = ExtractAndStageMacOSUpdate(zipPath)
	if err == nil {
		t.Errorf("expected error when .app is not in zip")
	}
}
