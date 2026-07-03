package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ErrChecksumMissing 表示未提供有效的 SHA256 校验和，下载被拒绝以避免落盘未校验的二进制 / indicates no valid SHA256 checksum was provided; the download is refused rather than writing an unverified binary to disk.
var ErrChecksumMissing = errors.New("expected sha256 checksum is missing or invalid")

// Downloader 下载管理器
type Downloader struct {
	httpClient     *http.Client
	downloadDir    string
	progressFunc   func(progress DownloadProgress)
}

// NewDownloader 创建下载管理器
func NewDownloader(downloadDir string, progressFunc func(progress DownloadProgress)) *Downloader {
	return &Downloader{
		httpClient: &http.Client{
			Timeout: 30 * time.Minute, // 下载超时 30 分钟
		},
		downloadDir:  downloadDir,
		progressFunc: progressFunc,
	}
}

// Download 下载文件并验证 SHA256
func (d *Downloader) Download(url, expectedChecksum string) (string, error) {
	// 校验和必须是非空且 64 位十六进制，否则拒绝下载——避免 .sha256 文件缺失/获取失败时静默落盘未校验的二进制 / require a non-empty 64-hex checksum up front so a missing or malformed .sha256 file fails the download instead of silently skipping verification.
	if !sha256Pattern.MatchString(expectedChecksum) {
		return "", fmt.Errorf("%w: %q", ErrChecksumMissing, expectedChecksum)
	}

	// 确保下载目录存在
	if err := os.MkdirAll(d.downloadDir, 0755); err != nil {
		return "", fmt.Errorf("创建下载目录失败: %w", err)
	}

	// 从 URL 中提取文件名
	fileName := filepath.Base(url)
	filePath := filepath.Join(d.downloadDir, fileName)

	// 创建请求
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("创建下载请求失败: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)

	// 执行请求
	resp, err := d.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("下载请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载失败，状态码: %d", resp.StatusCode)
	}

	// 创建目标文件
	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("创建文件失败: %w", err)
	}
	defer file.Close()

	// 准备计算哈希
	hash := sha256.New()
	writer := io.MultiWriter(file, hash)

	// 获取文件总大小
	totalSize := resp.ContentLength
	var downloaded int64
	startTime := time.Now()

	// 包装 reader 以追踪进度
	reader := &progressReader{
		reader: resp.Body,
		onProgress: func(n int) {
			downloaded += int64(n)
			if d.progressFunc != nil && totalSize > 0 {
				percent := float64(downloaded) / float64(totalSize) * 100
				speed := calculateSpeed(downloaded, startTime)
				d.progressFunc(DownloadProgress{
					Downloaded: downloaded,
					Total:      totalSize,
					Percent:    percent,
					Speed:      speed,
				})
			}
		},
	}

	// 下载并计算哈希
	if _, err := io.Copy(writer, reader); err != nil {
		os.Remove(filePath) // 下载失败时清理
		return "", fmt.Errorf("下载文件失败: %w", err)
	}

	// 验证 SHA256
	actualChecksum := hex.EncodeToString(hash.Sum(nil))
	if actualChecksum != expectedChecksum {
		os.Remove(filePath) // 校验失败时清理
		return "", fmt.Errorf("文件校验失败: 期望 %s，实际 %s", expectedChecksum, actualChecksum)
	}

	return filePath, nil
}

// progressReader 包装 io.Reader 以追踪读取进度
type progressReader struct {
	reader     io.Reader
	onProgress func(int)
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.reader.Read(p)
	if n > 0 && pr.onProgress != nil {
		pr.onProgress(n)
	}
	return n, err
}

// calculateSpeed 计算下载速度
func calculateSpeed(downloaded int64, startTime time.Time) string {
	elapsed := time.Since(startTime).Seconds()
	if elapsed <= 0 {
		return "计算中..."
	}

	bytesPerSecond := float64(downloaded) / elapsed

	// 转换为人类可读格式
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)

	switch {
	case bytesPerSecond >= GB:
		return fmt.Sprintf("%.2f GB/s", bytesPerSecond/GB)
	case bytesPerSecond >= MB:
		return fmt.Sprintf("%.2f MB/s", bytesPerSecond/MB)
	case bytesPerSecond >= KB:
		return fmt.Sprintf("%.2f KB/s", bytesPerSecond/KB)
	default:
		return fmt.Sprintf("%.0f B/s", bytesPerSecond)
	}
}

// CleanupDownloadDir 清理下载目录
func (d *Downloader) CleanupDownloadDir() error {
	return os.RemoveAll(d.downloadDir)
}
