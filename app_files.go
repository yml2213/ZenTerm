package main

import "zenterm/internal/model"

// ListLocalFiles 返回本机目录内容 / returns the local directory contents.
func (a *App) ListLocalFiles(path string) (model.FileListing, error) {
	listing, err := a.service.ListLocalFiles(path)
	if err != nil {
		return model.FileListing{}, normalizeFrontendError(err)
	}

	return listing, nil
}

// ListRemoteFiles 返回指定主机的远端目录内容 / returns the remote directory contents for the selected host.
func (a *App) ListRemoteFiles(hostID, path string) (model.FileListing, error) {
	listing, err := a.service.ListRemoteFiles(hostID, path)
	if err != nil {
		return model.FileListing{}, normalizeFrontendError(err)
	}

	return listing, nil
}

// CreateLocalDirectory 在本地目录下创建文件夹 / creates a directory inside a local parent directory.
func (a *App) CreateLocalDirectory(parentPath, name string) (model.FileEntry, error) {
	entry, err := a.service.CreateLocalDirectory(parentPath, name)
	if err != nil {
		return model.FileEntry{}, normalizeFrontendError(err)
	}

	return entry, nil
}

// CreateRemoteDirectory 在远端目录下创建文件夹 / creates a directory inside a remote parent directory.
func (a *App) CreateRemoteDirectory(hostID, parentPath, name string) (model.FileEntry, error) {
	entry, err := a.service.CreateRemoteDirectory(hostID, parentPath, name)
	if err != nil {
		return model.FileEntry{}, normalizeFrontendError(err)
	}

	return entry, nil
}

// RenameLocalEntry 重命名本地文件或目录 / renames a local file or directory.
func (a *App) RenameLocalEntry(path, nextName string) (model.FileEntry, error) {
	entry, err := a.service.RenameLocalEntry(path, nextName)
	if err != nil {
		return model.FileEntry{}, normalizeFrontendError(err)
	}

	return entry, nil
}

// RenameRemoteEntry 重命名远端文件或目录 / renames a remote file or directory.
func (a *App) RenameRemoteEntry(hostID, path, nextName string) (model.FileEntry, error) {
	entry, err := a.service.RenameRemoteEntry(hostID, path, nextName)
	if err != nil {
		return model.FileEntry{}, normalizeFrontendError(err)
	}

	return entry, nil
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

// UploadFile 将本地文件上传到远端目录，可按需覆盖已有文件 / uploads a local file into the selected remote directory and can overwrite an existing file when requested.
func (a *App) UploadFile(hostID, localPath, remoteDir string, overwrite bool) (model.FileTransferResult, error) {
	result, err := a.service.UploadFile(hostID, localPath, remoteDir, overwrite)
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}

	return result, nil
}

// DownloadFile 将远端文件下载到本地目录，可按需覆盖已有文件 / downloads a remote file into the selected local directory and can overwrite an existing file when requested.
func (a *App) DownloadFile(hostID, remotePath, localDir string, overwrite bool) (model.FileTransferResult, error) {
	result, err := a.service.DownloadFile(hostID, remotePath, localDir, overwrite)
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}

	return result, nil
}
