package main

import (
	"zenterm/internal/model"
)

// AddHost 接收前端表单数据并完成主机与身份信息存储 / receives frontend form data and persists the host plus its identity.
func (a *App) AddHost(host Host, identity model.Identity) error {
	if err := a.service.AddHost(host.toModel(), identity); err != nil {
		return normalizeFrontendError(err)
	}

	return nil
}

// UpdateHost 更新已存在主机的非敏感元数据，并按需保留现有凭据 / updates an existing host and preserves credentials when no replacement is provided.
func (a *App) UpdateHost(host Host, identity model.Identity) error {
	if err := a.service.UpdateHost(host.toModel(), identity); err != nil {
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
func (a *App) ListHosts() ([]Host, error) {
	hosts, err := a.service.GetHosts()
	if err != nil {
		return nil, normalizeFrontendError(err)
	}

	return hostsFromModel(hosts), nil
}

// ListSessions 返回当前活跃 SSH 会话列表 / returns the current active SSH sessions.
func (a *App) ListSessions() []Session {
	return sessionsFromService(a.service.ListSessions())
}
