package db

import "zenterm/internal/security"

func encryptOptional(value string, vault *security.Vault) (*security.Ciphertext, error) {
	if value == "" {
		return nil, nil
	}

	payload, err := vault.EncryptString(value)
	if err != nil {
		return nil, err
	}

	return &payload, nil
}
func decryptOptional(payload *security.Ciphertext, vault *security.Vault) (string, error) {
	if payload == nil {
		return "", nil
	}

	return vault.DecryptString(*payload)
}
