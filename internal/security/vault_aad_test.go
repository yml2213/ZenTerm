package security

import (
	"strings"
	"testing"
)

// newUnlockedVault 解锁一个用固定主密码与盐的 Vault，供 AAD 测试复用 / unlocks a vault with a fixed password and salt for the AAD tests.
func newUnlockedVault(t *testing.T) *Vault {
	t.Helper()
	vault := NewVault()
	salt, err := NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	return vault
}

func TestVaultEncryptWithAADRoundTrip(t *testing.T) {
	vault := newUnlockedVault(t)
	aad := []byte("zenterm:host:host-1:password")

	payload, err := vault.EncryptStringWithAAD("secret", aad)
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}
	if payload.AAD != string(aad) {
		t.Fatalf("payload.AAD = %q, want %q", payload.AAD, aad)
	}

	got, err := vault.DecryptStringWithAAD(payload, aad)
	if err != nil {
		t.Fatalf("DecryptStringWithAAD() error = %v", err)
	}
	if got != "secret" {
		t.Fatalf("DecryptStringWithAAD() = %q, want %q", got, "secret")
	}
}

func TestVaultAADRejectsCrossEntryCopy(t *testing.T) {
	vault := newUnlockedVault(t)

	// host A 的密码密文 / ciphertext for host A's password field.
	payload, err := vault.EncryptStringWithAAD("secret", []byte("zenterm:host:host-a:password"))
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}

	// 把 host A 的密文复制到 host B 的密码字段，aad 不匹配应被 GCM 拒绝 / copying host A's ciphertext into host B's password field must fail GCM verification because the aad doesn't match.
	if _, err := vault.DecryptStringWithAAD(payload, []byte("zenterm:host:host-b:password")); err == nil {
		t.Fatal("DecryptStringWithAAD() with mismatched aad should fail")
	}

	// 复制到不同字段类型也应被拒绝 / copying into a different field type must also be rejected.
	if _, err := vault.DecryptStringWithAAD(payload, []byte("zenterm:host:host-a:privatekey")); err == nil {
		t.Fatal("DecryptStringWithAAD() with mismatched field aad should fail")
	}
}

func TestVaultAADLegacyPayloadStillDecrypts(t *testing.T) {
	vault := newUnlockedVault(t)

	// 旧格式：用 EncryptString 加密，AAD 字段为空 / legacy payload encrypted with EncryptString, carrying an empty AAD field.
	payload, err := vault.EncryptString("legacy-secret")
	if err != nil {
		t.Fatalf("EncryptString() error = %v", err)
	}
	if payload.AAD != "" {
		t.Fatalf("legacy payload.AAD = %q, want empty", payload.AAD)
	}

	// 用任意 aad 解密旧格式应回退 nil aad 成功，保持向后兼容 / decrypting a legacy payload with any aad falls back to nil aad and succeeds, preserving backward compatibility.
	got, err := vault.DecryptStringWithAAD(payload, []byte("zenterm:host:host-1:password"))
	if err != nil {
		t.Fatalf("DecryptStringWithAAD(legacy) error = %v", err)
	}
	if got != "legacy-secret" {
		t.Fatalf("DecryptStringWithAAD(legacy) = %q, want %q", got, "legacy-secret")
	}
}

func TestVaultDecryptStringRefusesAADPayload(t *testing.T) {
	vault := newUnlockedVault(t)

	payload, err := vault.EncryptStringWithAAD("secret", []byte("zenterm:host:host-1:password"))
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}

	// 带 AAD 的密文必须走 DecryptStringWithAAD，DecryptString 应拒绝以防误用绕过绑定校验 / AAD-bound ciphertexts must go through DecryptStringWithAAD; DecryptString refuses them to prevent misuse that would bypass the binding check.
	if _, err := vault.DecryptString(payload); err == nil {
		t.Fatal("DecryptString() on AAD payload should refuse")
	}
}

func TestVaultAADClearingFieldDoesNotBypassBinding(t *testing.T) {
	vault := newUnlockedVault(t)

	payload, err := vault.EncryptStringWithAAD("secret", []byte("zenterm:host:host-a:password"))
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}

	// 攻击者把密文复制到 host-b 并清空 AAD 字段，企图让解密方走 nil fallback / attacker copies the ciphertext into host-b and clears the AAD field, hoping to hit the nil fallback.
	// 但原密文用非空 aad 加密，nil fallback 解密同样失败——GCM 完整性覆盖了原始 aad / the original ciphertext was sealed with a non-empty aad, so the nil fallback also fails: GCM integrity covers the original aad.
	tampered := payload
	tampered.AAD = ""
	if _, err := vault.DecryptStringWithAAD(tampered, []byte("zenterm:host:host-b:password")); err == nil {
		t.Fatal("DecryptStringWithAAD() with cleared AAD field and wrong aad should fail (GCM integrity covers original aad)")
	}
}

func TestVaultAADEmptyStringRoundTrips(t *testing.T) {
	vault := newUnlockedVault(t)
	aad := []byte("zenterm:transcript:log-1")

	payload, err := vault.EncryptStringWithAAD("", aad)
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}
	// 空明文也应能往返，且 AAD 字段仍记录上下文 / empty plaintext round-trips too, with the AAD field still carrying the context.
	got, err := vault.DecryptStringWithAAD(payload, aad)
	if err != nil {
		t.Fatalf("DecryptStringWithAAD() error = %v", err)
	}
	if got != "" {
		t.Fatalf("DecryptStringWithAAD() = %q, want empty", got)
	}
}

// TestVaultStoreLevelAADCopyProtection 在 store 层验证跨条目复制防护 / verifies cross-entry copy protection at the store layer.
func TestVaultStoreLevelAADCopyProtection(t *testing.T) {
	vault := newUnlockedVault(t)

	hostAADValue := []byte("zenterm:host:host-a:password")
	payload, err := vault.EncryptStringWithAAD("host-a-secret", hostAADValue)
	if err != nil {
		t.Fatalf("EncryptStringWithAAD() error = %v", err)
	}

	// 模拟把 host-a 密文当作 host-b 的密文解密 / simulate decrypting host-a's ciphertext as if it were host-b's.
	_, err = vault.DecryptStringWithAAD(payload, []byte("zenterm:host:host-b:password"))
	if err == nil {
		t.Fatal("cross-host decryption should fail")
	}
	if !strings.Contains(err.Error(), "message authentication failed") && !strings.Contains(err.Error(), "decrypt ciphertext") {
		t.Fatalf("unexpected error = %v", err)
	}
}
