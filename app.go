package main

import (
	"context"
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
	ctx         context.Context
	store       *db.Store
	service     *service.Service
	credentials vaultCredentialStore
}

// NewApp 使用默认依赖构建一个可绑定到 Wails 的 App / constructs an App with default dependencies that can be bound to the frontend.
func NewApp(storePath string) (*App, error) {
	return newAppWithCredentialStore(storePath, newSystemVaultCredentialStore())
}

func newAppWithCredentialStore(storePath string, credentials vaultCredentialStore) (*App, error) {
	store, err := db.NewStore(storePath)
	if err != nil {
		return nil, normalizeFrontendError(err)
	}

	svc, err := service.New(store, security.NewVault())
	if err != nil {
		return nil, normalizeFrontendError(err)
	}

	if credentials == nil {
		credentials = newSystemVaultCredentialStore()
	}
	app := &App{
		store:       store,
		service:     svc,
		credentials: credentials,
	}
	svc.SetEventEmitter(app.emitEvent)

	return app, nil
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

// LoadSavedWindowState 读取持久化的窗口状态，供应用启动时恢复尺寸 / loads the persisted window state for startup restoration.
func LoadSavedWindowState(storePath string) (model.WindowState, error) {
	store, err := db.NewStore(storePath)
	if err != nil {
		return model.WindowState{}, normalizeFrontendError(err)
	}

	return store.LoadWindowState()
}
