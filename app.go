package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
	"zenterm/internal/service"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是挂载到 Wails 的应用结构体，负责为前端暴露后端方法 / is the Wails-bound application struct that exposes backend methods to the frontend.
type App struct {
	ctx     context.Context
	service *service.Service
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

	app := &App{service: svc}
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

// Connect 为前端创建 SSH 会话，并返回可用于后续通信的 sessionID / creates an SSH session for the frontend and returns the sessionID for later communication.
func (a *App) Connect(hostID string) (string, error) {
	sessionID, err := a.service.Connect(hostID)
	if err != nil {
		return "", normalizeFrontendError(err)
	}

	return sessionID, nil
}

// SendInput 将前端按键输入写入对应会话 / writes frontend keystrokes into the target session.
func (a *App) SendInput(sessionID, data string) error {
	if err := a.service.SendInput(sessionID, data); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// ResizeTerminal 根据前端尺寸变化调整远端 PTY / resizes the remote PTY according to the frontend terminal size.
func (a *App) ResizeTerminal(sessionID string, cols, rows int) error {
	if err := a.service.ResizeTerminal(sessionID, cols, rows); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// Disconnect 主动关闭指定会话 / explicitly closes the requested session.
func (a *App) Disconnect(sessionID string) error {
	if err := a.service.Disconnect(sessionID); err != nil {
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

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(context.Context) {
	_ = a.service.CloseAll()
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
	case errors.Is(err, service.ErrNoIdentityAuth):
		return service.ErrNoIdentityAuth
	case errors.Is(err, service.ErrHostAddressRequired):
		return service.ErrHostAddressRequired
	case errors.Is(err, service.ErrHostUsernameRequired):
		return service.ErrHostUsernameRequired
	case errors.Is(err, service.ErrInvalidTerminalSize):
		return service.ErrInvalidTerminalSize
	case errors.Is(err, service.ErrSessionNotFound):
		return service.ErrSessionNotFound
	default:
		return err
	}
}

func (a *App) emitEvent(event string, payload any) {
	if a.ctx == nil {
		return
	}

	runtime.EventsEmit(a.ctx, event, payload)
}
