package service

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"unicode/utf8"

	"zenterm/internal/model"
)

// maxEditableFileSize 限制编辑器可打开的文件大小，避免 UI 卡死 / limits the max size of files that the editor can open.
const maxEditableFileSize int64 = 2 << 20 // 2 MiB

// editorBackupSuffix 保存前备份文件的后缀 / suffix appended to the original path when backing up.
const editorBackupSuffix = ".bak"

// editorBackupEnabled 读取偏好判断是否保存前备份，默认开启 / reports whether pre-save backup is enabled (default on).
func (s *Service) editorBackupEnabled() bool {
	prefs, err := s.store.GetAppPreferences()
	if err != nil {
		return true
	}

	return !prefs.DisableEditorBackup
}

// backupLocalFile 将本地原文件复制为同目录 xxx.bak / copies the local original to path+".bak".
func backupLocalFile(path string, info os.FileInfo) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}
	if err := os.WriteFile(path+editorBackupSuffix, data, info.Mode().Perm()); err != nil {
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}

	return nil
}

// backupRemoteFile 将远端原文件复制为同目录 xxx.bak / copies the remote original to path+".bak" over SFTP.
func backupRemoteFile(sftpConn sftpClient, resolvedPath string) error {
	reader, err := sftpConn.Open(resolvedPath)
	if err != nil {
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}
	data, err := io.ReadAll(io.LimitReader(reader, maxEditableFileSize+1))
	_ = reader.Close()
	if err != nil {
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}

	writer, err := sftpConn.Create(resolvedPath + editorBackupSuffix)
	if err != nil {
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}
	if _, err := writer.Write(data); err != nil {
		_ = writer.Close()
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("备份原文件失败，已中止保存: %w", err)
	}

	return nil
}

// decodeTextPayload 判断字节内容是否为可编辑文本并解码 / decides whether the payload is editable text and decodes it.
// 规则：包含 NUL 字节视为二进制；非法 UTF-8 视为非文本。二者都返回不可编辑及原因。
func decodeTextPayload(data []byte) (string, bool, string) {
	if bytes.IndexByte(data, 0x00) >= 0 {
		return "", false, "二进制文件不支持在线编辑，请使用上传/下载"
	}

	if !utf8.Valid(data) {
		return "", false, "非 UTF-8 编码文本暂不支持在线编辑"
	}

	return string(data), true, ""
}

// checkEditableFileMeta 校验文件元信息是否允许编辑 / validates file metadata before editing.
func checkEditableFileMeta(info os.FileInfo) error {
	if info.IsDir() {
		return ErrFileEditNotRegularFile
	}

	if !info.Mode().IsRegular() {
		return fmt.Errorf("%w: %s", ErrFileEditNotRegularFile, info.Name())
	}

	if info.Size() > maxEditableFileSize {
		return fmt.Errorf("%w: %d MiB > %d MiB", ErrFileEditTooLarge, info.Size()>>20, maxEditableFileSize>>20)
	}

	return nil
}

// ReadLocalFile 读取本地文本文件内容 / reads a local text file for editing.
func (s *Service) ReadLocalFile(targetPath string) (model.FileContent, error) {
	resolvedPath, err := resolveLocalPath(targetPath)
	if err != nil {
		return model.FileContent{}, err
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return model.FileContent{}, fmt.Errorf("read local file info: %w", err)
	}
	if err := checkEditableFileMeta(info); err != nil {
		return model.FileContent{}, err
	}

	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		return model.FileContent{}, fmt.Errorf("read local file: %w", err)
	}

	content, editable, reason := decodeTextPayload(data)
	if !editable {
		return model.FileContent{Path: resolvedPath, Size: info.Size(), Editable: false, Reason: reason}, nil
	}

	return model.FileContent{Path: resolvedPath, Content: content, Editable: true, Size: info.Size()}, nil
}

