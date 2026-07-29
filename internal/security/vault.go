package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"sync"

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
// 字段带上 json tag 以便序列化进 vaultData，为未来升级密钥派生成本（调高 Memory/Time）留迁移路径 / fields carry json tags so they persist into vaultData, leaving a migration path for raising KDF cost later.
type Argon2Params struct {
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
	KeyLen  uint32 `json:"key_len"`
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

// Sanitize 返回一份安全可用的参数副本：KeyLen 强制为 aesKeySize，其余字段补零回退到默认值 / returns a safe copy of the params, forcing KeyLen to aesKeySize and falling back zero fields to defaults.
// 用于信任读取自磁盘的 KDF 参数前做归一化，避免历史/手改数据导致派生密钥长度异常 / used to normalize KDF params read from disk before trusting them, so historical or hand-edited data can't produce an odd key length.
func (p Argon2Params) Sanitize() Argon2Params {
	if p.KeyLen != aesKeySize {
		p.KeyLen = aesKeySize
	}
	if p.Time == 0 {
		p.Time = DefaultArgon2Params().Time
	}
	if p.Memory == 0 {
		p.Memory = DefaultArgon2Params().Memory
	}
	if p.Threads == 0 {
		p.Threads = DefaultArgon2Params().Threads
	}
	return p
}

// Ciphertext 表示自包含的密文载荷，字段使用 base64 编码 / stores a self-contained encrypted payload with base64-encoded fields.
// AAD 字段记录加密时绑定的上下文标识（如 "zenterm:host:<id>:password"）；GCM 完整性保证该字段不可被篡改，解密时用于区分带上下文的新格式与无 AAD 的旧格式 / the AAD field records the context tag bound at encryption time (e.g. "zenterm:host:<id>:password"); GCM integrity protects it from tampering, and it distinguishes the new context-bound format from legacy no-AAD payloads during decryption.
type Ciphertext struct {
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
	AAD        string `json:"aad,omitempty"`
}

// Vault 使用主密码派生密钥，并在内存中处理敏感字符串加解密 / derives a key from the master password and encrypts sensitive strings in memory.
type Vault struct {
	mu       sync.RWMutex
	readerMu sync.Mutex

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

// Params 返回当前 Vault 使用的 KDF 参数，供持久化或诊断使用 / returns the KDF parameters currently configured on the vault, for persistence or diagnostics.
func (v *Vault) Params() Argon2Params {
	v.mu.RLock()
	defer v.mu.RUnlock()

	return v.params
}

// SetParams 覆盖 KDF 参数；必须在 Unlock 之前调用，且参数会被 Sanitize 归一化以避免异常 KeyLen / overrides the KDF parameters; must be called before Unlock, and the params are sanitized to guard against an odd KeyLen.
func (v *Vault) SetParams(params Argon2Params) {
	v.mu.Lock()
	defer v.mu.Unlock()

	v.params = params.Sanitize()
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

	v.mu.RLock()
	params := v.params
	v.mu.RUnlock()

	key := argon2.IDKey([]byte(masterPassword), salt, params.Time, params.Memory, params.Threads, params.KeyLen)
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

	v.mu.Lock()
	defer v.mu.Unlock()

	if len(v.key) > 0 {
		zeroBytes(v.key)
	}
	v.key = key
	v.aead = aead

	return nil
}

// Lock 清除 Vault 当前持有的派生密钥材料 / clears any derived key material held by the vault.
func (v *Vault) Lock() {
	v.mu.Lock()
	defer v.mu.Unlock()

	if len(v.key) > 0 {
		zeroBytes(v.key)
	}
	v.key = nil
	v.aead = nil
}

// IsUnlocked 返回当前 Vault 是否已经持有可用密钥 / reports whether the vault currently holds a usable derived key.
func (v *Vault) IsUnlocked() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()

	return v.aead != nil
}

// EncryptString 将 UTF-8 字符串加密为 base64 编码载荷 / encrypts a UTF-8 string into a base64-encoded payload.
// 不绑定上下文 AAD，仅供 vault 校验哨兵与同步 envelope 等不与具体条目绑定的载荷使用 / carries no context AAD; use it only for payloads not bound to a specific entry, such as the vault check sentinel or sync envelopes.
func (v *Vault) EncryptString(plaintext string) (Ciphertext, error) {
	return v.EncryptStringWithAAD(plaintext, nil)
}

// EncryptStringWithAAD 将明文与上下文 aad 绑定加密 / encrypts plaintext bound to a context AAD.
// aad 标识同时写入返回的 Ciphertext.AAD 字段，供解密方识别格式；跨条目复制密文时 aad 不匹配会被 GCM 拒绝 / the aad tag is also stored in Ciphertext.AAD so decrypters can recognize the format; copying a ciphertext to another entry fails GCM verification because the aad won't match.
func (v *Vault) EncryptStringWithAAD(plaintext string, aad []byte) (Ciphertext, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if v.aead == nil {
		return Ciphertext{}, ErrVaultLocked
	}

	nonce := make([]byte, gcmNonceLen)
	v.readerMu.Lock()
	if _, err := io.ReadFull(v.reader, nonce); err != nil {
		v.readerMu.Unlock()
		return Ciphertext{}, fmt.Errorf("generate nonce: %w", err)
	}
	v.readerMu.Unlock()

	sealed := v.aead.Seal(nil, nonce, []byte(plaintext), aad)

	return Ciphertext{
		Nonce:      base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: base64.StdEncoding.EncodeToString(sealed),
		AAD:        string(aad),
	}, nil
}

// DecryptString 解密先前生成的无上下文 AAD 密文载荷 / decrypts a previously encrypted payload that carries no context AAD.
// 若 payload.AAD 非空则拒绝，强制带上下文的条目密文走 DecryptStringWithAAD，避免误用导致绑定校验被绕过 / refuses payloads with a non-empty AAD so context-bound entry ciphertexts must go through DecryptStringWithAAD, preventing misuse that would bypass the binding check.
func (v *Vault) DecryptString(payload Ciphertext) (string, error) {
	if payload.AAD != "" {
		return "", fmt.Errorf("decrypt ciphertext: payload carries context AAD, use DecryptStringWithAAD")
	}
	return v.DecryptStringWithAAD(payload, nil)
}

// DecryptStringWithAAD 用指定 aad 解密密文 / decrypts a payload with the given aad.
// 旧格式密文（payload.AAD 为空）回退到 nil aad 解密以兼容已落盘数据；新格式密文必须 aad 匹配，否则 GCM 拒绝 / legacy payloads (empty AAD) fall back to nil-aad decryption for already-persisted data; new-format payloads require an exact aad match or GCM rejects them.
func (v *Vault) DecryptStringWithAAD(payload Ciphertext, aad []byte) (string, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()

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

	plaintext, err := v.aead.Open(nil, nonce, ciphertext, aad)
	if err != nil && payload.AAD == "" {
		// 旧格式密文（无 AAD 字段）用 nil aad 重试，保持向后兼容 / retry with nil aad for legacy payloads that predate the AAD field.
		plaintext, err = v.aead.Open(nil, nonce, ciphertext, nil)
	}
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
