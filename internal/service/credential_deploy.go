package service

import (
	"fmt"
	"strings"

	"zenterm/internal/model"
)

// UploadCredentialToHost 将凭据公钥写入远端 authorized_keys / deploys a credential public key to remote authorized_keys.
func (s *Service) UploadCredentialToHost(hostID, credentialID string, bind bool) (model.CredentialUploadResult, error) {
	if hostID == "" {
		return model.CredentialUploadResult{}, ErrHostIDRequired
	}
	if credentialID == "" {
		return model.CredentialUploadResult{}, ErrCredentialIDRequired
	}

	host, err := s.store.GetHost(hostID)
	if err != nil {
		return model.CredentialUploadResult{}, err
	}
	credential, err := s.store.GetCredential(credentialID)
	if err != nil {
		return model.CredentialUploadResult{}, err
	}

	publicKey := strings.TrimSpace(credential.PublicKey)
	if publicKey == "" {
		return model.CredentialUploadResult{}, fmt.Errorf("credential public key is empty")
	}

	identity, err := s.store.GetIdentity(hostID, s.vault)
	if err != nil {
		return model.CredentialUploadResult{}, err
	}
	config, err := s.newClientConfig(host, identity)
	if err != nil {
		return model.CredentialUploadResult{}, err
	}

	client, _, err := s.openSSHClient(host, config)
	if err != nil {
		return model.CredentialUploadResult{}, err
	}
	defer func() { _ = client.Close() }()

	session, err := client.NewSession()
	if err != nil {
		return model.CredentialUploadResult{}, fmt.Errorf("create ssh session: %w", err)
	}
	defer func() { _ = session.Close() }()

	output, err := session.CombinedOutput(buildAuthorizedKeysCommand(publicKey))
	if err != nil {
		return model.CredentialUploadResult{}, fmt.Errorf("upload public key: %w", err)
	}

	changed := strings.Contains(string(output), "changed=1")
	result := model.CredentialUploadResult{
		HostID:       hostID,
		CredentialID: credentialID,
		Uploaded:     changed,
		AlreadyThere: !changed,
	}

	if bind {
		if err := s.BindCredentialToHost(hostID, credentialID); err != nil {
			return model.CredentialUploadResult{}, err
		}
		result.Bound = true
	}

	if changed {
		result.Message = "公钥已上传到远端 authorized_keys"
	} else {
		result.Message = "远端 authorized_keys 已包含该公钥"
	}
	return result, nil
}

// BindCredentialToHost 将主机认证方式切换为指定凭据 / switches a host to use the requested credential.
func (s *Service) BindCredentialToHost(hostID, credentialID string) error {
	if hostID == "" {
		return ErrHostIDRequired
	}
	if credentialID == "" {
		return ErrCredentialIDRequired
	}

	host, err := s.store.GetHost(hostID)
	if err != nil {
		return err
	}
	if _, err := s.store.GetCredential(credentialID); err != nil {
		return err
	}

	host.CredentialID = credentialID
	if err := s.store.AddHost(host, model.Identity{}, s.vault); err != nil {
		return err
	}
	return s.closeSFTPConnection(hostID)
}

// TestCredentialForHost 用指定凭据尝试建立 SSH 连接 / tests whether a credential can authenticate to a host.
func (s *Service) TestCredentialForHost(hostID, credentialID string) error {
	if hostID == "" {
		return ErrHostIDRequired
	}
	if credentialID == "" {
		return ErrCredentialIDRequired
	}

	host, err := s.store.GetHost(hostID)
	if err != nil {
		return err
	}
	privateKey, passphrase, err := s.store.GetCredentialSecret(credentialID, s.vault)
	if err != nil {
		return err
	}

	config, err := s.newClientConfig(host, model.Identity{
		Password:   passphrase,
		PrivateKey: privateKey,
	})
	if err != nil {
		return err
	}

	client, _, err := s.openSSHClient(host, config)
	if err != nil {
		return err
	}
	defer func() { _ = client.Close() }()

	return s.store.UpdateCredentialLastUsed(credentialID)
}

func buildAuthorizedKeysCommand(publicKey string) string {
	script := fmt.Sprintf(`set -e
key=%s
dir="${HOME}/.ssh"
file="${dir}/authorized_keys"
mkdir -p "$dir"
touch "$file"
chmod 700 "$dir"
if grep -qxF "$key" "$file"; then
  changed=0
else
  printf '%%s\n' "$key" >> "$file"
  changed=1
fi
chmod 600 "$file"
printf 'changed=%%s\n' "$changed"
`, shellQuote(publicKey))

	return "sh -c " + shellQuote(script)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}
