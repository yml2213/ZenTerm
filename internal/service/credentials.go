package service

import (
	"crypto/rand"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"time"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

// GenerateCredential 生成新的 SSH 密钥对凭据 / generates a new SSH key pair credential.
func (s *Service) GenerateCredential(label, algorithm, passphrase string) (string, error) {
	if label == "" {
		return "", ErrCredentialLabelRequired
	}

	if algorithm == "" {
		algorithm = "ed25519"
	}

	var privateKey interface{}
	var err error

	switch algorithm {
	case "ed25519":
		_, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return "", fmt.Errorf("generate ed25519 key: %w", err)
		}
		privateKey = priv
	case "rsa":
		priv, err := rsa.GenerateKey(rand.Reader, 4096)
		if err != nil {
			return "", fmt.Errorf("generate rsa key: %w", err)
		}
		privateKey = priv
	case "ecdsa":
		return "", fmt.Errorf("ecdsa key generation not yet implemented")
	default:
		return "", ErrInvalidAlgorithm
	}

	privBytes, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		return "", fmt.Errorf("marshal private key: %w", err)
	}

	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: privBytes,
	})

	pubKey, err := ssh.NewPublicKey(privateKey)
	if err != nil {
		return "", fmt.Errorf("create ssh public key: %w", err)
	}
	pubKeyBytes := ssh.MarshalAuthorizedKey(pubKey)

	cred := model.Credential{
		ID:        time.Now().Format("cred_20060102150405"),
		Label:     label,
		Type:      model.CredentialTypeSSHKey,
		Algorithm: algorithm,
		PublicKey: string(pubKeyBytes),
		CreatedAt: time.Now().UTC(),
	}

	if err := s.store.AddCredential(cred, string(privPEM), passphrase, s.vault); err != nil {
		return "", fmt.Errorf("store credential: %w", err)
	}

	return cred.ID, nil
}

// ImportCredential 导入现有的 SSH 密钥凭据 / imports an existing SSH key credential.
func (s *Service) ImportCredential(label, privateKeyPEM, passphrase string) (string, error) {
	if label == "" {
		return "", ErrCredentialLabelRequired
	}
	if privateKeyPEM == "" {
		return "", fmt.Errorf("private key is required")
	}

	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return "", fmt.Errorf("failed to decode PEM block")
	}

	var keyType string
	switch block.Type {
	case "PRIVATE KEY", "ENCRYPTED PRIVATE KEY":
		keyType = "rsa"
	case "OPENSSH PRIVATE KEY":
		keyType = "ed25519"
	default:
		keyType = "unknown"
	}

	var pubKey ssh.PublicKey

	if keyType == "ed25519" {
		key, err := ssh.ParsePrivateKey([]byte(privateKeyPEM))
		if err != nil {
			return "", fmt.Errorf("parse private key: %w", err)
		}
		pubKey = key.PublicKey()
	} else {
		priv, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return "", fmt.Errorf("parse pkcs8 private key: %w", err)
		}
		rsaKey, ok := priv.(*rsa.PrivateKey)
		if !ok {
			return "", fmt.Errorf("not an rsa private key")
		}
		pubKey, err = ssh.NewPublicKey(rsaKey.Public())
		if err != nil {
			return "", fmt.Errorf("create ssh public key: %w", err)
		}
	}

	pubKeyBytes := ssh.MarshalAuthorizedKey(pubKey)

	cred := model.Credential{
		ID:        time.Now().Format("cred_20060102150405"),
		Label:     label,
		Type:      model.CredentialTypeSSHKey,
		Algorithm: keyType,
		PublicKey: string(pubKeyBytes),
		CreatedAt: time.Now().UTC(),
	}

	if err := s.store.AddCredential(cred, privateKeyPEM, passphrase, s.vault); err != nil {
		return "", fmt.Errorf("store credential: %w", err)
	}

	return cred.ID, nil
}

// GetCredentials 返回所有凭据的元数据 / returns all credential metadata.
func (s *Service) GetCredentials() ([]model.Credential, error) {
	return s.store.GetCredentials()
}

// GetCredential 返回指定凭据的详细信息 / returns detailed information for a specific credential.
func (s *Service) GetCredential(credentialID string) (model.Credential, error) {
	return s.store.GetCredential(credentialID)
}

// GetCredentialUsage 获取凭据的使用情况 / gets usage information for a credential.
func (s *Service) GetCredentialUsage(credentialID string) (model.CredentialUsage, error) {
	return s.store.GetCredentialUsage(credentialID)
}

// DeleteCredential 删除指定凭据 / deletes a specific credential.
func (s *Service) DeleteCredential(credentialID string) error {
	if credentialID == "" {
		return ErrCredentialIDRequired
	}

	usage, err := s.store.GetCredentialUsage(credentialID)
	if err != nil {
		return err
	}

	if len(usage.HostIDs) > 0 {
		return ErrCredentialInUse
	}

	return s.store.DeleteCredential(credentialID)
}

// UpdateCredentialLastUsed 更新凭据的最后使用时间 / updates the last used timestamp for a credential.
func (s *Service) UpdateCredentialLastUsed(credentialID string) error {
	if credentialID == "" {
		return ErrCredentialIDRequired
	}

	cred, err := s.store.GetCredential(credentialID)
	if err != nil {
		return err
	}

	cred.LastUsedAt = time.Now().UTC()
	return s.store.UpdateCredentialLastUsed(credentialID)
}
