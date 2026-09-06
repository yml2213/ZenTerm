package cmd

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"zenterm/internal/model"
)

func TestShouldRunScheduledUpdateCheck(t *testing.T) {
	now := time.Unix(2_000_000, 0)
	tests := []struct {
		name   string
		config model.UpdateConfig
		want   bool
	}{
		{name: "disabled", config: model.UpdateConfig{Enabled: false}, want: false},
		{name: "every startup", config: model.UpdateConfig{Enabled: true}, want: true},
		{name: "never checked", config: model.UpdateConfig{Enabled: true, CheckInterval: 24}, want: true},
		{name: "not due", config: model.UpdateConfig{Enabled: true, CheckInterval: 24, LastCheckTime: now.Add(-time.Hour).Unix()}, want: false},
		{name: "due", config: model.UpdateConfig{Enabled: true, CheckInterval: 24, LastCheckTime: now.Add(-25 * time.Hour).Unix()}, want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldRunScheduledUpdateCheck(tt.config, now); got != tt.want {
				t.Fatalf("shouldRunScheduledUpdateCheck() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAppSkipVersionPersistsUpdateConfig(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	if err := app.SaveUpdateConfig(model.UpdateConfig{Enabled: true, CheckInterval: 12, Channel: "stable"}); err != nil {
		t.Fatalf("SaveUpdateConfig() error = %v", err)
	}
	if err := app.SkipVersion("1.2.3"); err != nil {
		t.Fatalf("SkipVersion() error = %v", err)
	}
	config, err := app.GetUpdateConfig()
	if err != nil || config.SkippedVersion != "1.2.3" || config.CheckInterval != 12 {
		t.Fatalf("GetUpdateConfig() = (%#v, %v)", config, err)
	}
}

func TestCleanOldUpdateFiles(t *testing.T) {
	tmpDir := t.TempDir()

	keepFile := filepath.Join(tmpDir, "ZenTerm-0.2.0-macos-arm64.zip")
	_ = os.WriteFile(keepFile, []byte("new"), 0644)
	_ = os.WriteFile(keepFile+".sha256", []byte("hash"), 0644)

	oldFile1 := filepath.Join(tmpDir, "ZenTerm-0.1.9-macos-arm64.zip")
	_ = os.WriteFile(oldFile1, []byte("old"), 0644)
	oldSha := filepath.Join(tmpDir, "ZenTerm-0.1.9-macos-arm64.zip.sha256")
	_ = os.WriteFile(oldSha, []byte("old"), 0644)

	stagedDir := filepath.Join(tmpDir, "staged_20260101")
	_ = os.MkdirAll(stagedDir, 0755)

	cleanOldUpdateFiles(tmpDir, keepFile)

	if _, err := os.Stat(keepFile); err != nil {
		t.Errorf("keepFile should still exist")
	}
	if _, err := os.Stat(keepFile + ".sha256"); err != nil {
		t.Errorf("keepFile.sha256 should still exist")
	}
	if _, err := os.Stat(oldFile1); err == nil {
		t.Errorf("oldFile1 should have been deleted")
	}
	if _, err := os.Stat(oldSha); err == nil {
		t.Errorf("oldSha should have been deleted")
	}
	if _, err := os.Stat(stagedDir); err == nil {
		t.Errorf("stagedDir should have been deleted")
	}
}

func TestInstallUpdateAndRestart_Validation(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}

	// Empty path
	if err := app.InstallUpdateAndRestart(""); err == nil {
		t.Errorf("expected error on empty file path")
	}

	// Non-existent path
	if err := app.InstallUpdateAndRestart("/nonexistent/file.zip"); err == nil {
		t.Errorf("expected error on nonexistent file path")
	}
}

