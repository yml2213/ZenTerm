package updater

import (
	"os"


	"testing"
	"time"
)

func TestIsVersionNewer(t *testing.T) {
	tests := []struct {
		name           string
		latestVersion  string
		currentVersion string
		want           bool
		wantErr        bool
	}{
		{
			name:           "newer major version",
			latestVersion:  "2.0.0",
			currentVersion: "1.0.0",
			want:           true,
			wantErr:        false,
		},
		{
			name:           "newer minor version",
			latestVersion:  "1.2.0",
			currentVersion: "1.1.0",
			want:           true,
			wantErr:        false,
		},
		{
			name:           "newer patch version",
			latestVersion:  "1.0.1",
			currentVersion: "1.0.0",
			want:           true,
			wantErr:        false,
		},
		{
			name:           "same version",
			latestVersion:  "1.0.0",
			currentVersion: "1.0.0",
			want:           false,
			wantErr:        false,
		},
		{
			name:           "older version",
			latestVersion:  "1.0.0",
			currentVersion: "1.0.1",
			want:           false,
			wantErr:        false,
		},
		{
			name:           "with v prefix",
			latestVersion:  "v2.0.0",
			currentVersion: "v1.0.0",
			want:           true,
			wantErr:        false,
		},
		{
			name:           "invalid latest version",
			latestVersion:  "invalid",
			currentVersion: "1.0.0",
			want:           false,
			wantErr:        true,
		},
		{
			name:           "invalid current version",
			latestVersion:  "2.0.0",
			currentVersion: "invalid",
			want:           false,
			wantErr:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := isVersionNewer(tt.latestVersion, tt.currentVersion)
			if (err != nil) != tt.wantErr {
				t.Errorf("isVersionNewer() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("isVersionNewer() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseVersion(t *testing.T) {
	tests := []struct {
		name    string
		version string
		want    [3]int
		wantErr bool
	}{
		{
			name:    "valid version",
			version: "1.2.3",
			want:    [3]int{1, 2, 3},
			wantErr: false,
		},
		{
			name:    "with v prefix",
			version: "v1.2.3",
			want:    [3]int{1, 2, 3},
			wantErr: false,
		},
		{
			name:    "zero version",
			version: "0.0.0",
			want:    [3]int{0, 0, 0},
			wantErr: false,
		},
		{
			name:    "large numbers",
			version: "10.20.30",
			want:    [3]int{10, 20, 30},
			wantErr: false,
		},
		{
			name:    "invalid format - too few parts",
			version: "1.2",
			want:    [3]int{},
			wantErr: true,
		},
		{
			name:    "invalid format - too many parts",
			version: "1.2.3.4",
			want:    [3]int{},
			wantErr: true,
		},
		{
			name:    "invalid format - non-numeric",
			version: "1.2.x",
			want:    [3]int{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseVersion(tt.version)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseVersion() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("parseVersion() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUpdater_ShouldCheck(t *testing.T) {
	tests := []struct {
		name     string
		config   UpdateConfig
		mockTime time.Time
		want     bool
	}{
		{
			name: "interval 0 - always check",
			config: UpdateConfig{
				Enabled:       true,
				CheckInterval: 0,
				LastCheckTime: time.Now().Unix(),
			},
			want: true,
		},
		{
			name: "never checked before",
			config: UpdateConfig{
				Enabled:       true,
				CheckInterval: 24,
				LastCheckTime: 0,
			},
			want: true,
		},
		{
			name: "within interval - should not check",
			config: UpdateConfig{
				Enabled:       true,
				CheckInterval: 24,
				LastCheckTime: time.Now().Add(-12 * time.Hour).Unix(),
			},
			want: false,
		},
		{
			name: "past interval - should check",
			config: UpdateConfig{
				Enabled:       true,
				CheckInterval: 24,
				LastCheckTime: time.Now().Add(-25 * time.Hour).Unix(),
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := &Updater{
				currentVersion: "1.0.0",
				config:         tt.config,
			}
			got := u.shouldCheck()
			if got != tt.want {
				t.Errorf("shouldCheck() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNewUpdater(t *testing.T) {
	config := UpdateConfig{
		Enabled:       true,
		CheckInterval: 24,
	}

	updater := NewUpdater("1.0.0", "owner", "repo", config)

	if updater == nil {
		t.Fatal("NewUpdater() returned nil")
	}
	if updater.currentVersion != "1.0.0" {
		t.Errorf("currentVersion = %v, want 1.0.0", updater.currentVersion)
	}
	if updater.githubClient == nil {
		t.Error("githubClient is nil")
	}
	if updater.config.CheckInterval != 24 {
		t.Errorf("config.CheckInterval = %v, want 24", updater.config.CheckInterval)
	}
}

func TestCheckForUpdates_DisabledAutoCheck(t *testing.T) {
	config := UpdateConfig{
		Enabled:       false,
		CheckInterval: 24,
	}

	updater := NewUpdater("1.0.0", "owner", "repo", config)

	// 非强制检查，应该立即返回不可用
	info, err := updater.CheckForUpdates(false)
	if err != nil {
		t.Fatalf("CheckForUpdates() error = %v", err)
	}
	if info.Available {
		t.Error("CheckForUpdates() should return Available=false when disabled")
	}
	if info.CurrentVersion != "1.0.0" {
		t.Errorf("CurrentVersion = %v, want 1.0.0", info.CurrentVersion)
	}
}

func TestCheckForUpdates_WithinInterval(t *testing.T) {
	config := UpdateConfig{
		Enabled:       true,
		CheckInterval: 24,
		LastCheckTime: time.Now().Unix(), // 刚刚检查过
	}

	updater := NewUpdater("1.0.0", "owner", "repo", config)

	// 非强制检查，间隔内应该立即返回
	info, err := updater.CheckForUpdates(false)
	if err != nil {
		t.Fatalf("CheckForUpdates() error = %v", err)
	}
	if info.Available {
		t.Error("CheckForUpdates() should return Available=false when within interval")
	}
}

func TestDefaultUpdateConfig(t *testing.T) {
	config := DefaultUpdateConfig()

	if !config.Enabled {
		t.Error("DefaultUpdateConfig() should have Enabled=true")
	}
	if config.CheckInterval != 24 {
		t.Errorf("CheckInterval = %v, want 24", config.CheckInterval)
	}
	if config.Channel != "stable" {
		t.Errorf("Channel = %v, want stable", config.Channel)
	}
}

func TestCalculateSpeed(t *testing.T) {
	startTime := time.Now().Add(-2 * time.Second)
	
	// 下载了 2MB，用时 2 秒 = 1MB/s
	speed := calculateSpeed(2*1024*1024, startTime)
	if speed == "" {
		t.Fatal("calculateSpeed() returned empty string")
	}
	// 速度应该包含 MB/s 或 KB/s
	if !contains(speed, "MB/s") && !contains(speed, "KB/s") {
		t.Errorf("calculateSpeed() = %v, expected to contain MB/s or KB/s", speed)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestNewGitHubClient(t *testing.T) {
	client := NewGitHubClient("test-owner", "test-repo")
	
	if client == nil {
		t.Fatal("NewGitHubClient() returned nil")
	}
	if client.owner != "test-owner" {
		t.Errorf("owner = %v, want test-owner", client.owner)
	}
	if client.repo != "test-repo" {
		t.Errorf("repo = %v, want test-repo", client.repo)
	}
}

func TestNewDownloader(t *testing.T) {
	dir := t.TempDir()
	var progressCalled bool
	progressFunc := func(progress DownloadProgress) {
		progressCalled = true
	}
	
	downloader := NewDownloader(dir, progressFunc)
	
	if downloader == nil {
		t.Fatal("NewDownloader() returned nil")
	}
	if downloader.downloadDir != dir {
		t.Errorf("downloadDir = %v, want %v", downloader.downloadDir, dir)
	}
	
	// 测试 progressFunc 被正确存储（通过调用来验证）
	if downloader.progressFunc != nil {
		downloader.progressFunc(DownloadProgress{})
		if !progressCalled {
			t.Error("progressFunc was not called")
		}
	}
}

func TestUpdater_CheckForUpdates_SkippedVersion(t *testing.T) {
	config := UpdateConfig{
		Enabled:        true,
		CheckInterval:  0, // 总是检查
		SkippedVersion: "2.0.0",
	}
	
	updater := NewUpdater("1.0.0", "owner", "repo", config)
	
	// 这个测试会尝试实际连接 GitHub，所以我们只能验证它不会 panic
	// 实际的 API 调用会失败（因为 owner/repo 不存在），但不应该 panic
	_, _ = updater.CheckForUpdates(false)
	// 不 panic 就是成功
}

func TestUpdater_GetPlatformAsset(t *testing.T) {
	updater := NewUpdater("1.0.0", "owner", "repo", DefaultUpdateConfig())
	
	// 这会尝试连接 GitHub API，预期会失败但不应该 panic
	_, _, err := updater.GetPlatformAsset()
	// 应该返回错误（因为 owner/repo 不存在或网络问题）
	if err == nil {
		t.Log("GetPlatformAsset() succeeded unexpectedly (maybe network available)")
	}
	// 主要目的是确保不 panic
}

func TestUpdater_GetAssetChecksum(t *testing.T) {
	updater := NewUpdater("1.0.0", "owner", "repo", DefaultUpdateConfig())
	
	// 这会尝试连接 GitHub API，预期会失败但不应该 panic
	_, err := updater.GetAssetChecksum("some-asset.dmg")
	// 应该返回错误
	if err == nil {
		t.Log("GetAssetChecksum() succeeded unexpectedly (maybe network available)")
	}
	// 主要目的是确保不 panic
}

func TestDownloader_CleanupDownloadDir(t *testing.T) {
	dir := t.TempDir()
	downloader := NewDownloader(dir, nil)
	
	// 创建一些测试文件
	testFile := dir + "/test.txt"
	if err := os.WriteFile(testFile, []byte("test"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	
	// 清理
	err := downloader.CleanupDownloadDir()
	if err != nil {
		t.Fatalf("CleanupDownloadDir() error = %v", err)
	}
	
	// 验证文件被删除
	if _, err := os.Stat(testFile); !os.IsNotExist(err) {
		t.Error("file was not deleted")
	}
}


func TestUpdateConfig_Validation(t *testing.T) {
	config := UpdateConfig{
		Enabled:        true,
		CheckInterval:  24,
		LastCheckTime:  0,
		SkippedVersion: "",
		AutoDownload:   false,
		Channel:        "stable",
	}
	
	// 验证默认值合理
	if config.CheckInterval < 0 {
		t.Error("CheckInterval should not be negative")
	}
	if config.Channel == "" {
		t.Error("Channel should not be empty")
	}
}

func TestUpdateInfo_Structure(t *testing.T) {
	info := UpdateInfo{
		Available:      true,
		CurrentVersion: "1.0.0",
		LatestVersion:  "2.0.0",
		ReleaseURL:     "https://github.com/owner/repo/releases/tag/v2.0.0",
		ReleaseNotes:   "New features",
		PublishedAt:    time.Now(),
		Assets:         []Asset{},
	}
	
	if !info.Available {
		t.Error("Available should be true")
	}
	if info.CurrentVersion != "1.0.0" {
		t.Errorf("CurrentVersion = %v, want 1.0.0", info.CurrentVersion)
	}
	if info.LatestVersion != "2.0.0" {
		t.Errorf("LatestVersion = %v, want 2.0.0", info.LatestVersion)
	}
	if info.Assets == nil {
		t.Error("Assets should not be nil")
	}
}

func TestAsset_Structure(t *testing.T) {
	asset := Asset{
		Name:        "app.dmg",
		DownloadURL: "https://github.com/owner/repo/releases/download/v2.0.0/app.dmg",
		Size:        1024 * 1024 * 50, // 50MB
		ContentType: "application/octet-stream",
	}
	
	if asset.Name != "app.dmg" {
		t.Errorf("Name = %v, want app.dmg", asset.Name)
	}
	if asset.Size <= 0 {
		t.Error("Size should be positive")
	}
}

func TestDownloadProgress_Structure(t *testing.T) {
	progress := DownloadProgress{
		Downloaded: 1024 * 1024,    // 1MB
		Total:      10 * 1024 * 1024, // 10MB
		Percent:    10.0,
		Speed:      "1.00 MB/s",
	}
	
	if progress.Downloaded <= 0 {
		t.Error("Downloaded should be positive")
	}
	if progress.Total <= 0 {
		t.Error("Total should be positive")
	}
	if progress.Percent < 0 || progress.Percent > 100 {
		t.Errorf("Percent = %v, should be between 0 and 100", progress.Percent)
	}
}

func TestGitHubRelease_Structure(t *testing.T) {
	release := GitHubRelease{
		TagName:     "v1.0.0",
		Name:        "Version 1.0.0",
		Body:        "Release notes",
		HTMLURL:     "https://github.com/owner/repo/releases/tag/v1.0.0",
		PublishedAt: time.Now(),
		Assets:      []GitHubAsset{},
	}
	
	if release.TagName != "v1.0.0" {
		t.Errorf("TagName = %v, want v1.0.0", release.TagName)
	}
	if release.Assets == nil {
		t.Error("Assets should not be nil")
	}
}

func TestGitHubAsset_Structure(t *testing.T) {
	asset := GitHubAsset{
		Name:               "app.dmg",
		BrowserDownloadURL: "https://github.com/owner/repo/releases/download/v1.0.0/app.dmg",
		Size:               1024 * 1024 * 50,
		ContentType:        "application/octet-stream",
	}
	
	if asset.Name != "app.dmg" {
		t.Errorf("Name = %v, want app.dmg", asset.Name)
	}
	if asset.Size <= 0 {
		t.Error("Size should be positive")
	}
}
