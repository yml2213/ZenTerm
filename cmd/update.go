package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/updater"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var appVersion = "dev" // 正式版本由 -ldflags 注入

// UpdateInfo 前端使用的更新信息
type UpdateInfo struct {
	Available      bool      `json:"available"`
	CurrentVersion string    `json:"currentVersion"`
	LatestVersion  string    `json:"latestVersion"`
	ReleaseURL     string    `json:"releaseUrl"`
	ReleaseNotes   string    `json:"releaseNotes"`
	PublishedAt    time.Time `json:"publishedAt"`
	DownloadURL    string    `json:"downloadUrl"`
	DownloadSize   int64     `json:"downloadSize"`
}

// UpdateProgress 更新进度
type UpdateProgress struct {
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Percent    float64 `json:"percent"`
	Speed      string  `json:"speed"`
}

// GetAppVersion 返回当前应用版本
func (a *App) GetAppVersion() string {
	return appVersion
}

// CheckForUpdates 手动检查更新
func (a *App) CheckForUpdates() (*UpdateInfo, error) {
	return a.checkForUpdates(true)
}

func (a *App) checkForUpdates(force bool) (*UpdateInfo, error) {
	config, err := a.service.GetUpdateConfig()
	if err != nil {
		return nil, fmt.Errorf("获取更新配置失败: %w", err)
	}

	// 创建更新器
	u := updater.NewUpdater(appVersion, "yml2213", "ZenTerm", updater.UpdateConfig{
		Enabled:        config.Enabled,
		CheckInterval:  config.CheckInterval,
		LastCheckTime:  config.LastCheckTime,
		SkippedVersion: config.SkippedVersion,
		AutoDownload:   config.AutoDownload,
		Channel:        config.Channel,
	})

	now := time.Now()
	shouldPersistLastCheck := force || shouldRunScheduledUpdateCheck(config, now)
	info, err := u.CheckForUpdates(force)
	if err != nil {
		return nil, fmt.Errorf("检查更新失败: %w", err)
	}

	// 更新最后检查时间
	if shouldPersistLastCheck {
		config.LastCheckTime = now.Unix()
		if err := a.service.SaveUpdateConfig(config); err != nil {
			// 记录错误但不中断
			fmt.Printf("保存更新配置失败: %v\n", err)
		}
	}

	// 如果没有可用更新，直接返回
	if !info.Available {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: info.CurrentVersion,
		}, nil
	}

	// 获取适合当前平台的资源文件
	asset, _, err := u.GetPlatformAsset()
	if err != nil {
		return nil, fmt.Errorf("获取更新包信息失败: %w", err)
	}

	return &UpdateInfo{
		Available:      true,
		CurrentVersion: info.CurrentVersion,
		LatestVersion:  info.LatestVersion,
		ReleaseURL:     info.ReleaseURL,
		ReleaseNotes:   info.ReleaseNotes,
		PublishedAt:    info.PublishedAt,
		DownloadURL:    asset.BrowserDownloadURL,
		DownloadSize:   asset.Size,
	}, nil
}

// DownloadUpdate 下载更新
func (a *App) DownloadUpdate(downloadURL string) error {
	config, err := a.service.GetUpdateConfig()
	if err != nil {
		return fmt.Errorf("获取更新配置失败: %w", err)
	}

	// 创建更新器获取校验和
	u := updater.NewUpdater(appVersion, "yml2213", "ZenTerm", updater.UpdateConfig{
		Enabled:        config.Enabled,
		CheckInterval:  config.CheckInterval,
		LastCheckTime:  config.LastCheckTime,
		SkippedVersion: config.SkippedVersion,
		AutoDownload:   config.AutoDownload,
		Channel:        config.Channel,
	})

	// 获取资源文件名
	asset, _, err := u.GetPlatformAsset()
	if err != nil {
		return fmt.Errorf("获取更新包信息失败: %w", err)
	}

	// 获取校验和
	checksum, err := u.GetAssetChecksum(asset.Name)
	if err != nil {
		return fmt.Errorf("获取校验和失败: %w", err)
	}

	// 确定下载目录
	downloadDir, err := getUpdateDownloadDir()
	if err != nil {
		return fmt.Errorf("创建下载目录失败: %w", err)
	}

	// 创建下载器
	downloader := updater.NewDownloader(downloadDir, func(progress updater.DownloadProgress) {
		// 向前端发送进度事件
		wailsRuntime.EventsEmit(a.ctx, "update:progress", UpdateProgress{
			Downloaded: progress.Downloaded,
			Total:      progress.Total,
			Percent:    progress.Percent,
			Speed:      progress.Speed,
		})
	})

	// 在后台下载
	go func() {
		filePath, err := downloader.Download(downloadURL, checksum)
		if err != nil {
			wailsRuntime.EventsEmit(a.ctx, "update:error", map[string]string{
				"message": fmt.Sprintf("下载失败: %v", err),
			})
			return
		}

		cleanOldUpdateFiles(downloadDir, filePath)

		wailsRuntime.EventsEmit(a.ctx, "update:complete", map[string]string{
			"filePath": filePath,
		})
	}()

	return nil
}

