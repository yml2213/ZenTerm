package service

import (
	"zenterm/internal/model"
)

// GetUpdateConfig 获取更新配置
func (s *Service) GetUpdateConfig() (model.UpdateConfig, error) {
	return s.store.GetUpdateConfig()
}

// SaveUpdateConfig 保存更新配置
func (s *Service) SaveUpdateConfig(config model.UpdateConfig) error {
	return s.store.SaveUpdateConfig(config)
}
