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

// DeleteCredential 删除指定凭据 / deletes a specific credential.
func (a *App) DeleteCredential(credentialID string) error {
	err := a.service.DeleteCredential(credentialID)
	if err != nil {
		return normalizeFrontendError(err)
	}
	return nil
}
