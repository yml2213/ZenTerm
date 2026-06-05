package updater

import "time"

// UpdateInfo 表示可用的更新信息
type UpdateInfo struct {
	Available      bool      `json:"available"`
	CurrentVersion string    `json:"currentVersion"`
	LatestVersion  string    `json:"latestVersion"`
	ReleaseURL     string    `json:"releaseUrl"`
	ReleaseNotes   string    `json:"releaseNotes"`
	PublishedAt    time.Time `json:"publishedAt"`
	Assets         []Asset   `json:"assets"`
}

// Asset 表示发布的资源文件
type Asset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}

// DownloadProgress 下载进度信息
type DownloadProgress struct {
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Percent    float64 `json:"percent"`
	Speed      string  `json:"speed"` // 如 "2.5 MB/s"
}

// UpdateConfig 更新配置
type UpdateConfig struct {
	Enabled         bool   `json:"enabled"`          // 是否启用自动检查
	CheckInterval   int    `json:"checkInterval"`    // 检查间隔（小时），0 表示每次启动检查
	LastCheckTime   int64  `json:"lastCheckTime"`    // 上次检查时间戳
	SkippedVersion  string `json:"skippedVersion"`   // 用户跳过的版本
	AutoDownload    bool   `json:"autoDownload"`     // 是否自动下载更新
	Channel         string `json:"channel"`          // 更新渠道 (stable/beta)
}

// DefaultUpdateConfig 返回默认配置
func DefaultUpdateConfig() UpdateConfig {
	return UpdateConfig{
		Enabled:       true,
		CheckInterval: 24, // 默认每天检查一次
		Channel:       "stable",
		AutoDownload:  false,
	}
}
