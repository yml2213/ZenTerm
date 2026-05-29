package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

var ErrLocalSSHKeyPathInvalid = errors.New("local ssh key path is invalid")

// ListLocalSSHKeys 扫描本机 ~/.ssh 下的密钥文件元数据 / scans local ~/.ssh key metadata.
func (s *Service) ListLocalSSHKeys() ([]model.LocalSSHKey, error) {
	sshDir, err := localSSHDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(sshDir)
	if errors.Is(err, os.ErrNotExist) {
		return []model.LocalSSHKey{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read local ssh directory: %w", err)
	}

	credentials, err := s.store.GetCredentials()
	if err != nil {
		return nil, err
	}
	importedByPublicKey := make(map[string]string, len(credentials))
	for _, credential := range credentials {
		publicKey := strings.TrimSpace(credential.PublicKey)
		if publicKey != "" {
			importedByPublicKey[publicKey] = credential.ID
		}
	}

	seen := make(map[string]bool)
	keys := make([]model.LocalSSHKey, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		fullPath := filepath.Join(sshDir, name)
		if strings.HasSuffix(name, ".pub") {
			privatePath := strings.TrimSuffix(fullPath, ".pub")
			if seen[privatePath] {
				continue
			}
			key, ok := readLocalPublicKey(fullPath)
			if !ok {
				continue
			}

			localKey := localKeyFromPublic(privatePath, fullPath, key)
			localKey.HasPrivate = regularFileExists(privatePath)
			localKey.Encrypted = localKey.HasPrivate && localPrivateKeyEncrypted(privatePath)
			markImported(&localKey, importedByPublicKey)
			keys = append(keys, localKey)
			seen[privatePath] = true
			continue
		}

		if seen[fullPath] || isIgnoredSSHFile(name) || !looksLikePrivateKey(fullPath) {
			continue
		}

		localKey, ok := localKeyFromPrivate(fullPath)
		if !ok {
			continue
		}
		markImported(&localKey, importedByPublicKey)
		keys = append(keys, localKey)
		seen[fullPath] = true
	}

	sort.Slice(keys, func(i, j int) bool {
		return keys[i].Name < keys[j].Name
	})
	return keys, nil
}

// ImportLocalSSHKey 将本机私钥导入 ZenTerm 保险箱 / imports a local private key into the ZenTerm vault.
func (s *Service) ImportLocalSSHKey(path, label, passphrase string) (string, error) {
	keyPath, err := validateLocalSSHKeyPath(path)
	if err != nil {
		return "", err
	}

	privateKey, err := os.ReadFile(keyPath)
	if err != nil {
		return "", fmt.Errorf("read local ssh key: %w", err)
	}

	if strings.TrimSpace(label) == "" {
		label = filepath.Base(keyPath)
	}
	return s.ImportCredential(label, string(privateKey), passphrase)
}

func localSSHDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, ".ssh"), nil
}

func validateLocalSSHKeyPath(path string) (string, error) {
	if path == "" || !filepath.IsAbs(path) {
		return "", ErrLocalSSHKeyPathInvalid
	}

	sshDir, err := localSSHDir()
	if err != nil {
		return "", err
	}

	cleanPath := filepath.Clean(path)
	rel, err := filepath.Rel(sshDir, cleanPath)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", ErrLocalSSHKeyPathInvalid
	}
	if strings.HasSuffix(cleanPath, ".pub") || isIgnoredSSHFile(filepath.Base(cleanPath)) {
		return "", ErrLocalSSHKeyPathInvalid
	}
	if !looksLikePrivateKey(cleanPath) {
		return "", ErrLocalSSHKeyPathInvalid
	}

	return cleanPath, nil
}

func readLocalPublicKey(path string) (ssh.PublicKey, bool) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	publicKey, _, _, _, err := ssh.ParseAuthorizedKey(payload)
	return publicKey, err == nil
}

func localKeyFromPublic(privatePath, publicPath string, publicKey ssh.PublicKey) model.LocalSSHKey {
	publicKeyText := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(publicKey)))
	return model.LocalSSHKey{
		ID:                privatePath,
		Name:              filepath.Base(privatePath),
		Path:              privatePath,
		PublicPath:        publicPath,
		Algorithm:         algorithmFromPublicKey(publicKey),
		PublicKey:         publicKeyText,
		FingerprintSHA256: ssh.FingerprintSHA256(publicKey),
	}
}

func localKeyFromPrivate(path string) (model.LocalSSHKey, bool) {
	payload, err := os.ReadFile(path)
	if err != nil {
		return model.LocalSSHKey{}, false
	}

	signer, err := ssh.ParsePrivateKey(payload)
	encrypted := false
	var missing *ssh.PassphraseMissingError
	if err != nil {
		if !errors.As(err, &missing) || missing.PublicKey == nil {
			return model.LocalSSHKey{}, false
		}
		encrypted = true
		publicKey := missing.PublicKey
		localKey := localKeyFromPublic(path, "", publicKey)
		localKey.HasPrivate = true
		localKey.Encrypted = encrypted
		return localKey, true
	}

	localKey := localKeyFromPublic(path, "", signer.PublicKey())
	localKey.HasPrivate = true
	localKey.Encrypted = encrypted
	return localKey, true
}

func markImported(localKey *model.LocalSSHKey, importedByPublicKey map[string]string) {
	if credentialID, ok := importedByPublicKey[strings.TrimSpace(localKey.PublicKey)]; ok {
		localKey.Imported = true
		localKey.CredentialID = credentialID
	}
}

func regularFileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

func looksLikePrivateKey(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}

	payload, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(string(payload), "PRIVATE KEY")
}

func localPrivateKeyEncrypted(path string) bool {
	payload, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	if _, err := ssh.ParsePrivateKey(payload); err == nil {
		return false
	}
	var missing *ssh.PassphraseMissingError
	return errors.As(err, &missing)
}

func isIgnoredSSHFile(name string) bool {
	switch name {
	case "authorized_keys", "config", "known_hosts", "known_hosts.old", "environment", "rc":
		return true
	default:
		return strings.HasPrefix(name, ".") || strings.HasSuffix(name, ".pub")
	}
}
