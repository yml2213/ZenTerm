package service

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
	"time"
)

var (
	ErrUnsupportedArchiveFormat = errors.New("unsupported archive format")
	ErrArchivePathRequired      = errors.New("archive path is required")
	ErrTargetDirectoryRequired  = errors.New("target directory is required")
	ErrSourcePathRequired       = errors.New("source path is required")
	ErrPathTraversalDetected    = errors.New("illegal file path (path traversal)")
)

// ExtractLocalArchive 解压本地压缩文件到目标目录 / extracts a local archive into the target directory.
func (s *Service) ExtractLocalArchive(archivePath, targetDir string) error {
	archivePath = strings.TrimSpace(archivePath)
	if archivePath == "" {
		return ErrArchivePathRequired
	}
	targetDir = strings.TrimSpace(targetDir)
	if targetDir == "" {
		return ErrTargetDirectoryRequired
	}

	resolvedArchive, err := resolveLocalPath(archivePath)
	if err != nil {
		return err
	}
	resolvedTarget, err := resolveLocalPath(targetDir)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(resolvedTarget, 0o755); err != nil {
		return fmt.Errorf("create target directory: %w", err)
	}

	lower := strings.ToLower(resolvedArchive)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return extractLocalZip(resolvedArchive, resolvedTarget)
	case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
		return extractLocalTarGz(resolvedArchive, resolvedTarget)
	case strings.HasSuffix(lower, ".tar"):
		return extractLocalTar(resolvedArchive, resolvedTarget)
	default:
		return fmt.Errorf("%w: %s", ErrUnsupportedArchiveFormat, filepath.Base(resolvedArchive))
	}
}

// CompressLocalEntry 压缩本地文件或目录为指定的压缩包 / compresses a local file or directory to a target archive.
func (s *Service) CompressLocalEntry(sourcePath, targetArchivePath string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return ErrSourcePathRequired
	}
	targetArchivePath = strings.TrimSpace(targetArchivePath)
	if targetArchivePath == "" {
		return ErrArchivePathRequired
	}

	resolvedSource, err := resolveLocalPath(sourcePath)
	if err != nil {
		return err
	}
	resolvedTarget, err := resolveLocalPath(targetArchivePath)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(resolvedTarget), 0o755); err != nil {
		return fmt.Errorf("create archive parent directory: %w", err)
	}

	lower := strings.ToLower(resolvedTarget)
	if strings.HasSuffix(lower, ".zip") {
		return compressLocalZip(resolvedSource, resolvedTarget)
	}

	// 默认使用 .tar.gz / default to .tar.gz
	return compressLocalTarGz(resolvedSource, resolvedTarget)
}

// ExtractRemoteArchive 解压远程主机上的压缩包 / extracts a remote archive on the target host.
func (s *Service) ExtractRemoteArchive(hostID, archivePath, targetDir string) error {
	archivePath = strings.TrimSpace(archivePath)
	if archivePath == "" {
		return ErrArchivePathRequired
	}
	targetDir = strings.TrimSpace(targetDir)
	if targetDir == "" {
		return ErrTargetDirectoryRequired
	}

	cmd, err := buildRemoteExtractCommand(archivePath, targetDir)
	if err != nil {
		return err
	}

	output, execErr := s.runRemoteExecCommand(hostID, cmd)
	if execErr != nil {
		return fmt.Errorf("extract remote archive failed: %w (output: %s)", execErr, strings.TrimSpace(output))
	}

	return nil
}

// CompressRemoteEntry 在远程主机上压缩文件或目录 / compresses a remote file or directory on the target host.
func (s *Service) CompressRemoteEntry(hostID, sourcePath, targetArchivePath string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	if sourcePath == "" {
		return ErrSourcePathRequired
	}
	targetArchivePath = strings.TrimSpace(targetArchivePath)
	if targetArchivePath == "" {
		return ErrArchivePathRequired
	}

	cmd, err := buildRemoteCompressCommand(sourcePath, targetArchivePath)
	if err != nil {
		return err
	}

	output, execErr := s.runRemoteExecCommand(hostID, cmd)
	if execErr != nil {
		return fmt.Errorf("compress remote entry failed: %w (output: %s)", execErr, strings.TrimSpace(output))
	}

	return nil
}

func (s *Service) runRemoteExecCommand(hostID, command string) (string, error) {
	conn, err := s.getOrCreateSFTPConnection(hostID)
	if err != nil {
		return "", err
	}

	client := conn.client
	if client == nil {
		return "", errors.New("sftp ssh client unavailable")
	}

	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("create remote session: %w", err)
	}
	defer func() { _ = session.Close() }()

	out, err := session.CombinedOutput(command)
	return string(out), err
}

