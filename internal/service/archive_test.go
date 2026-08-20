package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalArchiveExtractAndCompress(t *testing.T) {
	svc := &Service{}

	tmpDir := t.TempDir()
	sourceDir := filepath.Join(tmpDir, "sample_dir")
	if err := os.MkdirAll(filepath.Join(sourceDir, "subdir"), 0o755); err != nil {
		t.Fatalf("mkdir error: %v", err)
	}

	testFile1 := filepath.Join(sourceDir, "file1.txt")
	if err := os.WriteFile(testFile1, []byte("hello zenterm archive"), 0o644); err != nil {
		t.Fatalf("write file1 error: %v", err)
	}
	testFile2 := filepath.Join(sourceDir, "subdir", "file2.txt")
	if err := os.WriteFile(testFile2, []byte("nested file content"), 0o644); err != nil {
		t.Fatalf("write file2 error: %v", err)
	}

	// 1. Test tar.gz compression and extraction
	tarGzArchive := filepath.Join(tmpDir, "output.tar.gz")
	if err := svc.CompressLocalEntry(sourceDir, tarGzArchive); err != nil {
		t.Fatalf("CompressLocalEntry tar.gz error = %v", err)
	}

	extractTargetTarGz := filepath.Join(tmpDir, "extracted_tar_gz")
	if err := svc.ExtractLocalArchive(tarGzArchive, extractTargetTarGz); err != nil {
		t.Fatalf("ExtractLocalArchive tar.gz error = %v", err)
	}

	extractedFile1 := filepath.Join(extractTargetTarGz, "sample_dir", "file1.txt")
	content, err := os.ReadFile(extractedFile1)
	if err != nil || string(content) != "hello zenterm archive" {
		t.Fatalf("read extracted file1: %v, content=%q", err, string(content))
	}

	// 2. Test zip compression and extraction
	zipArchive := filepath.Join(tmpDir, "output.zip")
	if err := svc.CompressLocalEntry(sourceDir, zipArchive); err != nil {
		t.Fatalf("CompressLocalEntry zip error = %v", err)
	}

	extractTargetZip := filepath.Join(tmpDir, "extracted_zip")
	if err := svc.ExtractLocalArchive(zipArchive, extractTargetZip); err != nil {
		t.Fatalf("ExtractLocalArchive zip error = %v", err)
	}

	extractedZipFile2 := filepath.Join(extractTargetZip, "sample_dir", "subdir", "file2.txt")
	content2, err := os.ReadFile(extractedZipFile2)
	if err != nil || string(content2) != "nested file content" {
		t.Fatalf("read extracted zip file2: %v, content=%q", err, string(content2))
	}
}

func TestBuildRemoteExtractAndCompressCommands(t *testing.T) {
	cmd, err := buildRemoteExtractCommand("/data/site.tar.gz", "/data/dest")
	if err != nil {
		t.Fatalf("buildRemoteExtractCommand error = %v", err)
	}
	if !strings.Contains(cmd, "tar -xzf") {
		t.Fatalf("expected tar -xzf, got %s", cmd)
	}

	cmdZip, err := buildRemoteExtractCommand("/data/site.zip", "/data/dest")
	if err != nil {
		t.Fatalf("buildRemoteExtractCommand zip error = %v", err)
	}
	if !strings.Contains(cmdZip, "unzip") {
		t.Fatalf("expected unzip check, got %s", cmdZip)
	}

	cmdComp, err := buildRemoteCompressCommand("/data/source_dir", "/data/output.tar.gz")
	if err != nil {
		t.Fatalf("buildRemoteCompressCommand error = %v", err)
	}
	if !strings.Contains(cmdComp, "tar -czf") {
		t.Fatalf("expected tar -czf, got %s", cmdComp)
	}
}
