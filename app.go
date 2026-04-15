package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
	"zenterm/internal/service"
)

// App 是挂载到 Wails 的应用结构体，负责为前端暴露后端方法 / is the Wails-bound application struct that exposes backend methods to the frontend.
type App struct {
	service service.ZenService
}

// NewApp 使用默认依赖构建一个可绑定到 Wails 的 App / constructs an App with default dependencies that can be bound to Wails.
func NewApp(storePath string) (*App, error) {
	store, err := db.NewStore(storePath)
	if err != nil {
		return nil, normalizeFrontendError(err)
	}

	svc, err := service.New(store, security.NewVault())
	if err != nil {
		return nil, normalizeFrontendError(err)
	}

	return &App{service: svc}, nil
}

// NewDefaultApp 使用默认数据文件路径创建 App，默认文件名为 config.zen / creates an App using the default data file path with the default filename config.zen.
func NewDefaultApp() (*App, error) {
	storePath, err := DefaultStorePath()
	if err != nil {
		return nil, err
	}

	return NewApp(storePath)
}

// DefaultStorePath 返回默认的本地存储路径 / returns the default local storage path.
func DefaultStorePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config dir: %w", err)
	}

	return filepath.Join(configDir, "ZenTerm", "config.zen"), nil
}

// Unlock 接收前端输入的主密码并解锁 Vault / receives the master password from the frontend and unlocks the vault.
func (a *App) Unlock(password string) error {
	if err := a.service.UnlockVault(password); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// AddHost 接收前端表单数据并完成主机与身份信息存储 / receives frontend form data and persists the host plus its identity.
func (a *App) AddHost(host model.Host, identity model.Identity) error {
	if err := a.service.AddHost(host, identity); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// ListHosts 返回列表页所需的主机元数据 / returns the host metadata needed by the frontend list view.
func (a *App) ListHosts() ([]model.Host, error) {
	hosts, err := a.service.GetHosts()
	if err != nil {
		return nil, normalizeFrontendError(err)
	}

	return hosts, nil
}

func normalizeFrontendError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, security.ErrVaultLocked):
		return security.ErrVaultLocked
	case errors.Is(err, security.ErrEmptyPassword):
		return security.ErrEmptyPassword
	case errors.Is(err, security.ErrInvalidSalt):
		return security.ErrInvalidSalt
	case errors.Is(err, security.ErrInvalidKeyLength):
		return security.ErrInvalidKeyLength
	case errors.Is(err, db.ErrHostIDRequired):
		return db.ErrHostIDRequired
	case errors.Is(err, db.ErrHostNotFound):
		return db.ErrHostNotFound
	case errors.Is(err, db.ErrStorePathEmpty):
		return db.ErrStorePathEmpty
	case errors.Is(err, service.ErrNilDependency):
		return service.ErrNilDependency
	default:
		return err
	}
}
