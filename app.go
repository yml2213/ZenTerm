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
	ctx         context.Context
	store       *db.Store
	service     *service.Service
	credentials vaultCredentialStore
}

// NewApp 使用默认依赖构建一个可绑定到 Wails 的 App / constructs an App with default dependencies that can be bound to Wails.
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

// AddHost 接收前端表单数据并完成主机与身份信息存储 / receives frontend form data and persists the host plus its identity.
func (a *App) AddHost(host model.Host, identity model.Identity) error {
	if err := a.service.AddHost(host, identity); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// UpdateHost 更新已存在主机的非敏感元数据，并按需保留现有凭据 / updates an existing host and preserves credentials when no replacement is provided.
func (a *App) UpdateHost(host model.Host, identity model.Identity) error {
	if err := a.service.UpdateHost(host, identity); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// DeleteHost 删除指定主机 / deletes the requested host.
func (a *App) DeleteHost(hostID string) error {
	if err := a.service.DeleteHost(hostID); err != nil {
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

// AcceptHostKey 接受待确认的主机指纹并继续连接 / accepts a pending host fingerprint and resumes the SSH connection.
func (a *App) AcceptHostKey(hostID, key string) error {
	if err := a.service.AcceptHostKey(hostID, key); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// RejectHostKey 拒绝待确认的主机指纹并中止连接 / rejects a pending host fingerprint and aborts the SSH connection.
func (a *App) RejectHostKey(hostID string) error {
	if err := a.service.RejectHostKey(hostID); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
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

// ListLocalFiles 返回本机目录内容 / returns the local directory contents.
func (a *App) ListLocalFiles(path string) (model.FileListing, error) {
	listing, err := a.service.ListLocalFiles(path)
	if err != nil {
		return model.FileListing{}, normalizeFrontendError(err)
	}

	return listing, nil
}

// ListRemoteFiles 返回指定主机的远端目录内容 / returns the remote directory contents for the selected host.
func (a *App) ListRemoteFiles(hostID, path string) (model.FileListing, error) {
	listing, err := a.service.ListRemoteFiles(hostID, path)
	if err != nil {
		return model.FileListing{}, normalizeFrontendError(err)
	}

	return listing, nil
}

// UploadFile 将本地文件上传到远端目录 / uploads a local file into the selected remote directory.
func (a *App) UploadFile(hostID, localPath, remoteDir string) (model.FileTransferResult, error) {
	result, err := a.service.UploadFile(hostID, localPath, remoteDir)
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}

	return result, nil
}

// DownloadFile 将远端文件下载到本地目录 / downloads a remote file into the selected local directory.
func (a *App) DownloadFile(hostID, remotePath, localDir string) (model.FileTransferResult, error) {
	result, err := a.service.DownloadFile(hostID, remotePath, localDir)
	if err != nil {
		return model.FileTransferResult{}, normalizeFrontendError(err)
	}

	return result, nil
}

// ListSessions 返回当前活跃 SSH 会话列表 / returns the current active SSH sessions.
func (a *App) ListSessions() []service.Session {
	return a.service.ListSessions()
}

// GenerateCredential 生成新的 SSH 密钥凭据 / generates a new SSH key credential.
func (a *App) GenerateCredential(label, algorithm string, keyBits int, passphrase string) (string, error) {
	id, err := a.service.GenerateCredential(label, algorithm, keyBits, passphrase)
	if err != nil {
		return "", normalizeFrontendError(err)
	}
	return id, nil
}

// ImportCredential 导入现有的 SSH 密钥凭据 / imports an existing SSH key credential.
func (a *App) ImportCredential(label, privateKeyPEM, passphrase string) (string, error) {
	id, err := a.service.ImportCredential(label, privateKeyPEM, passphrase)
	if err != nil {
		return "", normalizeFrontendError(err)
	}
	return id, nil
}

// GetCredentials 返回所有凭据的元数据 / returns all credential metadata.
func (a *App) GetCredentials() ([]model.Credential, error) {
	creds, err := a.service.GetCredentials()
	if err != nil {
		return nil, normalizeFrontendError(err)
	}
	return creds, nil
}

// GetCredential 返回指定凭据的详细信息 / returns detailed information for a specific credential.
func (a *App) GetCredential(credentialID string) (model.Credential, error) {
	cred, err := a.service.GetCredential(credentialID)
	if err != nil {
		return model.Credential{}, normalizeFrontendError(err)
	}
	return cred, nil
}

// GetCredentialUsage 获取凭据的使用情况 / gets usage information for a credential.
func (a *App) GetCredentialUsage(credentialID string) (model.CredentialUsage, error) {
	usage, err := a.service.GetCredentialUsage(credentialID)
	if err != nil {
		return model.CredentialUsage{}, normalizeFrontendError(err)
	}
	return usage, nil
}

// DeleteCredential 删除指定凭据 / deletes a specific credential.
func (a *App) DeleteCredential(credentialID string) error {
	err := a.service.DeleteCredential(credentialID)
	if err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) beforeClose(context.Context) bool {
	a.persistWindowState()
	return false
}

func (a *App) shutdown(context.Context) {
	a.persistWindowState()
	_ = a.service.CloseAll()
}

// PersistWindowState 主动持久化当前窗口尺寸，供前端在窗口变化后触发保存 / persists the current window metrics on demand for frontend-triggered saves.
func (a *App) PersistWindowState() {
	a.persistWindowState()
}

func (a *App) persistWindowState() {
	if a.ctx == nil || a.store == nil {
		return
	}

	width, height := runtime.WindowGetSize(a.ctx)
	state := model.WindowState{
		Width:     width,
		Height:    height,
		Maximised: runtime.WindowIsMaximised(a.ctx),
	}

	if err := a.store.SaveWindowState(state); err != nil {
		runtime.LogWarning(a.ctx, fmt.Sprintf("save window state: %v", err))
	}
}

func normalizeFrontendError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, security.ErrVaultLocked):
		return security.ErrVaultLocked
	case errors.Is(err, security.ErrEmptyPassword):
		return security.ErrEmptyPassword
	case errors.Is(err, security.ErrInvalidMasterPassword):
		return security.ErrInvalidMasterPassword
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
	case errors.Is(err, service.ErrHostHasActiveSession):
		return service.ErrHostHasActiveSession
	case errors.Is(err, service.ErrVaultAlreadyInitialized):
		return service.ErrVaultAlreadyInitialized
	case errors.Is(err, service.ErrVaultNotInitialized):
		return service.ErrVaultNotInitialized
	case errors.Is(err, service.ErrHostKeyRejected):
		return service.ErrHostKeyRejected
	case errors.Is(err, service.ErrHostKeyConfirmationPending):
		return service.ErrHostKeyConfirmationPending
	case errors.Is(err, service.ErrHostKeyConfirmationNotFound):
		return service.ErrHostKeyConfirmationNotFound
	case errors.Is(err, service.ErrHostKeyMismatch):
		return service.ErrHostKeyMismatch
	case errors.Is(err, service.ErrHostKeyConfirmationTimeout):
		return service.ErrHostKeyConfirmationTimeout
	case errors.Is(err, service.ErrTransferSourceRequired):
		return service.ErrTransferSourceRequired
	case errors.Is(err, service.ErrTransferTargetRequired):
		return service.ErrTransferTargetRequired
	case errors.Is(err, service.ErrTransferSourceNotFile):
		return service.ErrTransferSourceNotFile
	case errors.Is(err, service.ErrTransferTargetNotDirectory):
		return service.ErrTransferTargetNotDirectory
	case errors.Is(err, service.ErrTransferTargetExists):
		return service.ErrTransferTargetExists
	default:
		return err
	}
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

func (a *App) emitEvent(event string, payload any) {
	if a.ctx == nil {
		return
	}

	runtime.EventsEmit(a.ctx, event, payload)
}
