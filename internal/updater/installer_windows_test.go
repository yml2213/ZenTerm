//go:build windows

package updater

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestExtractAndStageWindowsUpdate_FileNotFound(t *testing.T) {
	_, _, err := ExtractAndStageWindowsUpdate("C:\\nonexistent.zip")
	if err == nil {
		t.Errorf("expected error on nonexistent zip")
	}
}

func TestExtractAndStageWindowsUpdate_Success(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "windows.zip")

	f, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip failed: %v", err)
	}
	zw := zip.NewWriter(f)
	w, err := zw.Create("ZenTerm.exe")
	if err != nil {
		t.Fatalf("create entry failed: %v", err)
	}
	_, _ = w.Write([]byte("mock exe"))
	zw.Close()
	f.Close()

	exePath, stagingDir, err := ExtractAndStageWindowsUpdate(zipPath)
	if err != nil {
		t.Fatalf("ExtractAndStageWindowsUpdate failed: %v", err)
	}
	defer os.RemoveAll(stagingDir)

	if filepath.Base(exePath) != "ZenTerm.exe" {
		t.Errorf("expected ZenTerm.exe, got %s", exePath)
	}
}
