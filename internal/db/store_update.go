package db

import (
	"fmt"

	"zenterm/internal/model"
)

// GetUpdateConfig 获取更新配置
func (s *Store) GetUpdateConfig() (model.UpdateConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.UpdateConfig{}, fmt.Errorf("load store: %w", err)
	}

	// 如果没有配置，返回默认值
	if (data.UpdateConfig == model.UpdateConfig{}) {
		return model.UpdateConfig{
			Enabled:       true,
			CheckInterval: 24,
			Channel:       "stable",
			AutoDownload:  false,
		}, nil
	}

	return data.UpdateConfig, nil
}

// SaveUpdateConfig 保存更新配置
func (s *Store) SaveUpdateConfig(config model.UpdateConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return fmt.Errorf("load store: %w", err)
	}

	data.UpdateConfig = config

	if err := s.saveLocked(data); err != nil {
		return fmt.Errorf("save store: %w", err)
	}

	return nil
}
