package security

import "testing"

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
