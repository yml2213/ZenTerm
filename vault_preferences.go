package main

import (
	"errors"

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
