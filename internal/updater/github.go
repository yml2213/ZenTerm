package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// sha256Pattern 校验和必须是 64 位十六进制字符，拒绝任何畸形/截断的 .sha256 内容 / a checksum must be exactly 64 hex chars, rejecting malformed or truncated .sha256 payloads.
var sha256Pattern = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

const (
	githubAPITimeout = 10 * time.Second
	userAgent        = "ZenTerm-Updater"
)

// GitHubRelease GitHub API 返回的 Release 结构
type GitHubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
	Assets      []GitHubAsset `json:"assets"`
}

// GitHubAsset GitHub Release 资源文件
type GitHubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
	ContentType        string `json:"content_type"`
}

// GitHubClient GitHub API 客户端
type GitHubClient struct {
	owner      string
	repo       string
	httpClient *http.Client
}

// NewGitHubClient 创建 GitHub 客户端
func NewGitHubClient(owner, repo string) *GitHubClient {
	return &GitHubClient{
		owner: owner,
		repo:  repo,
		httpClient: &http.Client{
			Timeout: githubAPITimeout,
		},
	}
}

// GetLatestRelease 获取最新的 Release
func (c *GitHubClient) GetLatestRelease() (*GitHubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", c.owner, c.repo)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 GitHub API 失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API 返回错误状态 %d: %s", resp.StatusCode, string(body))
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &release, nil
}

// GetPlatformAsset 根据当前平台筛选合适的资源文件
func (c *GitHubClient) GetPlatformAsset(release *GitHubRelease) (*GitHubAsset, error) {
	platform := runtime.GOOS
	arch := runtime.GOARCH

	// 构建期望的文件名模式
	var patterns []string
	switch platform {
	case "darwin":
		// macOS 优先匹配当前架构，然后才是 universal
		switch arch {
		case "amd64":
			patterns = []string{
				"macos-amd64.zip",        // Intel 优先
				"macos-universal.zip",    // Universal 兜底
			}
		case "arm64":
			patterns = []string{
				"macos-arm64.zip",        // Apple Silicon 优先
				"macos-universal.zip",    // Universal 兜底
			}
		default:
			// 未知架构，直接用 universal
			patterns = []string{
				"macos-universal.zip",
			}
		}
	case "windows":
		patterns = []string{
			fmt.Sprintf("windows-%s.zip", arch),
		}
	case "linux":
		patterns = []string{
			fmt.Sprintf("linux-%s.tar.gz", arch),
		}
	default:
		return nil, fmt.Errorf("不支持的平台: %s", platform)
	}

	// 按优先级匹配资源文件
	for _, pattern := range patterns {
		for i := range release.Assets {
			asset := &release.Assets[i]
			if strings.Contains(strings.ToLower(asset.Name), pattern) {
				// 排除 SHA256 校验文件
				if strings.HasSuffix(asset.Name, ".sha256") {
					continue
				}
				return asset, nil
			}
		}
	}

	return nil, fmt.Errorf("未找到适用于 %s/%s 的更新包", platform, arch)
}

// GetAssetChecksum 获取资源文件的 SHA256 校验和
func (c *GitHubClient) GetAssetChecksum(release *GitHubRelease, assetName string) (string, error) {
	checksumFileName := assetName + ".sha256"

	var checksumAsset *GitHubAsset
	for i := range release.Assets {
		if release.Assets[i].Name == checksumFileName {
			checksumAsset = &release.Assets[i]
			break
		}
	}

	if checksumAsset == nil {
		return "", fmt.Errorf("未找到校验文件: %s", checksumFileName)
	}

	req, err := http.NewRequest("GET", checksumAsset.BrowserDownloadURL, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("User-Agent", userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("下载校验文件失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载校验文件返回错误状态: %d", resp.StatusCode)
	}

	checksumData, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取校验文件失败: %w", err)
	}

	// 校验文件格式: "<hash>  <filename>"。必须严格匹配 64 位 hex，拒绝空/截断/畸形内容，避免下游静默跳过校验 / format is "<hash>  <filename>"; require a strict 64-hex match so a missing or malformed checksum file fails loudly instead of silently disabling verification downstream.
	parts := strings.Fields(string(checksumData))
	if len(parts) < 1 {
		return "", fmt.Errorf("校验文件格式错误")
	}

	checksum := strings.ToLower(parts[0])
	if !sha256Pattern.MatchString(checksum) {
		return "", fmt.Errorf("校验和格式无效，期望 64 位十六进制，实际: %q", parts[0])
	}

	return checksum, nil
}
