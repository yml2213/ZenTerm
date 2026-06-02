package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"zenterm/internal/syncer"

	keyring "github.com/zalando/go-keyring"
)

const (
	keyringWebDAVSyncUser = "sync-webdav-password"
	syncOperationTimeout  = 45 * time.Second
)

type WebDAVSyncConfig struct {
	URL        string `json:"url"`
	Username   string `json:"username"`
	RemotePath string `json:"remote_path,omitempty"`
	DeviceName string `json:"device_name,omitempty"`
	Password   string `json:"password,omitempty"`
}

// ConfigureWebDAVSync 保存 WebDAV 同步配置，密码写入系统钥匙串 / saves WebDAV sync settings and stores the password in the system keychain.
func (a *App) ConfigureWebDAVSync(config WebDAVSyncConfig) (syncer.Status, error) {
	if strings.TrimSpace(config.Password) != "" {
		if err := saveWebDAVSyncPassword(config.Password); err != nil {
			return syncer.Status{}, normalizeFrontendError(err)
		}
	}

	status, err := a.syncManager().ConfigureWebDAV(syncer.WebDAVConfig{
		URL:        config.URL,
		Username:   config.Username,
		RemotePath: config.RemotePath,
	}, config.DeviceName)
	if err != nil {
		return syncer.Status{}, normalizeFrontendError(err)
	}
	return status, nil
}

// GetWebDAVSyncStatus 返回当前 WebDAV 同步状态 / returns current WebDAV sync status.
func (a *App) GetWebDAVSyncStatus() (syncer.Status, error) {
	status, err := a.syncManager().Status()
	if err != nil {
		return syncer.Status{}, normalizeFrontendError(err)
	}
	return status, nil
}

// TestWebDAVSync 测试当前 WebDAV 配置与远端路径 / tests current WebDAV settings and remote path.
func (a *App) TestWebDAVSync(config WebDAVSyncConfig) (syncer.TestResult, error) {
	password := strings.TrimSpace(config.Password)
	if password == "" {
		savedPassword, err := loadWebDAVSyncPassword()
		if err != nil {
			return syncer.TestResult{}, normalizeFrontendError(err)
		}
		password = savedPassword
	}

	ctx, cancel := context.WithTimeout(context.Background(), syncOperationTimeout)
	defer cancel()

	provider, err := syncer.NewWebDAVProvider(syncer.WebDAVConfig{
		URL:        config.URL,
		Username:   config.Username,
		RemotePath: config.RemotePath,
	}, password)
	if err != nil {
		return syncer.TestResult{}, normalizeFrontendError(err)
	}

	result, err := provider.Test(ctx, config.RemotePath)
	if err != nil {
		return syncer.TestResult{}, normalizeFrontendError(err)
	}
	return result, nil
}

// PushWebDAVSync 将本机同步快照上传到 WebDAV；overwrite 为 false 时会做 ETag 冲突保护。
// PushWebDAVSync uploads the local sync snapshot to WebDAV with ETag conflict protection unless overwrite is true.
func (a *App) PushWebDAVSync(overwrite bool) (syncer.Result, error) {
	manager := a.syncManager()
	state, err := manager.Load()
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}
	if !state.Status().Configured {
		return syncer.Result{}, syncer.ErrSyncNotConfigured
	}

	password, err := loadWebDAVSyncPassword()
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), syncOperationTimeout)
	defer cancel()

	provider, err := syncer.NewWebDAVProvider(state.WebDAV, password)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}
	remoteMeta, err := provider.Stat(ctx, state.WebDAV.RemotePath)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}
	if remoteMeta.Exists && !overwrite && state.LastRemoteETag != "" && remoteMeta.ETag != "" && remoteMeta.ETag != state.LastRemoteETag {
		return syncer.Result{Direction: "push", Conflict: true, RemoteETag: remoteMeta.ETag, Message: "远端同步文件已变化，请先拉取或选择覆盖。"}, syncer.ErrSyncConflict
	}
	if remoteMeta.Exists && !overwrite && state.LastRemoteETag == "" {
		return syncer.Result{Direction: "push", Conflict: true, RemoteETag: remoteMeta.ETag, Message: "远端已存在同步文件，请先拉取或选择覆盖。"}, syncer.ErrSyncConflict
	}

	payload, snapshotHash, err := a.service.BuildEncryptedSyncSnapshot(state.DeviceID, state.DeviceName, false)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	ifMatch := ""
	if remoteMeta.Exists && !overwrite {
		ifMatch = state.LastRemoteETag
	}
	nextMeta, err := provider.Put(ctx, state.WebDAV.RemotePath, payload, ifMatch)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	now := time.Now().UTC()
	state.LastRemoteETag = nextMeta.ETag
	state.LastSnapshotHash = snapshotHash
	state.LastSyncAt = now
	state.UpdatedAt = now
	if err := manager.Save(state); err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	return syncer.Result{
		Direction:  "push",
		RemoteETag: nextMeta.ETag,
		Bytes:      len(payload),
		Message:    "本机快照已上传到 WebDAV。",
		SyncedAt:   now.Format(time.RFC3339),
	}, nil
}

