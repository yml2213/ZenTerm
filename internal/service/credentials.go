package service

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"time"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

// GenerateCredential 生成新的 SSH 密钥对凭据 / generates a new SSH key pair credential.
func (s *Service) GenerateCredential(label, algorithm string, keyBits int, passphrase string) (string, error) {
	if label == "" {
		return "", ErrCredentialLabelRequired
	}

	if algorithm == "" {
		algorithm = "ed25519"
	}

	var privateKey crypto.PrivateKey
	var err error

	switch algorithm {
	case "ed25519":
		_, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return "", fmt.Errorf("generate ed25519 key: %w", err)
		}
		privateKey = priv
	case "rsa":
		if keyBits < 2048 {
			keyBits = 2048
		}
		if keyBits > 4096 {
			keyBits = 4096
		}
		priv, err := rsa.GenerateKey(rand.Reader, keyBits)
		if err != nil {
			return "", fmt.Errorf("generate rsa key: %w", err)
		}
		privateKey = priv
	case "ecdsa":
		var curve elliptic.Curve
		switch keyBits {
		case 256:
			curve = elliptic.P256()
		case 384:
			curve = elliptic.P384()
		case 521:
			curve = elliptic.P521()
		default:
			keyBits = 256
			curve = elliptic.P256()
		}
		priv, err := ecdsa.GenerateKey(curve, rand.Reader)
		if err != nil {
			return "", fmt.Errorf("generate ecdsa key: %w", err)
		}
		privateKey = priv
	default:
		return "", ErrInvalidAlgorithm
	}

	privBlock, err := marshalOpenSSHPrivateKey(privateKey, label, passphrase)
	if err != nil {
		return "", fmt.Errorf("marshal private key: %w", err)
	}

	var pubKey ssh.PublicKey
	var err2 error
	switch key := privateKey.(type) {
	case ed25519.PrivateKey:
		pubKey, err2 = ssh.NewPublicKey(key.Public())
	case *rsa.PrivateKey:
		pubKey, err2 = ssh.NewPublicKey(key.Public())
	case *ecdsa.PrivateKey:
		pubKey, err2 = ssh.NewPublicKey(key.Public())
	default:
		return "", fmt.Errorf("unsupported key type: %T", privateKey)
	}
	if err2 != nil {
		return "", fmt.Errorf("create ssh public key: %w", err2)
	}
	pubKeyBytes := ssh.MarshalAuthorizedKey(pubKey)

	now := time.Now().UTC()
	cred := model.Credential{
		ID:        newCredentialID(),
		Label:     label,
		Type:      model.CredentialTypeSSHKey,
		Algorithm: formatAlgorithmName(algorithm, keyBits),
		PublicKey: string(pubKeyBytes),
		CreatedAt: now,
	}

	if err := s.store.AddCredential(cred, string(privBlock), passphrase, s.vault); err != nil {
		return "", fmt.Errorf("store credential: %w", err)
	}

	return cred.ID, nil
}

func formatAlgorithmName(algorithm string, keyBits int) string {
	switch algorithm {
	case "ed25519":
		return "ed25519"
	case "rsa":
		return fmt.Sprintf("rsa-%d", keyBits)
	case "ecdsa":
		return fmt.Sprintf("ecdsa-p%d", keyBits)
	default:
		return algorithm
	}
}

// ImportCredential 导入现有的 SSH 密钥凭据 / imports an existing SSH key credential.
func (s *Service) ImportCredential(label, privateKeyPEM, passphrase string) (string, error) {
	if label == "" {
		return "", ErrCredentialLabelRequired
	}
	if privateKeyPEM == "" {
		return "", fmt.Errorf("private key is required")
	}

	signer, err := parsePrivateKeySigner(privateKeyPEM, passphrase)
	if err != nil {
		return "", ErrInvalidPrivateKey
	}
	pubKey := signer.PublicKey()

	pubKeyBytes := ssh.MarshalAuthorizedKey(pubKey)

	now := time.Now().UTC()
	cred := model.Credential{
		ID:        newCredentialID(),
		Label:     label,
		Type:      model.CredentialTypeSSHKey,
		Algorithm: algorithmFromPublicKey(pubKey),
		PublicKey: string(pubKeyBytes),
		CreatedAt: now,
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

// GetCredentialPublicKey 返回指定凭据的公钥内容 / returns the public key material for a credential.
func (s *Service) GetCredentialPublicKey(credentialID string) (string, error) {
	if credentialID == "" {
		return "", ErrCredentialIDRequired
	}

	cred, err := s.store.GetCredential(credentialID)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(cred.PublicKey), nil
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

func marshalOpenSSHPrivateKey(privateKey crypto.PrivateKey, comment, passphrase string) ([]byte, error) {
	var block *pem.Block
	var err error
	if passphrase != "" {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(privateKey, comment, []byte(passphrase))
	} else {
		block, err = ssh.MarshalPrivateKey(privateKey, comment)
	}
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(block), nil
}

func parsePrivateKeySigner(privateKey, passphrase string) (ssh.Signer, error) {
	payload := []byte(privateKey)
	signer, err := ssh.ParsePrivateKey(payload)
	if err == nil {
		return signer, nil
	}

	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) && passphrase != "" {
		return ssh.ParsePrivateKeyWithPassphrase(payload, []byte(passphrase))
	}

	return nil, err
}

func algorithmFromPublicKey(publicKey ssh.PublicKey) string {
	switch publicKey.Type() {
	case ssh.KeyAlgoED25519:
		return "ed25519"
	case ssh.KeyAlgoRSA, ssh.KeyAlgoRSASHA256, ssh.KeyAlgoRSASHA512:
		return "rsa"
	case ssh.KeyAlgoECDSA256:
		return "ecdsa-p256"
	case ssh.KeyAlgoECDSA384:
		return "ecdsa-p384"
	case ssh.KeyAlgoECDSA521:
		return "ecdsa-p521"
	default:
		return publicKey.Type()
	}
}

// GetCredentialSecret 解密并返回指定凭据的敏感私钥和密码 / decrypts and returns the sensitive private key and password for a credential.
func (s *Service) GetCredentialSecret(credentialID string) (string, string, error) {
	if s.vault == nil || !s.vault.IsUnlocked() {
		return "", "", ErrVaultLocked
	}
	if credentialID == "" {
		return "", "", ErrCredentialIDRequired
	}
	return s.store.GetCredentialSecret(credentialID, s.vault)
}

// GetHostSecret 解密并返回指定主机的密码或私钥身份凭据 / decrypts and returns the stored identity for a specific host.
func (s *Service) GetHostSecret(hostID string) (model.Identity, error) {
	if s.vault == nil || !s.vault.IsUnlocked() {
		return model.Identity{}, ErrVaultLocked
	}
	if hostID == "" {
		return model.Identity{}, ErrHostIDRequired
	}
	return s.store.GetIdentity(hostID, s.vault)
}


func newCredentialID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		// 极端情况下 crypto/rand 失败，退化为时间戳兜底，避免凭据创建完全失败 / fall back to a timestamp when crypto/rand fails so credential creation never hard-fails.
		return fmt.Sprintf("cred_%d", time.Now().UnixNano())
	}
	return "cred_" + hex.EncodeToString(buf)
}

