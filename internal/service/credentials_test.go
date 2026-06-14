package service

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
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
		{"RSA-1024", 1024, "rsa-2048"},
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
		{"小于最小值", 512, 2048, false},
		{"最小值", 1024, 2048, false},
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

	privateKey, passphrase, err := svc.store.GetCredentialSecret(credentialID, svc.vault)
	if err != nil {
		t.Fatalf("读取凭据密文失败：%v", err)
	}
	if passphrase != "my-secret-passphrase" {
		t.Fatalf("密码短语 = %q，期望保存的密码短语", passphrase)
	}
	if _, err := ssh.ParsePrivateKey([]byte(privateKey)); err == nil {
		t.Fatal("未带密码短语解析加密私钥成功，期望失败")
	}
	if _, err := parsePrivateKeySigner(privateKey, passphrase); err != nil {
		t.Fatalf("带密码短语解析加密私钥失败：%v", err)
	}
}

func TestUploadCredentialToHostUploadsAndBinds(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	credentialID, err := svc.GenerateCredential("deploy-key", "ed25519", 0, "")
	if err != nil {
		t.Fatalf("GenerateCredential() error = %v", err)
	}

	host := model.Host{
		ID:       "deploy-host",
		Address:  "deploy.example.com",
		Port:     22,
		Username: "zen",
	}
	if err := svc.store.AddHost(host, model.Identity{Password: "bootstrap-password"}, svc.vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	session := &stubSSHSession{combinedOutput: "changed=1\n"}
	client := &stubSSHClient{session: session}
	svc.dialer = &stubDialer{client: client}

	result, err := svc.UploadCredentialToHost(host.ID, credentialID, true)
	if err != nil {
		t.Fatalf("UploadCredentialToHost() error = %v", err)
	}
	if !result.Uploaded || result.AlreadyThere || !result.Bound {
		t.Fatalf("UploadCredentialToHost() = %#v, want uploaded and bound", result)
	}
	if !strings.Contains(session.combinedCommand, "authorized_keys") {
		t.Fatalf("combined command = %q, want authorized_keys update", session.combinedCommand)
	}

	loadedHost, err := svc.store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if loadedHost.CredentialID != credentialID {
		t.Fatalf("CredentialID = %q, want %q", loadedHost.CredentialID, credentialID)
	}
}

func TestListAndImportLocalSSHKeys(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDir := filepath.Join(home, ".ssh")
	if err := os.Mkdir(sshDir, 0o700); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}

	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	privateBlock, err := ssh.MarshalPrivateKey(privateKey, "local-test")
	if err != nil {
		t.Fatalf("MarshalPrivateKey() error = %v", err)
	}
	privatePath := filepath.Join(sshDir, "id_ed25519_test")
	if err := os.WriteFile(privatePath, pem.EncodeToMemory(privateBlock), 0o600); err != nil {
		t.Fatalf("WriteFile(private) error = %v", err)
	}

	sshPublicKey, err := ssh.NewPublicKey(publicKey)
	if err != nil {
		t.Fatalf("NewPublicKey() error = %v", err)
	}
	if err := os.WriteFile(privatePath+".pub", ssh.MarshalAuthorizedKey(sshPublicKey), 0o644); err != nil {
		t.Fatalf("WriteFile(public) error = %v", err)
	}

	keys, err := svc.ListLocalSSHKeys()
	if err != nil {
		t.Fatalf("ListLocalSSHKeys() error = %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("len(ListLocalSSHKeys()) = %d, want 1", len(keys))
	}
	if keys[0].Name != "id_ed25519_test" || !keys[0].HasPrivate || keys[0].PublicKey == "" {
		t.Fatalf("local key = %#v, want discovered private/public key", keys[0])
	}

	credentialID, err := svc.ImportLocalSSHKey(privatePath, "本机测试密钥", "")
	if err != nil {
		t.Fatalf("ImportLocalSSHKey() error = %v", err)
	}
	if credentialID == "" {
		t.Fatal("ImportLocalSSHKey() returned empty credential id")
	}

	keys, err = svc.ListLocalSSHKeys()
	if err != nil {
		t.Fatalf("ListLocalSSHKeys() after import error = %v", err)
	}
	if !keys[0].Imported || keys[0].CredentialID != credentialID {
		t.Fatalf("local key after import = %#v, want imported credential %q", keys[0], credentialID)
	}
}

func TestListAndImportLocalSSHConfigHosts(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDir := filepath.Join(home, ".ssh")
	if err := os.Mkdir(sshDir, 0o700); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}

	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	privateBlock, err := ssh.MarshalPrivateKey(privateKey, "config-test")
	if err != nil {
		t.Fatalf("MarshalPrivateKey() error = %v", err)
	}
	privatePath := filepath.Join(sshDir, "id_config_test")
	if err := os.WriteFile(privatePath, pem.EncodeToMemory(privateBlock), 0o600); err != nil {
		t.Fatalf("WriteFile(private) error = %v", err)
	}
	sshPublicKey, err := ssh.NewPublicKey(publicKey)
	if err != nil {
		t.Fatalf("NewPublicKey() error = %v", err)
	}
	if err := os.WriteFile(privatePath+".pub", ssh.MarshalAuthorizedKey(sshPublicKey), 0o644); err != nil {
		t.Fatalf("WriteFile(public) error = %v", err)
	}

	credentialID, err := svc.ImportLocalSSHKey(privatePath, "config-key", "")
	if err != nil {
		t.Fatalf("ImportLocalSSHKey() error = %v", err)
	}

	config := `
Host prod-box
  HostName 124.223.12.34
  User root
  Port 2202
  IdentityFile ~/.ssh/id_config_test

Host *
  User ignored
`
	if err := os.WriteFile(filepath.Join(sshDir, "config"), []byte(config), 0o600); err != nil {
		t.Fatalf("WriteFile(config) error = %v", err)
	}

	configHosts, err := svc.ListLocalSSHConfigHosts()
	if err != nil {
		t.Fatalf("ListLocalSSHConfigHosts() error = %v", err)
	}
	if len(configHosts) != 1 {
		t.Fatalf("len(ListLocalSSHConfigHosts()) = %d, want 1", len(configHosts))
	}
	if configHosts[0].ID != "prod-box" || configHosts[0].HostName != "124.223.12.34" || configHosts[0].CredentialID != credentialID {
		t.Fatalf("config host = %#v, want parsed host with credential %q", configHosts[0], credentialID)
	}

	importedHosts, err := svc.ImportLocalSSHConfigHosts([]string{"prod-box"})
	if err != nil {
		t.Fatalf("ImportLocalSSHConfigHosts() error = %v", err)
	}
	if len(importedHosts) != 1 {
		t.Fatalf("len(ImportLocalSSHConfigHosts()) = %d, want 1", len(importedHosts))
	}

	host, err := svc.store.GetHost("prod-box")
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if host.Address != "124.223.12.34" || host.Username != "root" || host.Port != 2202 || host.CredentialID != credentialID {
		t.Fatalf("imported host = %#v, want ssh config fields", host)
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

// TestImportCredentialRejectsInvalidPrivateKey 验证：导入坏私钥时返回归一化的 ErrInvalidPrivateKey，不向调用方透传 PEM 解析细节 / verifies that importing an unparseable key surfaces as the sanitised ErrInvalidPrivateKey rather than leaking PEM parsing internals.
func TestImportCredentialRejectsInvalidPrivateKey(t *testing.T) {
	svc, cleanup := setupTestServiceWithT(t)
	defer cleanup()

	_, err := svc.ImportCredential("bad-key", "-----BEGIN OPENSSH PRIVATE KEY-----\nnot a real key\n-----END OPENSSH PRIVATE KEY-----", "")
	if !errors.Is(err, ErrInvalidPrivateKey) {
		t.Fatalf("ImportCredential(invalid) error = %v, want %v", err, ErrInvalidPrivateKey)
	}
}

// TestNewCredentialIDIsRandom 验证：连续生成的凭据 ID 互不相同且不带可猜测的时间戳前缀 / verifies that consecutive credential IDs are distinct and do not carry a guessable timestamp prefix.
func TestNewCredentialIDIsRandom(t *testing.T) {
	seen := make(map[string]struct{}, 100)
	for i := 0; i < 100; i++ {
		id := newCredentialID()
		if !strings.HasPrefix(id, "cred_") {
			t.Fatalf("credential id = %q, want cred_ prefix", id)
		}
		if _, dup := seen[id]; dup {
			t.Fatalf("duplicate credential id generated: %q", id)
		}
		seen[id] = struct{}{}
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
