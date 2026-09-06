//go:build linux

package updater

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ExtractAndStageLinuxUpdate 解压 Linux tar.gz 更新包
func ExtractAndStageLinuxUpdate(archivePath string) (stagedBinPath string, stagingDir string, err error) {
	if _, err := os.Stat(archivePath); err != nil {
		return "", "", fmt.Errorf("更新压缩包不存在: %w", err)
	}

	baseDir := filepath.Dir(archivePath)
	timestamp := time.Now().Format("20060102150405")
	stagingDir = filepath.Join(baseDir, fmt.Sprintf("staged_%s", timestamp))
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return "", "", fmt.Errorf("创建预安装目录失败: %w", err)
	}

	f, err := os.Open(archivePath)
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("打开更新包失败: %w", err)
	}
	defer f.Close()

	var foundBin string

	if strings.HasSuffix(archivePath, ".tar.gz") || strings.HasSuffix(archivePath, ".tgz") {
		gzr, err := gzip.NewReader(f)
		if err != nil {
			_ = os.RemoveAll(stagingDir)
			return "", "", fmt.Errorf("解析 gzip 失败: %w", err)
		}
		defer gzr.Close()

		tr := tar.NewReader(gzr)
		for {
			header, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				_ = os.RemoveAll(stagingDir)
				return "", "", fmt.Errorf("解压 tar 条目失败: %w", err)
			}

			targetPath := filepath.Join(stagingDir, header.Name)
			if !strings.HasPrefix(filepath.Clean(targetPath), filepath.Clean(stagingDir)+string(filepath.Separator)) {
				continue
			}

			switch header.Typeflag {
			case tar.TypeDir:
				_ = os.MkdirAll(targetPath, 0755)
			case tar.TypeReg:
				_ = os.MkdirAll(filepath.Dir(targetPath), 0755)
				outFile, err := os.OpenFile(targetPath, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
				if err != nil {
					_ = os.RemoveAll(stagingDir)
					return "", "", err
				}
				_, err = io.Copy(outFile, tr)
				outFile.Close()
				if err != nil {
					_ = os.RemoveAll(stagingDir)
					return "", "", err
				}
				if filepath.Base(targetPath) == "ZenTerm" {
					foundBin = targetPath
				}
			}
		}
	} else {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("不支持的 Linux 归档格式: %s", archivePath)
	}

	if foundBin == "" {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("更新包中未找到 ZenTerm 可执行文件")
	}

	_ = os.Chmod(foundBin, 0755)
	return foundBin, stagingDir, nil
}

// ApplyUpdateAndRestart 执行 Linux 更新与平滑重启
func ApplyUpdateAndRestart(archivePath string) error {
	stagedBin, stagingDir, err := ExtractAndStageLinuxUpdate(archivePath)
	if err != nil {
		return err
	}

	targetBin, err := os.Executable()
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("获取当前程序路径失败: %w", err)
	}
	targetBin, err = filepath.EvalSymlinks(targetBin)
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("解析当前程序路径失败: %w", err)
	}

	pid := os.Getpid()
	scriptPath := filepath.Join(stagingDir, "restart_update.sh")

	scriptContent := fmt.Sprintf(`#!/bin/sh
set -e
OLD_PID="%d"
STAGED_BIN="%s"
TARGET_BIN="%s"
STAGING_DIR="%s"

# 等待原进程退出
for i in $(seq 1 150); do
  if ! kill -0 "$OLD_PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if kill -0 "$OLD_PID" 2>/dev/null; then
  kill -9 "$OLD_PID" 2>/dev/null || true
  sleep 0.5
fi

# 替换可执行文件
rm -f "$TARGET_BIN"
cp -f "$STAGED_BIN" "$TARGET_BIN"
chmod +x "$TARGET_BIN"

# 启动新版本
"$TARGET_BIN" &

# 清理临时解压目录
rm -rf "$STAGING_DIR" 2>/dev/null || true
`, pid, stagedBin, targetBin, stagingDir)

	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0755); err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("创建 Linux 更新脚本失败: %w", err)
	}

	cmd := exec.Command("/bin/sh", scriptPath)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("启动 Linux 更新脚本失败: %w", err)
	}

	_ = cmd.Process.Release()
	return nil
}
