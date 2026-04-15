package service

import (
	"zenterm/internal/model"
	"zenterm/internal/security"
)

// GetVaultStatus 返回当前 Vault 的初始化与解锁状态 / returns whether the vault has been initialized and whether it is currently unlocked.
func (s *Service) GetVaultStatus() (model.VaultStatus, error) {
	initialized, err := s.store.IsVaultInitialized()
	if err != nil {
		return model.VaultStatus{}, err
	}

	return model.VaultStatus{
		Initialized: initialized,
		Unlocked:    initialized && s.vault.IsUnlocked(),
	}, nil
}

// InitializeVault 在首次使用时设置主密码并建立校验哨兵 / sets the master password for first-time use and creates the verification sentinel.
func (s *Service) InitializeVault(masterPassword string) error {
	initialized, err := s.store.IsVaultInitialized()
	if err != nil {
		return err
	}
	if initialized {
		return ErrVaultAlreadyInitialized
	}

	salt, err := s.store.EnsureSalt()
	if err != nil {
		return err
	}
	if err := s.vault.Unlock(masterPassword, salt); err != nil {
		return err
	}
	if err := s.store.VerifyOrInitVaultCheck(s.vault); err != nil {
		s.vault.Lock()
		return err
	}

	return nil
}

// UnlockVault 使用已存在的主密码解锁保险箱 / unlocks an already initialized vault with the existing master password.
func (s *Service) UnlockVault(masterPassword string) error {
	initialized, err := s.store.IsVaultInitialized()
	if err != nil {
		return err
	}
	if !initialized {
		return ErrVaultNotInitialized
	}

	salt, err := s.store.EnsureSalt()
	if err != nil {
		return err
	}

	if err := s.vault.Unlock(masterPassword, salt); err != nil {
		return err
	}

	if err := s.store.VerifyOrInitVaultCheck(s.vault); err != nil {
		s.vault.Lock()
		return err
	}

	return nil
}

// ChangeMasterPassword 验证旧密码后，用新密码重新加密全部敏感数据 / verifies the current password and re-encrypts all sensitive data with the new password.
func (s *Service) ChangeMasterPassword(currentPassword, nextPassword string) error {
	initialized, err := s.store.IsVaultInitialized()
	if err != nil {
		return err
	}
	if !initialized {
		return ErrVaultNotInitialized
	}

	currentSalt, err := s.store.EnsureSalt()
	if err != nil {
		return err
	}

	currentVault := security.NewVault()
	if err := currentVault.Unlock(currentPassword, currentSalt); err != nil {
		return err
	}
	if err := s.store.VerifyOrInitVaultCheck(currentVault); err != nil {
		currentVault.Lock()
		return err
	}

	nextSalt, err := security.NewSalt(len(currentSalt))
	if err != nil {
		currentVault.Lock()
		return err
	}

	nextVault := security.NewVault()
	if err := nextVault.Unlock(nextPassword, nextSalt); err != nil {
		currentVault.Lock()
		return err
	}

	if err := s.store.RekeyVault(currentVault, nextVault, nextSalt); err != nil {
		nextVault.Lock()
		currentVault.Lock()
		return err
	}

	currentVault.Lock()
	nextVault.Lock()

	if err := s.vault.Unlock(nextPassword, nextSalt); err != nil {
		s.vault.Lock()
		return err
	}

	return nil
}

// ResetVault 清空所有保存数据并锁定当前 Vault / clears all persisted data and locks the current vault.
func (s *Service) ResetVault() error {
	closeErr := s.CloseAll()
	resetErr := s.store.ResetVault()
	s.vault.Lock()

	if resetErr != nil {
		return resetErr
	}

	return closeErr
}
