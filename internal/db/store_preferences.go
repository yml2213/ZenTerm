package db

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"zenterm/internal/model"
)

// GetAppPreferences 读取全局应用偏好 / reads global application preferences.
func (s *Store) GetAppPreferences() (model.AppPreferences, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.AppPreferences{}, fmt.Errorf("load store: %w", err)
	}

	return cloneAppPreferences(data.AppPreferences), nil
}

// SaveAppPreferences 保存全局应用偏好 / saves global application preferences.
func (s *Store) SaveAppPreferences(prefs model.AppPreferences) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return fmt.Errorf("load store: %w", err)
	}

	data.AppPreferences = cloneAppPreferences(prefs)

	if err := s.saveLocked(data); err != nil {
		return fmt.Errorf("save store: %w", err)
	}

	return nil
}

// LoadAppPreferencesFromFile 从 JSON 文件直接读取应用偏好，不需要完整 Store 实例。
// 主要供 main.go 在 wails.Run() 之前使用。
// LoadAppPreferencesFromFile reads app preferences directly from the JSON file
// without requiring a full Store instance. Intended for use in main.go before wails.Run().
func LoadAppPreferencesFromFile(storePath string) model.AppPreferences {
	bytes, err := os.ReadFile(storePath)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return model.AppPreferences{}
		}
		return model.AppPreferences{}
	}

	var data struct {
		AppPreferences model.AppPreferences `json:"app_preferences,omitempty"`
	}
	if err := json.Unmarshal(bytes, &data); err != nil {
		return model.AppPreferences{}
	}

	return data.AppPreferences
}
