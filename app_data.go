package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// DataStats 返回本机数据文件的基本统计信息 / returns basic statistics about the local data file.
type DataStats struct {
	StorePath    string `json:"store_path"`
	FileSize     int64  `json:"file_size"`
	HostCount    int    `json:"host_count"`
	CredentialCount int    `json:"credential_count"`
	SessionLogCount int    `json:"session_log_count"`
	ModifiedAt   string `json:"modified_at"`
}

// BackupEntry 表示一个本地备份文件 / represents a local backup file.
type BackupEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

// GetDataStats 返回本机存储的主机、凭据和会话记录数量及文件大小。
// GetDataStats returns the local store file size and counts of hosts, credentials, and session logs.
func (a *App) GetDataStats() (DataStats, error) {
	storePath := a.store.Path()

	var fileSize int64
	var modifiedAt string
	if info, err := os.Stat(storePath); err == nil {
		fileSize = info.Size()
		modifiedAt = info.ModTime().Format(time.RFC3339)
	}

	hosts, err := a.service.GetHosts()
	if err != nil {
		return DataStats{}, normalizeFrontendError(err)
	}

	creds, err := a.service.GetCredentials()
	if err != nil {
		return DataStats{}, normalizeFrontendError(err)
	}

	logs, err := a.service.ListSessionLogs(0)
	if err != nil {
		return DataStats{}, normalizeFrontendError(err)
	}

	return DataStats{
		StorePath:       storePath,
		FileSize:        fileSize,
		HostCount:       len(hosts),
		CredentialCount: len(creds),
		SessionLogCount: len(logs),
		ModifiedAt:      modifiedAt,
	}, nil
}

// ExportDataToPath 将加密快照导出到指定路径 / exports an encrypted snapshot to the given file path.
func (a *App) ExportDataToPath(targetPath string) error {
	if strings.TrimSpace(targetPath) == "" {
		return fmt.Errorf("export path is required")
	}

	payload, _, err := a.service.BuildEncryptedSyncSnapshot("local-export", "本机导出", false)
	if err != nil {
		return normalizeFrontendError(err)
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create export directory: %w", err)
	}

	if err := os.WriteFile(targetPath, payload, 0o600); err != nil {
		return fmt.Errorf("write export file: %w", err)
	}

	return nil
}

// ExportData 弹出系统保存对话框并将加密快照写入用户选择的位置。
// ExportData opens a native save dialog and writes the encrypted snapshot to the chosen path.
func (a *App) ExportData() (string, error) {
	timestamp := time.Now().Format("20060102-150405")
	defaultName := fmt.Sprintf("zenterm-backup-%s.zen", timestamp)

	targetPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出数据备份",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: "ZenTerm 备份 (*.zen)", Pattern: "*.zen"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", normalizeFrontendError(err)
	}
	if targetPath == "" {
		return "", nil // user cancelled
	}

	if err := a.ExportDataToPath(targetPath); err != nil {
		return "", err
	}

	return targetPath, nil
}

// ImportDataFromPath 从指定路径读取加密快照并导入，需要主密码解密。
// ImportDataFromPath reads an encrypted snapshot from the given path and imports it.
func (a *App) ImportDataFromPath(filePath string, masterPassword string) error {
	if strings.TrimSpace(filePath) == "" {
		return fmt.Errorf("import file path is required")
	}
	if strings.TrimSpace(masterPassword) == "" {
		return fmt.Errorf("master password is required to decrypt the backup")
	}

	payload, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read import file: %w", err)
	}

	if _, _, _, err := a.service.ApplyEncryptedSyncSnapshot(masterPassword, payload); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// ImportData 弹出系统打开文件对话框，选择备份文件后输入主密码进行导入。
// ImportData opens a native file dialog for selecting a backup, then imports it.
func (a *App) ImportData(masterPassword string) (string, error) {
	if strings.TrimSpace(masterPassword) == "" {
		return "", fmt.Errorf("master password is required to decrypt the backup")
	}

	selectedPath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择备份文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "ZenTerm 备份 (*.zen)", Pattern: "*.zen"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", normalizeFrontendError(err)
	}
	if selectedPath == "" {
		return "", nil // user cancelled
	}

	if err := a.ImportDataFromPath(selectedPath, masterPassword); err != nil {
		return "", err
	}

	return selectedPath, nil
}

// ListBackups 返回 ZenTerm 备份目录中的所有备份文件。
// ListBackups returns all backup files in the ZenTerm backups directory.
func (a *App) ListBackups() ([]BackupEntry, error) {
	backupDir := filepath.Join(filepath.Dir(a.store.Path()), "backups")

	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackupEntry{}, nil
		}
		return nil, fmt.Errorf("read backup directory: %w", err)
	}

	var backups []BackupEntry
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		backups = append(backups, BackupEntry{
			Name:     entry.Name(),
			Path:     filepath.Join(backupDir, entry.Name()),
			Size:     info.Size(),
			Modified: info.ModTime().Format(time.RFC3339),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Modified > backups[j].Modified
	})

	return backups, nil
}

// DeleteBackup 删除指定的备份文件 / deletes the specified backup file.
func (a *App) DeleteBackup(backupPath string) error {
	if strings.TrimSpace(backupPath) == "" {
		return fmt.Errorf("backup path is required")
	}

	backupDir := filepath.Join(filepath.Dir(a.store.Path()), "backups")
	if !strings.HasPrefix(backupPath, backupDir) {
		return fmt.Errorf("invalid backup path: not in backups directory")
	}

	if err := os.Remove(backupPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete backup: %w", err)
	}

	return nil
}

// RestoreBackup 从备份目录中的备份恢复数据 / restores data from a backup in the backups directory.
func (a *App) RestoreBackup(backupPath string, masterPassword string) error {
	if strings.TrimSpace(backupPath) == "" {
		return fmt.Errorf("backup path is required")
	}
	if strings.TrimSpace(masterPassword) == "" {
		return fmt.Errorf("master password is required to decrypt the backup")
	}

	backupDir := filepath.Join(filepath.Dir(a.store.Path()), "backups")
	if !strings.HasPrefix(backupPath, backupDir) {
		return fmt.Errorf("invalid backup path: not in backups directory")
	}

	return a.ImportDataFromPath(backupPath, masterPassword)
}

// OpenStoreDirectory 在系统文件管理器中打开数据存储目录 / opens the data store directory in the system file manager.
func (a *App) OpenStoreDirectory() {
	dir := filepath.Dir(a.store.Path())
	runtime.BrowserOpenURL(a.ctx, "file://"+dir)
}
