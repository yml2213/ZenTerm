//go:build windows

package updater

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// ExtractAndStageWindowsUpdate 解压 Windows zip 更新包
func ExtractAndStageWindowsUpdate(zipPath string) (stagedExePath string, stagingDir string, err error) {
	if _, err := os.Stat(zipPath); err != nil {
		return "", "", fmt.Errorf("更新压缩包不存在: %w", err)
	}

	baseDir := filepath.Dir(zipPath)
	timestamp := time.Now().Format("20060102150405")
	stagingDir = filepath.Join(baseDir, fmt.Sprintf("staged_%s", timestamp))
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return "", "", fmt.Errorf("创建预安装目录失败: %w", err)
	}

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("打开更新包失败: %w", err)
	}
	defer r.Close()

	var foundExe string
	for _, f := range r.File {
		targetPath := filepath.Join(stagingDir, f.Name)
		// 防止 Zip Slip 路径穿越
		if !strings.HasPrefix(filepath.Clean(targetPath), filepath.Clean(stagingDir)+string(filepath.Separator)) {
			continue
		}

		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(targetPath, f.Mode())
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			_ = os.RemoveAll(stagingDir)
			return "", "", err
		}

		outFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			_ = os.RemoveAll(stagingDir)
			return "", "", err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			_ = os.RemoveAll(stagingDir)
			return "", "", err
		}

		_, err = io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()
		if err != nil {
			_ = os.RemoveAll(stagingDir)
			return "", "", err
		}

		if strings.EqualFold(filepath.Ext(f.Name), ".exe") {
			foundExe = targetPath
		}
	}

	if foundExe == "" {
		_ = os.RemoveAll(stagingDir)
		return "", "", fmt.Errorf("更新包中未找到可执行程序 (.exe)")
	}

	return foundExe, stagingDir, nil
}

// ApplyUpdateAndRestart 执行 Windows 更新与平滑重启
func ApplyUpdateAndRestart(zipPath string) error {
	stagedExe, stagingDir, err := ExtractAndStageWindowsUpdate(zipPath)
	if err != nil {
		return err
	}

	targetExe, err := os.Executable()
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("获取当前程序路径失败: %w", err)
	}
	targetExe, err = filepath.EvalSymlinks(targetExe)
	if err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("解析当前程序路径失败: %w", err)
	}

	pid := os.Getpid()
	batchPath := filepath.Join(stagingDir, "restart_update.bat")

	batchContent := fmt.Sprintf(`@echo off
setlocal
set OLD_PID=%d
set STAGED_EXE=%s
set TARGET_EXE=%s
set STAGING_DIR=%s

:wait_loop
tasklist /fi "PID eq %%OLD_PID%%" 2>nul | findstr /i "%%OLD_PID%%" >nul
if %%ERRORLEVEL%% equ 0 (
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

timeout /t 1 /nobreak >nul

copy /y "%%STAGED_EXE%%" "%%TARGET_EXE%%" >nul
if %%ERRORLEVEL%% neq 0 (
    timeout /t 2 /nobreak >nul
    copy /y "%%STAGED_EXE%%" "%%TARGET_EXE%%" >nul
)

start "" "%%TARGET_EXE%%"

timeout /t 2 /nobreak >nul
rd /s /q "%%STAGING_DIR%%" 2>nul
`, pid, stagedExe, targetExe, stagingDir)

	if err := os.WriteFile(batchPath, []byte(batchContent), 0755); err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("创建 Windows 替换脚本失败: %w", err)
	}

	cmd := exec.Command("cmd.exe", "/c", batchPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(stagingDir)
		return fmt.Errorf("启动 Windows 更新脚本失败: %w", err)
	}

	_ = cmd.Process.Release()
	return nil
}
