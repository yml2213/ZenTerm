//go:build linux

package updater

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"testing"
)

func TestExtractAndStageLinuxUpdate_FileNotFound(t *testing.T) {
	_, _, err := ExtractAndStageLinuxUpdate("/nonexistent.tar.gz")
	if err == nil {
		t.Errorf("expected error on nonexistent tar.gz")
	}
}

func TestExtractAndStageLinuxUpdate_Success(t *testing.T) {
	tmpDir := t.TempDir()
	tarPath := filepath.Join(tmpDir, "linux.tar.gz")

	f, err := os.Create(tarPath)
	if err != nil {
		t.Fatalf("create tar.gz failed: %v", err)
	}
	gw := gzip.NewWriter(f)
	tw := tar.NewWriter(gw)

	content := []byte("mock linux binary")
	header := &tar.Header{
		Name: "ZenTerm",
		Mode: 0755,
		Size: int64(len(content)),
	}
	if err := tw.WriteHeader(header); err != nil {
		t.Fatalf("write header failed: %v", err)
	}
	if _, err := tw.Write(content); err != nil {
		t.Fatalf("write content failed: %v", err)
	}
	tw.Close()
	gw.Close()
	f.Close()

	binPath, stagingDir, err := ExtractAndStageLinuxUpdate(tarPath)
	if err != nil {
		t.Fatalf("ExtractAndStageLinuxUpdate failed: %v", err)
	}
	defer os.RemoveAll(stagingDir)

	if filepath.Base(binPath) != "ZenTerm" {
		t.Errorf("expected ZenTerm, got %s", binPath)
	}
}
