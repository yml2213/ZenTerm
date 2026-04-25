package service

import (
	"zenterm/internal/model"
)

// GetHosts 返回供 UI 使用的非敏感主机元数据 / returns non-sensitive host metadata for the UI.
func (s *Service) GetHosts() ([]model.Host, error) {
	return s.store.GetHosts()
}

// AddHost 使用已解锁的 Vault 加密并持久化主机身份信息 / encrypts and persists a host identity using the unlocked vault.
func (s *Service) AddHost(host model.Host, identity model.Identity) error {
	return s.store.AddHost(host, identity, s.vault)
}

// UpdateHost 更新主机元数据，并在未提供新凭据时保留原有身份信息 / updates a host while preserving existing credentials when the frontend leaves them blank.
func (s *Service) UpdateHost(host model.Host, identity model.Identity) error {
	existingHost, err := s.store.GetHost(host.ID)
	if err != nil {
		return err
	}

	existingIdentity, err := s.store.GetIdentity(host.ID, s.vault)
	if err != nil {
		return err
	}

	if identity.Password == "" {
		identity.Password = existingIdentity.Password
	}
	if identity.PrivateKey == "" {
		identity.PrivateKey = existingIdentity.PrivateKey
	}
	if host.KnownHosts == "" {
		host.KnownHosts = existingHost.KnownHosts
	}
	if host.LastConnectedAt.IsZero() {
		host.LastConnectedAt = existingHost.LastConnectedAt
	}
	if host.SystemTypeSource == "" {
		host.SystemTypeSource = existingHost.SystemTypeSource
	}

	if err := s.store.AddHost(host, identity, s.vault); err != nil {
		return err
	}

	return s.closeSFTPConnection(host.ID)
}

// DeleteHost 删除主机；如果仍有活跃会话则拒绝删除 / deletes the host unless there are active sessions still attached to it.
func (s *Service) DeleteHost(hostID string) error {
	if s.hasActiveSessionForHost(hostID) {
		return ErrHostHasActiveSession
	}

	if err := s.store.DeleteHost(hostID); err != nil {
		return err
	}

	return s.closeSFTPConnection(hostID)
}
