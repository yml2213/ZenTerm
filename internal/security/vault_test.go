package security

import (
	"errors"
	"sync"
	"testing"
)

func TestVaultEncryptDecryptRoundTrip(t *testing.T) {
	vault := NewVault()
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}

	if err := vault.Unlock("correct horse battery staple", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	payload, err := vault.EncryptString("ssh-private-key")
	if err != nil {
		t.Fatalf("EncryptString() error = %v", err)
	}

	plaintext, err := vault.DecryptString(payload)
	if err != nil {
		t.Fatalf("DecryptString() error = %v", err)
	}

	if plaintext != "ssh-private-key" {
		t.Fatalf("DecryptString() = %q, want %q", plaintext, "ssh-private-key")
	}
}

func TestVaultRequiresUnlock(t *testing.T) {
	vault := NewVault()

	if _, err := vault.EncryptString("secret"); err != ErrVaultLocked {
		t.Fatalf("EncryptString() error = %v, want %v", err, ErrVaultLocked)
	}
}

func TestVaultFailsWithWrongPassword(t *testing.T) {
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}

	locked := NewVault()
	if err := locked.Unlock("first-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	payload, err := locked.EncryptString("sensitive-value")
	if err != nil {
		t.Fatalf("EncryptString() error = %v", err)
	}

	unlockAttempt := NewVault()
	if err := unlockAttempt.Unlock("wrong-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	if _, err := unlockAttempt.DecryptString(payload); err == nil {
		t.Fatal("DecryptString() error = nil, want non-nil")
	}
}

func TestVaultDetectsTampering(t *testing.T) {
	vault := NewVault()
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}

	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	payload, err := vault.EncryptString("known-good")
	if err != nil {
		t.Fatalf("EncryptString() error = %v", err)
	}

	payload.Ciphertext = payload.Ciphertext[:len(payload.Ciphertext)-4] + "AAAA"

	if _, err := vault.DecryptString(payload); err == nil {
		t.Fatal("DecryptString() error = nil, want non-nil")
	}
}

func TestVaultLockClearsState(t *testing.T) {
	vault := NewVault()
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}

	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	vault.Lock()

	if _, err := vault.DecryptString(Ciphertext{}); err != ErrVaultLocked {
		t.Fatalf("DecryptString() error = %v, want %v", err, ErrVaultLocked)
	}
}

// TestArgon2ParamsSanitize 验证：异常 KeyLen 被强制为 aesKeySize，零值字段回退默认值 / verifies Sanitize forces KeyLen to aesKeySize and falls zero fields back to defaults.
func TestArgon2ParamsSanitize(t *testing.T) {
	cases := []struct {
		name string
		in   Argon2Params
	}{
		{"bad key len", Argon2Params{Time: 1, Memory: 64 * 1024, Threads: 4, KeyLen: 16}},
		{"zero key len", Argon2Params{Time: 1, Memory: 64 * 1024, Threads: 4, KeyLen: 0}},
		{"all zero", Argon2Params{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.in.Sanitize()
			if got.KeyLen != aesKeySize {
				t.Fatalf("KeyLen = %d, want %d", got.KeyLen, aesKeySize)
			}
			if got.Time == 0 || got.Memory == 0 || got.Threads == 0 {
				t.Fatalf("Sanitize() = %#v, expected all non-zero", got)
			}
		})
	}
}

// TestVaultSetParamsPersistsAcrossUnlock 验证：SetParams 设定的自定义参数真正用于派生密钥（同一密码+盐+参数才能解出同一密文） / verifies SetParams actually governs key derivation (same password+salt+params is needed to decrypt).
func TestVaultSetParamsPersistsAcrossUnlock(t *testing.T) {
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}

	custom := Argon2Params{Time: 2, Memory: 128 * 1024, Threads: 2, KeyLen: aesKeySize}
	author := NewVault()
	author.SetParams(custom)
	if author.Params() != custom {
		t.Fatalf("Params() = %#v, want %#v", author.Params(), custom)
	}
	if err := author.Unlock("master", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	payload, err := author.EncryptString("secret")
	if err != nil {
		t.Fatalf("EncryptString() error = %v", err)
	}

	// 用默认参数的 vault 解不出用 custom 参数加密的密文 / a default-params vault cannot decrypt what custom-params produced.
	defaultVault := NewVault()
	if err := defaultVault.Unlock("master", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if _, err := defaultVault.DecryptString(payload); err == nil {
		t.Fatal("default-params vault unexpectedly decrypted custom-params ciphertext")
	}

	// 同样 custom 参数的 vault 能解出 / a vault with the same custom params can.
	reader := NewVault()
	reader.SetParams(custom)
	if err := reader.Unlock("master", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	got, err := reader.DecryptString(payload)
	if err != nil {
		t.Fatalf("DecryptString() error = %v", err)
	}
	if got != "secret" {
		t.Fatalf("DecryptString() = %q, want %q", got, "secret")
	}
}

func TestVaultConcurrentAccessIsRaceSafe(t *testing.T) {
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}

	vault := NewVault()
	vault.SetParams(Argon2Params{Time: 1, Memory: 1024, Threads: 1, KeyLen: aesKeySize})
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	payload, err := vault.EncryptStringWithAAD("secret", []byte("ctx"))
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}

	var wg sync.WaitGroup
	errCh := make(chan error, 32)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_ = vault.Params()
				_ = vault.IsUnlocked()
				if _, err := vault.EncryptStringWithAAD("value", []byte("ctx")); err != nil && !errors.Is(err, ErrVaultLocked) {
					errCh <- err
					return
				}
				if _, err := vault.DecryptStringWithAAD(payload, []byte("ctx")); err != nil && !errors.Is(err, ErrVaultLocked) {
					errCh <- err
					return
				}
			}
		}()
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			vault.Lock()
			if err := vault.Unlock("master-password", salt); err != nil {
				errCh <- err
				return
			}
		}
	}()

	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatalf("concurrent vault operation error = %v", err)
	}
}