func buildRemoteExtractCommand(archivePath, targetDir string) (string, error) {
	cleanArchive := pathpkg.Clean(archivePath)
	cleanTarget := pathpkg.Clean(targetDir)
	lower := strings.ToLower(cleanArchive)

	quoteTarget := fmt.Sprintf("%q", cleanTarget)
	quoteArchive := fmt.Sprintf("%q", cleanArchive)

	mkdirCmd := fmt.Sprintf("mkdir -p %s && ", quoteTarget)

	switch {
	case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
		return fmt.Sprintf("%star -xzf %s -C %s", mkdirCmd, quoteArchive, quoteTarget), nil
	case strings.HasSuffix(lower, ".tar.bz2") || strings.HasSuffix(lower, ".tbz2"):
		return fmt.Sprintf("%star -xjf %s -C %s", mkdirCmd, quoteArchive, quoteTarget), nil
	case strings.HasSuffix(lower, ".tar.xz") || strings.HasSuffix(lower, ".txz"):
		return fmt.Sprintf("%star -xJf %s -C %s", mkdirCmd, quoteArchive, quoteTarget), nil
	case strings.HasSuffix(lower, ".tar"):
		return fmt.Sprintf("%star -xf %s -C %s", mkdirCmd, quoteArchive, quoteTarget), nil
	case strings.HasSuffix(lower, ".zip"):
		// 优先 unzip，未安装则 fallback 到 python / perl / 7z / powershell
		unzipCmd := fmt.Sprintf("if command -v unzip >/dev/null 2>&1; then unzip -q -o %s -d %s; elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -e %s %s; elif command -v 7z >/dev/null 2>&1; then 7z x -y -o%s %s; else tar -xf %s -C %s; fi",
			quoteArchive, quoteTarget, quoteArchive, quoteTarget, quoteTarget, quoteArchive, quoteArchive, quoteTarget)
		return mkdirCmd + unzipCmd, nil
	default:
		return "", fmt.Errorf("%w: %s", ErrUnsupportedArchiveFormat, pathpkg.Base(cleanArchive))
	}
}

func buildRemoteCompressCommand(sourcePath, targetArchivePath string) (string, error) {
	cleanSource := pathpkg.Clean(sourcePath)
	cleanTarget := pathpkg.Clean(targetArchivePath)
	sourceDir := pathpkg.Dir(cleanSource)
	sourceBase := pathpkg.Base(cleanSource)

	quoteTargetDir := fmt.Sprintf("%q", pathpkg.Dir(cleanTarget))
	quoteTarget := fmt.Sprintf("%q", cleanTarget)
	quoteSourceDir := fmt.Sprintf("%q", sourceDir)
	quoteSourceBase := fmt.Sprintf("%q", sourceBase)

	mkdirCmd := fmt.Sprintf("mkdir -p %s && ", quoteTargetDir)

	lower := strings.ToLower(cleanTarget)
	if strings.HasSuffix(lower, ".zip") {
		zipCmd := fmt.Sprintf("if command -v zip >/dev/null 2>&1; then (cd %s && zip -rq %s %s); elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -c %s %s; else (cd %s && tar -czf %s %s); fi",
			quoteSourceDir, quoteTarget, quoteSourceBase, quoteTarget, cleanSource, quoteSourceDir, quoteTarget, quoteSourceBase)
		return mkdirCmd + zipCmd, nil
	}

	// 默认 tar.gz / default tar.gz
	return fmt.Sprintf("%s(cd %s && tar -czf %s %s)", mkdirCmd, quoteSourceDir, quoteTarget, quoteSourceBase), nil
}

func extractLocalZip(archivePath, targetDir string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("open zip archive: %w", err)
	}
	defer func() { _ = reader.Close() }()

	cleanTarget := filepath.Clean(targetDir)

	for _, f := range reader.File {
		destPath := filepath.Join(cleanTarget, f.Name)
		if !strings.HasPrefix(filepath.Clean(destPath), cleanTarget+string(filepath.Separator)) && filepath.Clean(destPath) != cleanTarget {
			return fmt.Errorf("%w: %s", ErrPathTraversalDetected, f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
			return err
		}

		destFile, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode().Perm())
		if err != nil {
			return err
		}

		srcFile, err := f.Open()
		if err != nil {
			_ = destFile.Close()
			return err
		}

		_, copyErr := io.Copy(destFile, srcFile)
		_ = srcFile.Close()
		closeErr := destFile.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}

	return nil
}

