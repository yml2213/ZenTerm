package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
)

const (
	aesKeySize  = 32
	gcmNonceLen = 12
)

var (
	ErrVaultLocked           = errors.New("vault is locked")
	ErrEmptyPassword         = errors.New("master password cannot be empty")
	ErrInvalidMasterPassword = errors.New("invalid master password")
	ErrInvalidSalt           = errors.New("salt must be at least 16 bytes")
	ErrInvalidKeyLength      = errors.New("derived key must be 32 bytes")
)

// Argon2Params 控制如何将主密码拉伸为 AES 密钥 / controls how the master password is stretched into an AES key.
type Argon2Params struct {
	Time    uint32
	Memory  uint32
	Threads uint8
	KeyLen  uint32
}

// DefaultArgon2Params 返回默认 Argon2 参数，在交互式解锁延迟与抗暴力破解成本之间做平衡 / returns default Argon2 parameters balancing unlock latency and brute-force resistance.
func DefaultArgon2Params() Argon2Params {
	return Argon2Params{
		Time:    1,
		Memory:  64 * 1024,
		Threads: 4,
		KeyLen:  aesKeySize,
	}
}

// Ciphertext 表示自包含的密文载荷，字段使用 base64 编码 / stores a self-contained encrypted payload with base64-encoded fields.
type Ciphertext struct {
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

// Vault 使用主密码派生密钥，并在内存中处理敏感字符串加解密 / derives a key from the master password and encrypts sensitive strings in memory.
type Vault struct {
	params Argon2Params
	reader io.Reader

	key  []byte
	aead cipher.AEAD
}

// NewVault 创建一个默认处于锁定状态的 Vault / returns a locked vault using secure defaults.
func NewVault() *Vault {
	return &Vault{
		params: DefaultArgon2Params(),
		reader: rand.Reader,
	}
}

// NewSalt 生成用于 Argon2id 的随机盐值 / creates a random salt for Argon2id.
func NewSalt(size int) ([]byte, error) {
	if size < 16 {
		return nil, ErrInvalidSalt
	}

	salt := make([]byte, size)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("generate salt: %w", err)
	}

	return salt, nil
}

// Unlock 使用主密码和盐值派生加密密钥并解锁 Vault / derives the encryption key from the master password and salt.
func (v *Vault) Unlock(masterPassword string, salt []byte) error {
	if masterPassword == "" {
		return ErrEmptyPassword
	}
	if len(salt) < 16 {
		return ErrInvalidSalt
	}

	key := argon2.IDKey([]byte(masterPassword), salt, v.params.Time, v.params.Memory, v.params.Threads, v.params.KeyLen)
	if len(key) != aesKeySize {
		zeroBytes(key)
		return ErrInvalidKeyLength
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		zeroBytes(key)
		return fmt.Errorf("create AES cipher: %w", err)
	}

	aead, err := cipher.NewGCM(block)
	if err != nil {
		zeroBytes(key)
		return fmt.Errorf("create GCM cipher: %w", err)
	}

	v.Lock()
	v.key = key
	v.aead = aead

	return nil
}

// Lock 清除 Vault 当前持有的派生密钥材料 / clears any derived key material held by the vault.
func (v *Vault) Lock() {
	if len(v.key) > 0 {
		zeroBytes(v.key)
	}
	v.key = nil
	v.aead = nil
}

// IsUnlocked 返回当前 Vault 是否已经持有可用密钥 / reports whether the vault currently holds a usable derived key.
func (v *Vault) IsUnlocked() bool {
	return v.aead != nil
}

// EncryptString 将 UTF-8 字符串加密为 base64 编码载荷 / encrypts a UTF-8 string into a base64-encoded payload.
func (v *Vault) EncryptString(plaintext string) (Ciphertext, error) {
	if v.aead == nil {
		return Ciphertext{}, ErrVaultLocked
	}

	nonce := make([]byte, gcmNonceLen)
	if _, err := io.ReadFull(v.reader, nonce); err != nil {
		return Ciphertext{}, fmt.Errorf("generate nonce: %w", err)
	}

	sealed := v.aead.Seal(nil, nonce, []byte(plaintext), nil)

	return Ciphertext{
		Nonce:      base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: base64.StdEncoding.EncodeToString(sealed),
	}, nil
}

// DecryptString 解密先前生成的密文载荷 / decrypts a previously encrypted payload.
func (v *Vault) DecryptString(payload Ciphertext) (string, error) {
	if v.aead == nil {
		return "", ErrVaultLocked
	}

	nonce, err := base64.StdEncoding.DecodeString(payload.Nonce)
	if err != nil {
		return "", fmt.Errorf("decode nonce: %w", err)
	}
	if len(nonce) != gcmNonceLen {
		return "", fmt.Errorf("invalid nonce length: got %d want %d", len(nonce), gcmNonceLen)
	}

	ciphertext, err := base64.StdEncoding.DecodeString(payload.Ciphertext)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	plaintext, err := v.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt ciphertext: %w", err)
	}

	return string(plaintext), nil
}

func zeroBytes(buf []byte) {
	for i := range buf {
		buf[i] = 0
	}
}
