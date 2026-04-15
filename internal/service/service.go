package service

import (
	"errors"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"
)

var ErrNilDependency = errors.New("service dependencies cannot be nil")

// ZenService 定义暴露给应用层的后端服务契约 / is the backend contract exposed to the application layer.
type ZenService interface {
	UnlockVault(masterPassword string) error
	GetHosts() ([]model.Host, error)
	AddHost(host model.Host, identity model.Identity) error
}

// Service 负责把 Vault 生命周期与 JSON 存储连接起来 / wires the vault lifecycle to the JSON-backed store.
type Service struct {
	store *db.Store
	vault *security.Vault
}

// New 使用显式依赖创建服务实现 / creates a service implementation with explicit dependencies.
func New(store *db.Store, vault *security.Vault) (*Service, error) {
	if store == nil || vault == nil {
		return nil, ErrNilDependency
	}

	return &Service{
		store: store,
		vault: vault,
	}, nil
}

// UnlockVault 使用存储中的盐值初始化并解锁内存中的 Vault / initializes the in-memory vault from the persisted store salt.
func (s *Service) UnlockVault(masterPassword string) error {
	salt, err := s.store.EnsureSalt()
	if err != nil {
		return err
	}

	return s.vault.Unlock(masterPassword, salt)
}

// GetHosts 返回供 UI 使用的非敏感主机元数据 / returns non-sensitive host metadata for the UI.
func (s *Service) GetHosts() ([]model.Host, error) {
	return s.store.GetHosts()
}

// AddHost 使用已解锁的 Vault 加密并持久化主机身份信息 / encrypts and persists a host identity using the unlocked vault.
func (s *Service) AddHost(host model.Host, identity model.Identity) error {
	return s.store.AddHost(host, identity, s.vault)
}