func extractLocalTarGz(archivePath, targetDir string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open tar.gz archive: %w", err)
	}
	defer func() { _ = f.Close() }()

	gzReader, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("create gzip reader: %w", err)
	}
	defer func() { _ = gzReader.Close() }()

	return extractTarStream(gzReader, targetDir)
}

func extractLocalTar(archivePath, targetDir string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open tar archive: %w", err)
	}
	defer func() { _ = f.Close() }()

	return extractTarStream(f, targetDir)
}

func extractTarStream(reader io.Reader, targetDir string) error {
	tarReader := tar.NewReader(reader)
	cleanTarget := filepath.Clean(targetDir)

	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar entry: %w", err)
		}

		destPath := filepath.Join(cleanTarget, header.Name)
		if !strings.HasPrefix(filepath.Clean(destPath), cleanTarget+string(filepath.Separator)) && filepath.Clean(destPath) != cleanTarget {
			return fmt.Errorf("%w: %s", ErrPathTraversalDetected, header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(destPath, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
				return err
			}

			mode := header.FileInfo().Mode().Perm()
			if mode == 0 {
				mode = 0o644
			}

			destFile, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return err
			}

			_, copyErr := io.Copy(destFile, tarReader)
			closeErr := destFile.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
		}
	}

	return nil
}

func compressLocalTarGz(sourcePath, targetArchivePath string) error {
	targetFile, err := os.Create(targetArchivePath)
	if err != nil {
		return fmt.Errorf("create target archive: %w", err)
	}
	defer func() { _ = targetFile.Close() }()

	gzWriter := gzip.NewWriter(targetFile)
	defer func() { _ = gzWriter.Close() }()

	tarWriter := tar.NewWriter(gzWriter)
	defer func() { _ = tarWriter.Close() }()

	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return fmt.Errorf("stat source path: %w", err)
	}

	baseDir := filepath.Dir(sourcePath)

	return filepath.Walk(sourcePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(baseDir, path)
		if err != nil {
			return err
		}

		// Windows 兼容性：转换为正斜杠
		relPath = filepath.ToSlash(relPath)

		header, err := tar.FileInfoHeader(info, info.Name())
		if err != nil {
			return err
		}

		header.Name = relPath
		if info.IsDir() {
			header.Name += "/"
		}

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		if !sourceInfo.IsDir() && path == sourcePath {
			srcFile, err := os.Open(path)
			if err != nil {
				return err
			}
			defer func() { _ = srcFile.Close() }()
			_, err = io.Copy(tarWriter, srcFile)
			return err
		}

		if info.Mode().IsRegular() {
			srcFile, err := os.Open(path)
			if err != nil {
				return err
			}
			defer func() { _ = srcFile.Close() }()
			_, err = io.Copy(tarWriter, srcFile)
			return err
		}

		return nil
	})
}

func compressLocalZip(sourcePath, targetArchivePath string) error {
	targetFile, err := os.Create(targetArchivePath)
	if err != nil {
		return fmt.Errorf("create target zip: %w", err)
	}
	defer func() { _ = targetFile.Close() }()

	zipWriter := zip.NewWriter(targetFile)
	defer func() { _ = zipWriter.Close() }()

	baseDir := filepath.Dir(sourcePath)

	return filepath.Walk(sourcePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(baseDir, path)
		if err != nil {
			return err
		}
		relPath = filepath.ToSlash(relPath)

		if info.IsDir() {
			if relPath != "." {
				_, err := zipWriter.Create(relPath + "/")
				return err
			}
			return nil
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = relPath
		header.Method = zip.Deflate

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return err
		}

		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer func() { _ = srcFile.Close() }()

		_, err = io.Copy(writer, srcFile)
		return err
	})
}

// createTempLocalArchiveOfDir 为本地目录创建临时的 .tar.gz 压缩包以供快速上传 / creates a temporary local tar.gz archive of a directory for fast upload.
func createTempLocalArchiveOfDir(sourceDir string) (string, error) {
	tempFile, err := os.CreateTemp("", fmt.Sprintf("zenterm-upload-%d-*.tar.gz", time.Now().UnixNano()))
	if err != nil {
		return "", fmt.Errorf("create temp archive file: %w", err)
	}
	tempPath := tempFile.Name()
	_ = tempFile.Close()

	if err := compressLocalTarGz(sourceDir, tempPath); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}

	return tempPath, nil
}
