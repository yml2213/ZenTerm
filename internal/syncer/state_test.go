package syncer

import (
	"context"

	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNewManager(t *testing.T) {
	dir := t.TempDir()
	
	manager := NewManager(dir)
	
	if manager == nil {
		t.Fatal("NewManager() returned nil")
	}
	if manager.dir != dir {
		t.Errorf("dir = %v, want %v", manager.dir, dir)
	}
}

func TestManager_ConfigureWebDAV(t *testing.T) {
	dir := t.TempDir()
	manager := NewManager(dir)
	
	config := WebDAVConfig{
		URL:        "https://dav.example.com",
		Username:   "testuser",
		RemotePath: "/ZenTerm/sync.json",
	}
	
	status, err := manager.ConfigureWebDAV(config, "My Device")
	if err != nil {
		t.Fatalf("ConfigureWebDAV() error = %v", err)
	}
	
	if !status.Configured {
		t.Error("status.Configured should be true")
	}
	if status.URL != config.URL {
		t.Errorf("status.URL = %v, want %v", status.URL, config.URL)
	}
	if status.Username != config.Username {
		t.Errorf("status.Username = %v, want %v", status.Username, config.Username)
	}
	if status.DeviceName != "My Device" {
		t.Errorf("status.DeviceName = %v, want My Device", status.DeviceName)
	}
}

func TestManager_ConfigureWebDAV_EmptyURL(t *testing.T) {
	dir := t.TempDir()
	manager := NewManager(dir)
	
	config := WebDAVConfig{
		URL:        "",
		Username:   "testuser",
		RemotePath: "/ZenTerm/sync.json",
	}
	
	_, err := manager.ConfigureWebDAV(config, "My Device")
	if err == nil {
		t.Fatal("ConfigureWebDAV() should return error for empty URL")
	}
}

func TestManager_ConfigureWebDAV_EmptyUsername(t *testing.T) {
	dir := t.TempDir()
	manager := NewManager(dir)
	
	config := WebDAVConfig{
		URL:        "https://dav.example.com",
		Username:   "",
		RemotePath: "/ZenTerm/sync.json",
	}
	
	_, err := manager.ConfigureWebDAV(config, "My Device")
	if err == nil {
		t.Fatal("ConfigureWebDAV() should return error for empty username")
	}
}

func TestManager_Status(t *testing.T) {
	dir := t.TempDir()
	manager := NewManager(dir)
	
	// 初始状态应该是未配置
	status, err := manager.Status()
	if err != nil {
		t.Fatalf("Status() error = %v", err)
	}
	if status.Configured {
		t.Error("Status().Configured should be false initially")
	}
	
	// 配置后状态应该改变
	config := WebDAVConfig{
		URL:        "https://dav.example.com",
		Username:   "testuser",
		RemotePath: "/ZenTerm/sync.json",
	}
	_, err = manager.ConfigureWebDAV(config, "My Device")
	if err != nil {
		t.Fatalf("ConfigureWebDAV() error = %v", err)
	}
	
	status, err = manager.Status()
	if err != nil {
		t.Fatalf("Status() error = %v", err)
	}
	if !status.Configured {
		t.Error("Status().Configured should be true after configuration")
	}
	if status.URL != config.URL {
		t.Errorf("Status().URL = %v, want %v", status.URL, config.URL)
	}
}

func TestState_Status(t *testing.T) {
	now := time.Now()
	state := State{
		DeviceID:   "device-123",
		DeviceName: "My Device",
		LastSyncAt: now,
		WebDAV: WebDAVConfig{
			URL:        "https://dav.example.com",
			Username:   "testuser",
			RemotePath: "/ZenTerm/sync.json",
		},
	}
	
	status := state.Status()
	if status.DeviceID != "device-123" {
		t.Errorf("DeviceID = %v, want device-123", status.DeviceID)
	}
	if status.DeviceName != "My Device" {
		t.Errorf("DeviceName = %v, want My Device", status.DeviceName)
	}
	if !status.Configured {
		t.Error("Configured should be true")
	}
}

func TestManager_LoadAndSave(t *testing.T) {
	dir := t.TempDir()
	manager := NewManager(dir)
	
	// 保存状态
	state := State{
		Version:    stateVersion,
		DeviceID:   "device-123",
		DeviceName: "Test Device",
		Provider:   "webdav",
		LastSyncAt: time.Now(),
		WebDAV: WebDAVConfig{
			URL:        "https://dav.example.com",
			Username:   "testuser",
			RemotePath: "/ZenTerm/sync.json",
		},
	}
	err := manager.Save(state)
	if err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	
	// 加载状态
	loaded, err := manager.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	
	if loaded.DeviceID != state.DeviceID {
		t.Errorf("DeviceID = %v, want %v", loaded.DeviceID, state.DeviceID)
	}
	if loaded.DeviceName != state.DeviceName {
		t.Errorf("DeviceName = %v, want %v", loaded.DeviceName, state.DeviceName)
	}
	if loaded.WebDAV.URL != state.WebDAV.URL {
		t.Errorf("WebDAV.URL = %v, want %v", loaded.WebDAV.URL, state.WebDAV.URL)
	}
}

func TestManager_LoadNotExist(t *testing.T) {
	dir := t.TempDir()
	manager := NewManager(dir)
	
	// 文件不存在时加载应该返回默认状态
	state, err := manager.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if state.DeviceID == "" {
		t.Error("DeviceID should not be empty")
	}
	if state.Version != stateVersion {
		t.Errorf("Version = %v, want %v", state.Version, stateVersion)
	}
}

func TestStatePath(t *testing.T) {
	manager := &Manager{
		dir: "/test/config",
	}
	
	path := manager.statePath()
	if !strings.HasSuffix(path, "sync-state.json") {
		t.Errorf("statePath() = %v, should end with sync-state.json", path)
	}
	if !strings.Contains(path, "/test/config") {
		t.Errorf("statePath() = %v, should contain /test/config", path)
	}
}

func TestNewDeviceID(t *testing.T) {
	id1 := newDeviceID()
	id2 := newDeviceID()
	
	if id1 == "" {
		t.Error("newDeviceID() returned empty string")
	}
	if id1 == id2 {
		t.Error("newDeviceID() should return different IDs")
	}
	if len(id1) < 8 {
		t.Errorf("newDeviceID() length = %d, want at least 8", len(id1))
	}
}

func TestCleanDeviceName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"MacBook Pro", "MacBook Pro"},
		{"My-Device.local", "My-Device.local"},
		{"server.example.com", "server.example.com"},
		{"test", "test"},
	}
	
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := cleanDeviceName(tt.input)
			if got != tt.want {
				t.Errorf("cleanDeviceName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestDefaultDeviceName(t *testing.T) {
	name := defaultDeviceName()
	
	if name == "" {
		t.Error("defaultDeviceName() returned empty string")
	}
}

func TestFormatTime(t *testing.T) {
	now := time.Now()
	formatted := formatTime(now)
	
	if formatted == "" {
		t.Error("formatTime() returned empty string")
	}
	// 应该是可读的时间格式
	if len(formatted) < 10 {
		t.Errorf("formatTime() = %q, seems too short", formatted)
	}
}

func TestWriteFileAtomic(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "test.json")
	
	data := []byte(`{"test": "data"}`)
	err := writeFileAtomic(filePath, data, 0o600)
	if err != nil {
		t.Fatalf("writeFileAtomic() error = %v", err)
	}
	
	// 验证文件存在且内容正确
	read, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(read) != string(data) {
		t.Errorf("file content = %q, want %q", string(read), string(data))
	}
	
	// 测试覆盖写入
	newData := []byte(`{"updated": "content"}`)
	err = writeFileAtomic(filePath, newData, 0o600)
	if err != nil {
		t.Fatalf("writeFileAtomic() second write error = %v", err)
	}
	
	read, err = os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if string(read) != string(newData) {
		t.Errorf("file content = %q, want %q", string(read), string(newData))
	}
}

func TestWebDAVProvider_Test(t *testing.T) {
	// Test 方法会尝试连接，我们只验证它不 panic
	config := WebDAVConfig{
		URL:        "https://invalid.example.com",
		Username:   "testuser",
		RemotePath: "/test",
	}
	
	provider, err := NewWebDAVProvider(config, "password")
	if err != nil {
		t.Fatalf("NewWebDAVProvider() error = %v", err)
	}
	
	// Test 应该返回错误（因为服务器不存在），但不应该 panic
	_, err = provider.Test(context.Background(), "test-device")
	if err == nil {
		t.Log("Test() succeeded unexpectedly")
	}
	// 主要目的是确保不 panic
}

func TestCleanRemotePath(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"/ZenTerm/sync.json", "/ZenTerm/sync.json"},
		{"ZenTerm/sync.json", "/ZenTerm/sync.json"},
		{"\\ZenTerm\\sync.json", "/ZenTerm/sync.json"},
		{"  /test/path  ", "/test/path"},
		{"", defaultRemotePath},
	}
	
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := cleanRemotePath(tt.input)
			if got != tt.want {
				t.Errorf("cleanRemotePath(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
