package main

import (
	"errors"
	"fmt"

	"zenterm/internal/model"
	"zenterm/internal/security"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// GetVaultStatus 返回保险箱是否已初始化以及当前是否已解锁 / returns whether the vault is initialized and whether it is currently unlocked.
func (a *App) GetVaultStatus() (model.VaultStatus, error) {
	status, err := a.service.GetVaultStatus()
	if err != nil {
		return model.VaultStatus{}, normalizeFrontendError(err)
	}

	return status, nil
}

// GetKeychainStatus 返回当前系统钥匙串的可用状态与保存情况 / returns the current system keychain availability and saved-password status.
func (a *App) GetKeychainStatus() (model.KeychainStatus, error) {
	return a.credentials.Status(), nil
}

// InitializeVaultWithPreferences 首次设置主密码，并按需写入系统钥匙串 / initializes the vault and optionally persists the password in the system keychain.
func (a *App) InitializeVaultWithPreferences(password string, remember bool) error {
	if err := a.service.InitializeVault(password); err != nil {
		return normalizeFrontendError(err)
	}

	a.persistVaultCredentialPreference(password, remember)
	return nil
}

// Unlock 接收前端输入的主密码并解锁 Vault / receives the master password from the frontend and unlocks the vault.
func (a *App) Unlock(password string) error {
	return a.UnlockWithPreferences(password, false)
}

// UnlockWithPreferences 解锁保险箱，并按需写入系统钥匙串用于下次自动解锁 / unlocks the vault and optionally persists the password in the system keychain.
func (a *App) UnlockWithPreferences(password string, remember bool) error {
	if err := a.service.UnlockVault(password); err != nil {
		return normalizeFrontendError(err)
	}

	a.persistVaultCredentialPreference(password, remember)

	return nil
}

// ChangeMasterPassword 更新主密码，并按需同步系统钥匙串中的记忆密码 / updates the master password and syncs the remembered password if requested.
func (a *App) ChangeMasterPassword(currentPassword, nextPassword string, remember bool) error {
	if err := a.service.ChangeMasterPassword(currentPassword, nextPassword); err != nil {
		return normalizeFrontendError(err)
	}

	a.persistVaultCredentialPreference(nextPassword, remember)
	return nil
}

// ResetVault 重置整个 Vault，并清除设备上记住的主密码 / resets the whole vault and clears any remembered device password.
func (a *App) ResetVault() error {
	if err := a.service.ResetVault(); err != nil {
		return normalizeFrontendError(err)
	}

	if err := a.credentials.Delete(); err != nil && a.ctx != nil {
		runtime.LogWarning(a.ctx, fmt.Sprintf("clear remembered vault password after reset: %v", err))
	}

	return nil
}

// TryAutoUnlock 尝试使用系统钥匙串中保存的主密码自动解锁 / attempts to auto unlock using the password stored in the system keychain.
func (a *App) TryAutoUnlock() (bool, error) {
	status, err := a.service.GetVaultStatus()
	if err != nil {
		return false, normalizeFrontendError(err)
	}
	if !status.Initialized {
		return false, nil
	}

	password, found, err := a.credentials.Load()
	if err != nil {
		return false, normalizeFrontendError(err)
	}
	if !found || password == "" {
		return false, nil
	}

	if err := a.service.UnlockVault(password); err != nil {
		if errors.Is(err, security.ErrInvalidMasterPassword) {
			_ = a.credentials.Delete()
			return false, nil
		}
		return false, normalizeFrontendError(err)
	}

	return true, nil
}

func (a *App) persistVaultCredentialPreference(password string, remember bool) {
	if remember {
		if err := a.credentials.Save(password); err != nil {
			if a.ctx != nil {
				runtime.LogWarning(a.ctx, fmt.Sprintf("remember vault password: %v", err))
			}
		}
		return
	}

	if err := a.credentials.Delete(); err != nil {
		if a.ctx != nil {
			runtime.LogWarning(a.ctx, fmt.Sprintf("clear remembered vault password: %v", err))
		}
	}
}
