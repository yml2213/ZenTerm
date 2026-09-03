package cmd

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestWebDAVSyncOperationCanBeCancelled(t *testing.T) {
	app := &App{}
	ctx, finish, err := app.beginWebDAVSyncOperation()
	if err != nil {
		t.Fatalf("beginWebDAVSyncOperation() error = %v", err)
	}

	if _, _, err := app.beginWebDAVSyncOperation(); !errors.Is(err, ErrWebDAVSyncInProgress) {
		t.Fatalf("second beginWebDAVSyncOperation() error = %v, want ErrWebDAVSyncInProgress", err)
	}

	app.CancelWebDAVSync()
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("CancelWebDAVSync() did not cancel the active context")
	}
	finish()

	_, nextFinish, err := app.beginWebDAVSyncOperation()
	if err != nil {
		t.Fatalf("beginWebDAVSyncOperation() after finish error = %v", err)
	}
	nextFinish()
}

func TestConfigureWebDAVSyncPersistsNormalizedStatus(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	status, err := app.ConfigureWebDAVSync(WebDAVSyncConfig{
		URL:        "https://dav.example.test/root",
		Username:   " user ",
		RemotePath: "sync/state.json",
		DeviceName: " Desktop ",
	})
	if err != nil {
		t.Fatalf("ConfigureWebDAVSync() error = %v", err)
	}
	if !status.Configured || status.Username != "user" || status.RemotePath != "/sync/state.json" || status.DeviceName != "Desktop" {
		t.Fatalf("ConfigureWebDAVSync() = %#v", status)
	}

	loaded, err := app.GetWebDAVSyncStatus()
	if err != nil || loaded.URL != status.URL || loaded.DeviceID == "" {
		t.Fatalf("GetWebDAVSyncStatus() = (%#v, %v)", loaded, err)
	}
}
