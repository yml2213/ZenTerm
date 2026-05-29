package main

import "zenterm/internal/model"

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
func (a *App) GetCredentials() ([]Credential, error) {
	creds, err := a.service.GetCredentials()
	if err != nil {
		return nil, normalizeFrontendError(err)
	}
	return credentialsFromModel(creds), nil
}

// GetCredential 返回指定凭据的详细信息 / returns detailed information for a specific credential.
func (a *App) GetCredential(credentialID string) (Credential, error) {
	cred, err := a.service.GetCredential(credentialID)
	if err != nil {
		return Credential{}, normalizeFrontendError(err)
	}
	return credentialFromModel(cred), nil
}

// GetCredentialUsage 获取凭据的使用情况 / gets usage information for a credential.
func (a *App) GetCredentialUsage(credentialID string) (model.CredentialUsage, error) {
	usage, err := a.service.GetCredentialUsage(credentialID)
	if err != nil {
		return model.CredentialUsage{}, normalizeFrontendError(err)
	}
	return usage, nil
}

// GetCredentialPublicKey 返回指定凭据的公钥 / returns the public key for a credential.
func (a *App) GetCredentialPublicKey(credentialID string) (string, error) {
	publicKey, err := a.service.GetCredentialPublicKey(credentialID)
	if err != nil {
		return "", normalizeFrontendError(err)
	}
	return publicKey, nil
}

// ListLocalSSHKeys 扫描本机 ~/.ssh 密钥 / scans local ~/.ssh keys.
func (a *App) ListLocalSSHKeys() ([]model.LocalSSHKey, error) {
	keys, err := a.service.ListLocalSSHKeys()
	if err != nil {
		return nil, normalizeFrontendError(err)
	}
	return keys, nil
}

// ImportLocalSSHKey 将本机私钥导入保险箱 / imports a local private key into the vault.
func (a *App) ImportLocalSSHKey(path, label, passphrase string) (string, error) {
	id, err := a.service.ImportLocalSSHKey(path, label, passphrase)
	if err != nil {
		return "", normalizeFrontendError(err)
	}
	return id, nil
}

// ListLocalSSHConfigHosts 读取本机 SSH config 主机 / reads local SSH config hosts.
func (a *App) ListLocalSSHConfigHosts() ([]model.LocalSSHConfigHost, error) {
	hosts, err := a.service.ListLocalSSHConfigHosts()
	if err != nil {
		return nil, normalizeFrontendError(err)
	}
	return hosts, nil
}

// ImportLocalSSHConfigHosts 批量导入本机 SSH config 主机 / imports local SSH config hosts.
func (a *App) ImportLocalSSHConfigHosts(ids []string) ([]Host, error) {
	hosts, err := a.service.ImportLocalSSHConfigHosts(ids)
	if err != nil {
		return nil, normalizeFrontendError(err)
	}
	return hostsFromModel(hosts), nil
}

// UploadCredentialToHost 将凭据公钥上传到主机 / uploads a credential public key to a host.
func (a *App) UploadCredentialToHost(hostID, credentialID string, bind bool) (model.CredentialUploadResult, error) {
	result, err := a.service.UploadCredentialToHost(hostID, credentialID, bind)
	if err != nil {
		return model.CredentialUploadResult{}, normalizeFrontendError(err)
	}
	return result, nil
}

// BindCredentialToHost 将主机绑定到指定凭据 / binds a host to a credential.
func (a *App) BindCredentialToHost(hostID, credentialID string) error {
	if err := a.service.BindCredentialToHost(hostID, credentialID); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// TestCredentialForHost 用指定凭据测试主机认证 / tests host authentication with a credential.
func (a *App) TestCredentialForHost(hostID, credentialID string) error {
	if err := a.service.TestCredentialForHost(hostID, credentialID); err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}

// DeleteCredential 删除指定凭据 / deletes a specific credential.
func (a *App) DeleteCredential(credentialID string) error {
	err := a.service.DeleteCredential(credentialID)
	if err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}