// WriteLocalFile 保存本地文本文件内容 / writes text content back to a local file.
// 返回值表示本次保存是否创建了 .bak 备份 / the bool reports whether a .bak backup was created.
func (s *Service) WriteLocalFile(targetPath, content string) (bool, error) {
	resolvedPath, err := resolveLocalPath(targetPath)
	if err != nil {
		return false, err
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return false, fmt.Errorf("read local file info: %w", err)
	}
	if err := checkEditableFileMeta(info); err != nil {
		return false, err
	}

	backupCreated := false
	if s.editorBackupEnabled() {
		if err := backupLocalFile(resolvedPath, info); err != nil {
			return false, err
		}
		backupCreated = true
	}

	if err := os.WriteFile(resolvedPath, []byte(content), info.Mode().Perm()); err != nil {
		return false, fmt.Errorf("write local file: %w", err)
	}

	return backupCreated, nil
}

// ReadRemoteFile 通过 SFTP 读取远端文本文件 / reads a remote text file through SFTP.
func (s *Service) ReadRemoteFile(hostID, targetPath string) (model.FileContent, error) {
	var result model.FileContent

	err := s.withReusableSFTPClient(hostID, func(sftpConn sftpClient, remoteAddr string) error {
		resolvedPath, err := resolveRemotePath(sftpConn, targetPath)
		if err != nil {
			return fmt.Errorf("resolve remote path for %s: %w", remoteAddr, err)
		}

		info, err := sftpConn.Stat(resolvedPath)
		if err != nil {
			return fmt.Errorf("read remote file info: %w", err)
		}
		if err := checkEditableFileMeta(info); err != nil {
			return err
		}

		reader, err := sftpConn.Open(resolvedPath)
		if err != nil {
			return fmt.Errorf("open remote file: %w", err)
		}
		defer reader.Close()

		data, err := io.ReadAll(io.LimitReader(reader, maxEditableFileSize+1))
		if err != nil {
			return fmt.Errorf("read remote file: %w", err)
		}

		content, editable, reason := decodeTextPayload(data)
		if !editable {
			result = model.FileContent{Path: resolvedPath, Size: info.Size(), Editable: false, Reason: reason}
			return nil
		}

		result = model.FileContent{Path: resolvedPath, Content: content, Editable: true, Size: info.Size()}
		return nil
	})
	if err != nil {
		return model.FileContent{}, err
	}

	return result, nil
}

// WriteRemoteFile 通过 SFTP 保存远端文本文件 / writes text content back to a remote file through SFTP.
// 返回值表示本次保存是否创建了 .bak 备份 / the bool reports whether a .bak backup was created.
func (s *Service) WriteRemoteFile(hostID, targetPath, content string) (bool, error) {
	backupCreated := false

	err := s.withReusableSFTPClient(hostID, func(sftpConn sftpClient, remoteAddr string) error {
		resolvedPath, err := resolveRemotePath(sftpConn, targetPath)
		if err != nil {
			return fmt.Errorf("resolve remote path for %s: %w", remoteAddr, err)
		}

		info, err := sftpConn.Stat(resolvedPath)
		if err != nil {
			return fmt.Errorf("read remote file info: %w", err)
		}
		if err := checkEditableFileMeta(info); err != nil {
			return err
		}

		if s.editorBackupEnabled() {
			if err := backupRemoteFile(sftpConn, resolvedPath); err != nil {
				return err
			}
			backupCreated = true
		}

		writer, err := sftpConn.Create(resolvedPath)
		if err != nil {
			return fmt.Errorf("open remote file for write: %w", err)
		}

		if _, err := writer.Write([]byte(content)); err != nil {
			_ = writer.Close()
			return fmt.Errorf("write remote file: %w", err)
		}

		if err := writer.Close(); err != nil {
			return fmt.Errorf("close remote file: %w", err)
		}

		return nil
	})
	if err != nil {
		return false, err
	}

	return backupCreated, nil
}
