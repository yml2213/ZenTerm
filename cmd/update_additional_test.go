package cmd

import (
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
