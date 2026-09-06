package updater

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Updater 更新管理器
type Updater struct {
	currentVersion string
	githubClient   *GitHubClient
	config         UpdateConfig
}

// NewUpdater 创建更新管理器
func NewUpdater(currentVersion, owner, repo string, config UpdateConfig) *Updater {
	return &Updater{
		currentVersion: currentVersion,
		githubClient:   NewGitHubClient(owner, repo),
		config:         config,
	}
}

// CheckForUpdates 检查更新。force 为 true 时用于手动检查，会忽略自动检查开关和间隔限制。
func (u *Updater) CheckForUpdates(force bool) (*UpdateInfo, error) {
	// 如果禁用了自动更新检查，计划任务直接返回；手动检查仍然允许执行。
	if !force && !u.config.Enabled {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: u.currentVersion,
		}, nil
	}

	// 检查是否需要检查更新（基于间隔时间）
	if !force && !u.shouldCheck() {
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: u.currentVersion,
		}, nil
	}

	// 从 GitHub 获取最新版本
	release, err := u.githubClient.GetLatestRelease()
	if err != nil {
		if force {
			return nil, err
		}
		// 启动时静默处理网络错误，避免打扰用户。
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: u.currentVersion,
		}, nil
	}

	// 解析版本号
	latestVersion := strings.TrimPrefix(release.TagName, "v")

	// 比较版本
	isNewer, err := isVersionNewer(latestVersion, u.currentVersion)
	if err != nil {
		return nil, fmt.Errorf("版本比较失败: %w", err)
	}

	// 检查用户是否跳过了这个版本
	if !force && u.config.SkippedVersion == latestVersion {
		isNewer = false
	}

	// 构建返回信息
	info := &UpdateInfo{
		Available:      isNewer,
		CurrentVersion: u.currentVersion,
		LatestVersion:  latestVersion,
		ReleaseURL:     release.HTMLURL,
		ReleaseNotes:   release.Body,
		PublishedAt:    release.PublishedAt,
		Assets:         make([]Asset, 0),
	}

	// 转换资源文件信息
	for _, asset := range release.Assets {
		info.Assets = append(info.Assets, Asset{
			Name:        asset.Name,
			DownloadURL: asset.BrowserDownloadURL,
			Size:        asset.Size,
			ContentType: asset.ContentType,
		})
	}

	return info, nil
}

// GetPlatformAsset 获取适合当前平台的安装包
func (u *Updater) GetPlatformAsset() (*GitHubAsset, *GitHubRelease, error) {
	release, err := u.githubClient.GetLatestRelease()
	if err != nil {
		return nil, nil, fmt.Errorf("获取最新版本失败: %w", err)
	}

	asset, err := u.githubClient.GetPlatformAsset(release)
	if err != nil {
		return nil, nil, err
	}

	return asset, release, nil
}

// GetAssetChecksum 获取资源文件的校验和
func (u *Updater) GetAssetChecksum(assetName string) (string, error) {
	release, err := u.githubClient.GetLatestRelease()
	if err != nil {
		return "", fmt.Errorf("获取最新版本失败: %w", err)
	}

	return u.githubClient.GetAssetChecksum(release, assetName)
}

// shouldCheck 判断是否应该检查更新
func (u *Updater) shouldCheck() bool {
	if u.config.CheckInterval == 0 {
		// 0 表示每次启动都检查
		return true
	}

	if u.config.LastCheckTime == 0 {
		// 从未检查过
		return true
	}

	lastCheck := time.Unix(u.config.LastCheckTime, 0)
	nextCheck := lastCheck.Add(time.Duration(u.config.CheckInterval) * time.Hour)

	return time.Now().After(nextCheck)
}

// isVersionNewer 比较版本号 (语义化版本 x.y.z)
func isVersionNewer(latestVersion, currentVersion string) (bool, error) {
	latest, err := parseVersion(latestVersion)
	if err != nil {
		return false, fmt.Errorf("解析最新版本失败: %w", err)
	}

	current, err := parseVersion(currentVersion)
	if err != nil {
		return false, fmt.Errorf("解析当前版本失败: %w", err)
	}

	// 比较 major
	if latest[0] > current[0] {
		return true, nil
	}
	if latest[0] < current[0] {
		return false, nil
	}

	// major 相同，比较 minor
	if latest[1] > current[1] {
		return true, nil
	}
	if latest[1] < current[1] {
		return false, nil
	}

	// minor 相同，比较 patch
	return latest[2] > current[2], nil
}

// parseVersion 解析版本号为 [major, minor, patch]
func parseVersion(version string) ([3]int, error) {
	version = strings.TrimPrefix(version, "v")
	if version == "dev" || version == "" {
		return [3]int{0, 0, 0}, nil
	}
	parts := strings.Split(version, ".")

	if len(parts) != 3 {
		return [3]int{}, fmt.Errorf("无效的版本格式: %s", version)
	}

	var result [3]int
	for i := 0; i < 3; i++ {
		num, err := strconv.Atoi(parts[i])
		if err != nil {
			return [3]int{}, fmt.Errorf("无效的版本号: %s", parts[i])
		}
		result[i] = num
	}

	return result, nil
}
