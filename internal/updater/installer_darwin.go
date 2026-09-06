//go:build darwin

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// DetectCurrentAppBundle 检测当前正在运行的 .app bundle 路径
func DetectCurrentAppBundle() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("获取当前执行文件路径失败: %w", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return "", fmt.Errorf("解析软链接失败: %w", err)
	}

	dir := filepath.Dir(exe)
	for {
		if strings.HasSuffix(dir, ".app") {
			if _, err := os.Stat(filepath.Join(dir, "Contents", "Info.plist")); err == nil {
				return dir, nil
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir || parent == "" || parent == "/" {
			break
		}
		dir = parent
	}

	// 如果没有在 .app 内运行（例如在终端开发调试），检查系统 Applications 目录
	defaultApp := "/Applications/ZenTerm.app"
	if _, err := os.Stat(defaultApp); err == nil {
		return defaultApp, nil
	}

	return defaultApp, nil
}

// ExtractAndStageMacOSUpdate 解压并预备 macOS 更新包，自动清除 Gatekeeper 隔离属性
func ExtractAndStageMacOSUpdate(zipPath string) (stagedAppPath string, stagingDir string, err error) {
	if _, err := os.Stat(zipPath); err != nil {
		return "", "", fmt.Errorf("更新压缩包不存在: %w", err)
	}

	baseDir := filepath.Dir(zipPath)
	timestamp := time.Now().Format("20060102150405")
	stagingDir = filepath.Join(baseDir, fmt.Sprintf("staged_%s", timestamp))
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return "", "", fmt.Errorf("创建预安装目录失败: %w", err)
	}

	// 使用 macOS 原生 ditto 解压以保证 bundle 软链接和资源完整性
	dittoCmd := exec.Command("/usr/bin/ditto", "-x", "-k", zipPath, stagingDir)
	if output, err := dittoCmd.CombinedOutput(); err != nil {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("解压更新包失败: %w, 输出: %s", err, string(output))
	}

	// 查找解压出的 .app 目录
	entries, err := os.ReadDir(stagingDir)
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("读取解压内容失败: %w", err)
	}

	var foundApp string
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".app") {
			foundApp = filepath.Join(stagingDir, entry.Name())
			break
		}
	}

	if foundApp == "" {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("更新包内未找到 .app 应用 bundle")
	}

	// 核心修复：抹除 com.apple.quarantine 等隔离属性，避免 Gatekeeper 报错“已损坏”
	xattrCmd := exec.Command("/usr/bin/xattr", "-cr", foundApp)
	if output, err := xattrCmd.CombinedOutput(); err != nil {
		// 记录但尽量不阻塞
		fmt.Printf("清理隔离属性警告: %v, 输出: %s\n", err, string(output))
	}

	return foundApp, stagingDir, nil
}

// ApplyUpdateAndRestart 执行解压、抹除隔离标记、并在应用退出后无缝替换目标 .app 并重启
func ApplyUpdateAndRestart(zipPath string) error {
	stagedApp, stagingDir, err := ExtractAndStageMacOSUpdate(zipPath)
	if err != nil {
		return err
	}

	targetApp, err := DetectCurrentAppBundle()
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("定位目标应用路径失败: %w", err)
	}

	pid := os.Getpid()
	scriptPath := filepath.Join(stagingDir, "restart_update.sh")

	scriptContent := fmt.Sprintf(`#!/usr/bin/env bash
set -e

OLD_PID="%d"
STAGED_APP="%s"
TARGET_APP="%s"
STAGING_DIR="%s"

# 等待旧进程退出
for i in {1..150}; do
  if ! kill -0 "$OLD_PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

# 如果旧进程仍未退出，强行结束
if kill -0 "$OLD_PID" 2>/dev/null; then
  kill -9 "$OLD_PID" 2>/dev/null || true
  sleep 0.5
fi

# 确保目标目录的上级目录存在
mkdir -p "$(dirname "$TARGET_APP")"

# 尝试直接替换目标应用
replace_app() {
  rm -rf "$TARGET_APP"
  cp -R "$STAGED_APP" "$TARGET_APP"
  /usr/bin/xattr -cr "$TARGET_APP" 2>/dev/null || true
}

if ! replace_app 2>/dev/null; then
  # 权限不足时通过 osascript 请求管理员授权提权替换
  osascript -e "do shell script \"rm -rf \\\"$TARGET_APP\\\" && cp -R \\\"$STAGED_APP\\\" \\\"$TARGET_APP\\\" && /usr/bin/xattr -cr \\\"$TARGET_APP\\\"\" with administrator privileges"
fi

# 启动新版本应用
open -n "$TARGET_APP"

# 清理临时解压目录
rm -rf "$STAGING_DIR" 2>/dev/null || true
`, pid, stagedApp, targetApp, stagingDir)

	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0755); err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("创建安装替换脚本失败: %w", err)
	}

	cmd := exec.Command("/bin/bash", scriptPath)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("启动更新接管脚本失败: %w", err)
	}

	_ = cmd.Process.Release()
	return nil
}