// PullWebDAVSync 从 WebDAV 拉取并导入同步快照；需要主密码解密远端包。
// PullWebDAVSync downloads and imports a WebDAV snapshot; masterPassword decrypts the remote envelope.
func (a *App) PullWebDAVSync(masterPassword string, overwrite bool) (syncer.Result, error) {
	manager := a.syncManager()
	state, err := manager.Load()
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}
	if !state.Status().Configured {
		return syncer.Result{}, syncer.ErrSyncNotConfigured
	}

	password, err := loadWebDAVSyncPassword()
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), syncOperationTimeout)
	defer cancel()

	provider, err := syncer.NewWebDAVProvider(state.WebDAV, password)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}
	payload, remoteMeta, err := provider.Get(ctx, state.WebDAV.RemotePath)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	if !overwrite && state.LastSnapshotHash != "" && remoteMeta.ETag != "" && remoteMeta.ETag != state.LastRemoteETag {
		currentHash, hashErr := a.service.CurrentSyncSnapshotHash(false)
		if hashErr == nil && currentHash != state.LastSnapshotHash {
			return syncer.Result{Direction: "pull", Conflict: true, RemoteETag: remoteMeta.ETag, Message: "本机和远端都有未同步改动，请选择覆盖后再拉取。"}, syncer.ErrSyncConflict
		}
	}

	if _, err := backupStoreBeforeSyncPull(a.store.Path(), time.Now().UTC()); err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	remoteDeviceID, remoteDeviceName, snapshotHash, err := a.service.ApplyEncryptedSyncSnapshot(masterPassword, payload)
	if err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	now := time.Now().UTC()
	state.LastRemoteETag = remoteMeta.ETag
	state.LastSnapshotHash = snapshotHash
	state.LastSyncAt = now
	state.UpdatedAt = now
	if err := manager.Save(state); err != nil {
		return syncer.Result{}, normalizeFrontendError(err)
	}

	return syncer.Result{
		Direction:  "pull",
		RemoteETag: remoteMeta.ETag,
		Bytes:      len(payload),
		Message:    fmt.Sprintf("已拉取来自设备 %s 的同步快照。", syncDeviceLabel(remoteDeviceID, remoteDeviceName)),
		SyncedAt:   now.Format(time.RFC3339),
	}, nil
}

func syncDeviceLabel(deviceID, deviceName string) string {
	deviceName = strings.TrimSpace(deviceName)
	if deviceName != "" {
		return deviceName
	}
	return strings.TrimSpace(deviceID)
}

func (a *App) syncManager() *syncer.Manager {
	return syncer.NewManager(filepath.Dir(a.store.Path()))
}

func saveWebDAVSyncPassword(password string) error {
	if err := keyring.Set(keyringServiceName, keyringWebDAVSyncUser, password); errors.Is(err, keyring.ErrUnsupportedPlatform) {
		return nil
	} else {
		return err
	}
}

func loadWebDAVSyncPassword() (string, error) {
	password, err := keyring.Get(keyringServiceName, keyringWebDAVSyncUser)
	switch {
	case err == nil && password != "":
		return password, nil
	case err == nil:
		return "", errors.New("webdav password is empty")
	case errors.Is(err, keyring.ErrNotFound):
		return "", errors.New("webdav password is not saved")
	case errors.Is(err, keyring.ErrUnsupportedPlatform):
		return "", errors.New("当前平台暂不支持系统钥匙串保存 WebDAV 密码")
	default:
		return "", err
	}
}

func backupStoreBeforeSyncPull(storePath string, now time.Time) (string, error) {
	if strings.TrimSpace(storePath) == "" {
		return "", nil
	}

	payload, err := os.ReadFile(storePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", fmt.Errorf("read store before sync backup: %w", err)
	}

	backupDir := filepath.Join(filepath.Dir(storePath), "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		return "", fmt.Errorf("create sync backup directory: %w", err)
	}

	backupPath := filepath.Join(backupDir, fmt.Sprintf("config-%s.zen", now.UTC().Format("20060102-150405.000000000")))
	if err := os.WriteFile(backupPath, payload, 0o600); err != nil {
		return "", fmt.Errorf("write sync backup: %w", err)
	}

	return backupPath, nil
}
