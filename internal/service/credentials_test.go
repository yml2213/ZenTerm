package service

import (
	"fmt"
	"os"
	"testing"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/security"
)

func setupTestServiceWithT(t testing.TB) (*Service, func()) {
	t.Helper()

	tmpFile, err := os.CreateTemp("", "zenterm-test-*.zen")
	if err != nil {
		t.Fatalf("创建临时文件失败：%v", err)
	}
	tmpFile.Close()
	os.Remove(tmpFile.Name())

	store, err := db.NewStore(tmpFile.Name())
	if err != nil {
		os.Remove(tmpFile.Name())
		t.Fatalf("创建存储失败：%v", err)
	}

	svc, err := New(store, security.NewVault())
	if err != nil {
		os.Remove(tmpFile.Name())
		t.Fatalf("创建服务失败：%v", err)
	}

	if err := svc.InitializeVault("test-password"); err != nil {
		os.Remove(tmpFile.Name())
		t.Fatalf("初始化保险箱失败：%v", err)
	}

	if err := svc.UnlockVault("test-password"); err != nil {
		os.Remove(tmpFile.Name())
		t.Fatalf("解锁保险箱失败：%v", err)
	}

	cleanup := func() {
		os.Remove(tmpFile.Name())
	}

	return svc, cleanup
}

func TestGenerateED25519Credential(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	start := time.Now()
	credentialID, err := svc.GenerateCredential("test-ed25519", "ed25519", 0, "")
	if err != nil {
		t.Fatalf("生成 ED25519 凭据失败：%v", err)
	}
	duration := time.Since(start)

	if credentialID == "" {
		t.Error("凭据 ID 为空")
	}

	t.Logf("ED25519 密钥生成耗时：%v", duration)

	creds, err := svc.GetCredentials()
	if err != nil {
		t.Fatalf("获取凭据列表失败：%v", err)
	}

	if len(creds) != 1 {
		t.Errorf("期望 1 个凭据，实际 %d 个", len(creds))
	}

	if creds[0].Algorithm != "ed25519" {
		t.Errorf("期望算法为 ed25519，实际为 %s", creds[0].Algorithm)
	}

	if creds[0].Label != "test-ed25519" {
		t.Errorf("期望标签为 test-ed25519，实际为 %s", creds[0].Label)
	}
}

func TestGenerateRSACredential(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	testCases := []struct {
		name     string
		keyBits  int
		expected string
	}{
		{"RSA-1024", 1024, "rsa-1024"},
		{"RSA-2048", 2048, "rsa-2048"},
		{"RSA-4096", 4096, "rsa-4096"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			start := time.Now()
			credentialID, err := svc.GenerateCredential(tc.name, "rsa", tc.keyBits, "")
			if err != nil {
				t.Fatalf("生成 %s 凭据失败：%v", tc.name, err)
			}
			duration := time.Since(start)

			if credentialID == "" {
				t.Error("凭据 ID 为空")
			}

			t.Logf("%s 密钥生成耗时：%v", tc.name, duration)

			creds, err := svc.GetCredentials()
			if err != nil {
				t.Fatalf("获取凭据列表失败：%v", err)
			}

			var found bool
			for _, cred := range creds {
				if cred.Label == tc.name {
					if cred.Algorithm != tc.expected {
						t.Errorf("期望算法为 %s，实际为 %s", tc.expected, cred.Algorithm)
					}
					found = true
					break
				}
			}

			if !found {
				t.Errorf("未找到凭据 %s", tc.name)
			}
		})
	}
}

func TestRSABitLimits(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	testCases := []struct {
		name        string
		keyBits     int
		expectBits  int
		expectError bool
	}{
		{"小于最小值", 512, 1024, false},
		{"最小值", 1024, 1024, false},
		{"中间值", 2048, 2048, false},
		{"最大值", 4096, 4096, false},
		{"大于最大值", 8192, 4096, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			credentialID, err := svc.GenerateCredential(tc.name, "rsa", tc.keyBits, "")
			if tc.expectError && err == nil {
				t.Error("期望错误但成功")
			}
			if !tc.expectError && err != nil {
				t.Fatalf("生成失败：%v", err)
			}

			if credentialID != "" {
				cred, err := svc.GetCredential(credentialID)
				if err != nil {
					t.Fatalf("获取凭据失败：%v", err)
				}

				expectedAlgo := fmt.Sprintf("rsa-%d", tc.expectBits)
				if cred.Algorithm != expectedAlgo {
					t.Errorf("期望算法 %s，实际 %s", expectedAlgo, cred.Algorithm)
				}
			}
		})
	}
}

func TestCredentialWithPassphrase(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	credentialID, err := svc.GenerateCredential("test-passphrase", "ed25519", 0, "my-secret-passphrase")
	if err != nil {
		t.Fatalf("生成带密码短语的凭据失败：%v", err)
	}

	if credentialID == "" {
		t.Error("凭据 ID 为空")
	}

	creds, err := svc.GetCredentials()
	if err != nil {
		t.Fatalf("获取凭据列表失败：%v", err)
	}

	if len(creds) != 1 {
		t.Errorf("期望 1 个凭据，实际 %d 个", len(creds))
	}
}

func TestGenerateECDSACredential(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	testCases := []struct {
		name     string
		keyBits  int
		expected string
	}{
		{"ECDSA-P256", 256, "ecdsa-p256"},
		{"ECDSA-P384", 384, "ecdsa-p384"},
		{"ECDSA-P521", 521, "ecdsa-p521"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			start := time.Now()
			credentialID, err := svc.GenerateCredential(tc.name, "ecdsa", tc.keyBits, "")
			if err != nil {
				t.Fatalf("生成 %s 凭据失败：%v", tc.name, err)
			}
			duration := time.Since(start)

			if credentialID == "" {
				t.Error("凭据 ID 为空")
			}

			t.Logf("%s 密钥生成耗时：%v", tc.name, duration)

			creds, err := svc.GetCredentials()
			if err != nil {
				t.Fatalf("获取凭据列表失败：%v", err)
			}

			var found bool
			for _, cred := range creds {
				if cred.Label == tc.name {
					if cred.Algorithm != tc.expected {
						t.Errorf("期望算法为 %s，实际为 %s", tc.expected, cred.Algorithm)
					}
					found = true
					break
				}
			}

			if !found {
				t.Errorf("未找到凭据 %s", tc.name)
			}
		})
	}
}

func BenchmarkGenerateED25519(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential(b.Name(), "ed25519", 0, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}

func BenchmarkGenerateRSA2048(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential("bench-rsa-2048", "rsa", 2048, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}

func BenchmarkGenerateRSA4096(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential("bench-rsa-4096", "rsa", 4096, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}

func BenchmarkGenerateRSA8192(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential("bench-rsa-8192", "rsa", 8192, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}

func BenchmarkGenerateECDSAP256(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential("bench-ecdsa-p256", "ecdsa", 256, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}

func BenchmarkGenerateECDSAP384(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential("bench-ecdsa-p384", "ecdsa", 384, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}

func BenchmarkGenerateECDSAP521(b *testing.B) {
	svc, cleanup := setupTestServiceWithT(b)
	defer cleanup()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := svc.GenerateCredential("bench-ecdsa-p521", "ecdsa", 521, "")
		if err != nil {
			b.Fatalf("生成失败：%v", err)
		}
	}
}
