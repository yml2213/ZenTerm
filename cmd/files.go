package cmd

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"zenterm/internal/model"
	"zenterm/internal/service"
)

// ListLocalFiles 返回本机目录内容 / returns the local directory contents.
func (a *App) ListLocalFiles(path string) (FileListing, error) {
	listing, err := a.service.ListLocalFiles(path)
	if err != nil {
		return FileListing{}, normalizeFrontendError(err)
	}

	return fileListingFromModel(listing), nil
}

// ListRemoteFiles 返回指定主机的远端目录内容 / returns the remote directory contents for the selected host.
func (a *App) ListRemoteFiles(hostID, path string) (FileListing, error) {
	listing, err := a.service.ListRemoteFiles(hostID, path)
	if err != nil {
		return FileListing{}, normalizeFrontendError(err)
	}

	return fileListingFromModel(listing), nil
}

// CreateLocalDirectory 在本地目录下创建文件夹 / creates a directory inside a local parent directory.
func (a *App) CreateLocalDirectory(parentPath, name string) (FileEntry, error) {
	entry, err := a.service.CreateLocalDirectory(parentPath, name)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	return fileEntryFromModel(entry), nil
}

// CreateRemoteDirectory 在远端目录下创建文件夹 / creates a directory inside a remote parent directory.
func (a *App) CreateRemoteDirectory(hostID, parentPath, name string) (FileEntry, error) {
	entry, err := a.service.CreateRemoteDirectory(hostID, parentPath, name)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	return fileEntryFromModel(entry), nil
}

// RenameLocalEntry 重命名本地文件或目录 / renames a local file or directory.
func (a *App) RenameLocalEntry(path, nextName string) (FileEntry, error) {
	entry, err := a.service.RenameLocalEntry(path, nextName)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	return fileEntryFromModel(entry), nil
}

// RenameRemoteEntry 重命名远端文件或目录 / renames a remote file or directory.
func (a *App) RenameRemoteEntry(hostID, path, nextName string) (FileEntry, error) {
	entry, err := a.service.RenameRemoteEntry(hostID, path, nextName)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	return fileEntryFromModel(entry), nil
}

// DeleteLocalEntry 删除本地文件或目录 / deletes a local file or directory.
func (a *App) DeleteLocalEntry(path string) error {
	if err := a.service.DeleteLocalEntry(path); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// DeleteRemoteEntry 删除远端文件或目录 / deletes a remote file or directory.
func (a *App) DeleteRemoteEntry(hostID, path string) error {
	if err := a.service.DeleteRemoteEntry(hostID, path); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// eventSFTPTransferProgress 是 SFTP 文件传输进度事件名 / the SFTP file-transfer progress event name.
const eventSFTPTransferProgress = "sftp:transfer-progress"

// UploadFile 将本地文件上传到远端目录，可按需覆盖已有文件 / uploads a local file into the selected remote directory and can overwrite an existing file when requested.
func (a *App) UploadFile(hostID, localPath, remoteDir string, overwrite bool, transferID string) (model.FileTransferResult, error) {
	result, err := a.service.UploadFile(hostID, localPath, remoteDir, overwrite, func(p service.TransferProgress) {
		p.TransferID = transferID
		a.emitEvent(eventSFTPTransferProgress, p)
	})
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}

	return result, nil
}

// DownloadFile 将远端文件下载到本地目录，可按需覆盖已有文件 / downloads a remote file into the selected local directory and can overwrite an existing file when requested.
func (a *App) DownloadFile(hostID, remotePath, localDir string, overwrite bool, transferID string) (model.FileTransferResult, error) {
	result, err := a.service.DownloadFile(hostID, remotePath, localDir, overwrite, func(p service.TransferProgress) {
		p.TransferID = transferID
		a.emitEvent(eventSFTPTransferProgress, p)
	})
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}

	return result, nil
}

// CancelFileTransfer 取消指定主机当前正在进行的 SFTP 文件传输。
func (a *App) CancelFileTransfer(hostID string) error {
	if err := a.service.CancelFileTransfer(hostID); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// UploadDirectory 上传本地整个目录到远端，支持自动压缩解压加速或递归上传 / uploads a whole local directory to a remote directory.
func (a *App) UploadDirectory(hostID, localPath, remoteDir string, autoCompress bool, overwrite bool, transferID string) (model.FileTransferResult, error) {
	result, err := a.service.UploadDirectory(hostID, localPath, remoteDir, autoCompress, overwrite, func(p service.TransferProgress) {
		p.TransferID = transferID
		a.emitEvent(eventSFTPTransferProgress, p)
	})
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}
	return result, nil
}

// ExtractLocalArchive 解压本地压缩文件到目标目录 / extracts a local archive to target directory.
func (a *App) ExtractLocalArchive(archivePath, targetDir string) error {
	if err := a.service.ExtractLocalArchive(archivePath, targetDir); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// ExtractRemoteArchive 解压远程压缩文件到目标目录 / extracts a remote archive to target directory.
func (a *App) ExtractRemoteArchive(hostID, archivePath, targetDir string) error {
	if err := a.service.ExtractRemoteArchive(hostID, archivePath, targetDir); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// CompressLocalEntry 压缩本地文件或文件夹 / compresses a local file or directory.
func (a *App) CompressLocalEntry(sourcePath, targetArchivePath string) error {
	if err := a.service.CompressLocalEntry(sourcePath, targetArchivePath); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// CompressRemoteEntry 压缩远程文件或文件夹 / compresses a remote file or directory.
func (a *App) CompressRemoteEntry(hostID, sourcePath, targetArchivePath string) error {
	if err := a.service.CompressRemoteEntry(hostID, sourcePath, targetArchivePath); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// ChmodLocalEntry 修改本地文件或目录的权限 / changes the permissions of a local file or directory.
func (a *App) ChmodLocalEntry(path string, mode string) (FileEntry, error) {
	parsed, err := parseFileMode(mode)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	entry, err := a.service.ChmodLocalEntry(path, parsed)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	return fileEntryFromModel(entry), nil
}

// ChmodRemoteEntry 修改远端文件或目录的权限 / changes the permissions of a remote file or directory.
func (a *App) ChmodRemoteEntry(hostID, path, mode string) (FileEntry, error) {
	parsed, err := parseFileMode(mode)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	entry, err := a.service.ChmodRemoteEntry(hostID, path, parsed)
	if err != nil {
		return FileEntry{}, normalizeFrontendError(err)
	}

	return fileEntryFromModel(entry), nil
}

// parseFileMode 将前端传入的八进制字符串（如 "0755" 或 "755"）解析为 os.FileMode / parses an octal mode string from the frontend into os.FileMode.
func parseFileMode(mode string) (os.FileMode, error) {
	trimmed := strings.TrimSpace(mode)
	if trimmed == "" {
		return 0, service.ErrInvalidFileMode
	}

	parsed, err := strconv.ParseUint(trimmed, 8, 32)
	if err != nil {
		return 0, fmt.Errorf("%w: %s", service.ErrInvalidFileMode, trimmed)
	}

	if parsed > 0o7777 {
		return 0, fmt.Errorf("%w: %s exceeds maximum 7777", service.ErrInvalidFileMode, trimmed)
	}

	return os.FileMode(parsed), nil
}
