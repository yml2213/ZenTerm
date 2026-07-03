package db

import "zenterm/internal/security"

const (
	aadFieldPassword   = "password"
	aadFieldPrivateKey = "privatekey"
)

// hostAAD 构造主机身份字段的上下文 AAD / builds the context AAD for a host identity field.
func hostAAD(hostID, field string) []byte {
	return []byte("zenterm:host:" + hostID + ":" + field)
}

// credentialAAD 构造凭据字段的上下文 AAD / builds the context AAD for a credential field.
func credentialAAD(credentialID, field string) []byte {
	return []byte("zenterm:credential:" + credentialID + ":" + field)
}

// transcriptAAD 构造会话记录的上下文 AAD / builds the context AAD for a session transcript.
func transcriptAAD(logID string) []byte {
	return []byte("zenterm:transcript:" + logID)
}

// encryptOptional 用与条目绑定的 aad 加密非空明文 / encrypts a non-empty value bound to the entry's context AAD.
// aad 让密文与存储位置（host/credential/transcript + 字段）绑定，跨条目复制会被 GCM 拒绝 / the aad binds the ciphertext to its storage location (host/credential/transcript + field), so cross-entry copy-paste fails GCM verification.
func encryptOptional(value string, vault *security.Vault, aad []byte) (*security.Ciphertext, error) {
	if value == "" {
		return nil, nil
	}

	payload, err := vault.EncryptStringWithAAD(value, aad)
	if err != nil {
		return nil, err
	}

	return &payload, nil
}

// decryptOptional 用期望 aad 解密密文；旧格式密文（payload.AAD 为空）回退 nil aad 兼容 / decrypts a payload with the expected aad, falling back to nil aad for legacy payloads (empty AAD field).
// 传入的 aad 必须与加密时一致，否则拒绝——这是绑定校验的 enforcement 点 / the aad must match the one used at encryption time or decryption is refused; this is where the binding check is enforced.
func decryptOptional(payload *security.Ciphertext, vault *security.Vault, aad []byte) (string, error) {
	if payload == nil {
		return "", nil
	}

	return vault.DecryptStringWithAAD(*payload, aad)
}
