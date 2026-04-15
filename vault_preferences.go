package main

import (
	"errors"
	stdruntime "runtime"

	"zenterm/internal/model"

	keyring "github.com/zalando/go-keyring"
)

const (
	keyringServiceName = "ZenTerm"
	keyringVaultUser   = "vault-master-password"
)

// vaultCredentialStore 负责保存用于自动解锁的主密码 / stores the master password used for auto unlock.
type vaultCredentialStore interface {
	Load() (string, bool, error)
	Save(password string) error
	Delete() error
	Status() model.KeychainStatus
}

type systemVaultCredentialStore struct {
	service string
	user    string
}

func newSystemVaultCredentialStore() vaultCredentialStore {
	return systemVaultCredentialStore{
		service: keyringServiceName,
		user:    keyringVaultUser,
	}
}

func (s systemVaultCredentialStore) Load() (string, bool, error) {
	password, err := keyring.Get(s.service, s.user)
	switch {
	case err == nil:
		return password, true, nil
	case errors.Is(err, keyring.ErrNotFound), errors.Is(err, keyring.ErrUnsupportedPlatform):
		return "", false, nil
	default:
		return "", false, err
	}
}

func (s systemVaultCredentialStore) Save(password string) error {
	if err := keyring.Set(s.service, s.user, password); errors.Is(err, keyring.ErrUnsupportedPlatform) {
		return nil
	} else {
		return err
	}
}

func (s systemVaultCredentialStore) Delete() error {
	if err := keyring.Delete(s.service, s.user); errors.Is(err, keyring.ErrNotFound) || errors.Is(err, keyring.ErrUnsupportedPlatform) {
		return nil
	} else {
		return err
	}
}

func (s systemVaultCredentialStore) Status() model.KeychainStatus {
	status := model.KeychainStatus{
		Provider: keychainProviderName(),
	}

	_, err := keyring.Get(s.service, s.user)
	switch {
	case err == nil:
		status.Supported = true
		status.Saved = true
		status.Message = "系统钥匙串可用，且已经保存主密码。"
	case errors.Is(err, keyring.ErrNotFound):
		status.Supported = true
		status.Saved = false
		status.Message = "系统钥匙串可用，但当前还没有保存主密码。"
	case errors.Is(err, keyring.ErrUnsupportedPlatform):
		status.Supported = false
		status.Saved = false
		status.Message = "当前平台暂不支持系统钥匙串集成。"
	default:
		status.Supported = false
		status.Saved = false
		status.Message = "系统钥匙串当前不可用，请在设置好桌面凭据服务后重试。"
	}

	return status
}

func keychainProviderName() string {
	switch stdruntime.GOOS {
	case "darwin":
		return "macOS 钥匙串"
	case "windows":
		return "Windows Credential Manager"
	case "linux":
		return "Secret Service / KWallet"
	default:
		return "系统凭据存储"
	}
}