// GetUpdateConfig 获取更新配置
func (a *App) GetUpdateConfig() (*model.UpdateConfig, error) {
	config, err := a.service.GetUpdateConfig()
	if err != nil {
		return nil, fmt.Errorf("获取更新配置失败: %w", err)
	}
	return &config, nil
}

// SaveUpdateConfig 保存更新配置
func (a *App) SaveUpdateConfig(config model.UpdateConfig) error {
	if err := a.service.SaveUpdateConfig(config); err != nil {
		return fmt.Errorf("保存更新配置失败: %w", err)
	}
	return nil
}

// SkipVersion 跳过某个版本
func (a *App) SkipVersion(version string) error {
	config, err := a.service.GetUpdateConfig()
	if err != nil {
		return fmt.Errorf("获取更新配置失败: %w", err)
	}

	config.SkippedVersion = version

	if err := a.service.SaveUpdateConfig(config); err != nil {
		return fmt.Errorf("保存更新配置失败: %w", err)
	}

	return nil
}

// OpenUpdateFile 在系统文件管理器中显示下载的更新文件
func (a *App) OpenUpdateFile(filePath string) error {
	if strings.TrimSpace(filePath) == "" {
		return fmt.Errorf("更新文件路径为空")
	}

	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("解析更新文件路径失败: %w", err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return fmt.Errorf("更新文件不存在: %w", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "update:opening", map[string]string{
		"path": absPath,
	})

	if info.IsDir() {
		return openPathInFileManager(absPath)
	}

	return revealPathInFileManager(absPath)
}

func revealPathInFileManager(path string) error {
	var cmd *exec.Cmd
	switch goruntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	case "windows":
		cmd = exec.Command("explorer", "/select,"+path)
	default:
		cmd = exec.Command("xdg-open", filepath.Dir(path))
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("显示更新文件失败: %w", err)
	}
	return nil
}

func openPathInFileManager(path string) error {
	var cmd *exec.Cmd
	switch goruntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("打开更新目录失败: %w", err)
	}
	return nil
}

// InstallUpdateAndRestart 解压、抹除隔离标记并在应用退出后替换应用并重启
func (a *App) InstallUpdateAndRestart(filePath string) error {
	if strings.TrimSpace(filePath) == "" {
		return fmt.Errorf("更新文件路径为空")
	}

	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("解析更新文件路径失败: %w", err)
	}

	if _, err := os.Stat(absPath); err != nil {
		return fmt.Errorf("更新文件不存在: %w", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "update:installing", map[string]string{
		"path": absPath,
	})

	if err := updater.ApplyUpdateAndRestart(absPath); err != nil {
		return err
	}

	// 异步延迟退出，给前端足够时间展示状态并允许正常保存数据
	go func() {
		time.Sleep(600 * time.Millisecond)
		if a.ctx != nil {
			wailsRuntime.Quit(a.ctx)
		} else {
			os.Exit(0)
		}
	}()

	return nil
}

func cleanOldUpdateFiles(downloadDir string, keepFile string) {
	entries, err := os.ReadDir(downloadDir)
	if err != nil {
		return
	}
	keepName := filepath.Base(keepFile)
	for _, entry := range entries {
		name := entry.Name()
		if name == keepName || name == keepName+".sha256" {
			continue
		}
		if strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".tar.gz") || strings.HasSuffix(name, ".sha256") || strings.HasPrefix(name, "staged_") {
			_ = os.RemoveAll(filepath.Join(downloadDir, name))
		}
	}
}

// getUpdateDownloadDir 获取更新下载目录
func getUpdateDownloadDir() (string, error) {
	// 在应用数据目录下创建 updates 子目录
	storePath, err := DefaultStorePath()
	if err != nil {
		return "", err
	}

	dir := filepath.Join(filepath.Dir(storePath), "updates")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	return dir, nil
}

// fileExists 检查文件是否存在
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func shouldRunScheduledUpdateCheck(config model.UpdateConfig, now time.Time) bool {
	if !config.Enabled {
		return false
	}
	if config.CheckInterval == 0 || config.LastCheckTime == 0 {
		return true
	}

	lastCheck := time.Unix(config.LastCheckTime, 0)
	nextCheck := lastCheck.Add(time.Duration(config.CheckInterval) * time.Hour)
	return now.After(nextCheck)
}

// startupCheckUpdate 应用启动时的初始化（在启动后检查更新）
func (a *App) startupCheckUpdate() {
	// 延迟 5 秒后检查更新，避免影响启动速度
	go func() {
		time.Sleep(5 * time.Second)

		config, err := a.service.GetUpdateConfig()
		if err != nil || !config.Enabled {
			return
		}

		// 静默检查更新
		info, err := a.checkForUpdates(false)
		if err != nil {
			// 静默失败
			return
		}

		if info.Available {
			// 通知前端有新版本可用
			wailsRuntime.EventsEmit(a.ctx, "update:available", info)
			if config.AutoDownload && info.DownloadURL != "" {
				_ = a.DownloadUpdate(info.DownloadURL)
			}
		}
	}()
}
