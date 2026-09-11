package service

import (
	"errors"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

var (
	errAgentUnavailable = errors.New("ssh agent unavailable")
	errAgentNoKeys      = errors.New("ssh agent has no keys")
)

func defaultAgentAuth() (ssh.AuthMethod, func(), error) {
	conn, err := dialSSHAgent()
	if err != nil {
		return nil, nil, errAgentUnavailable
	}

	client := agent.NewClient(conn)
	signers, err := client.Signers()
	if err != nil {
		_ = conn.Close()
		return nil, nil, errAgentUnavailable
	}
	if len(signers) == 0 {
		_ = conn.Close()
		return nil, nil, errAgentNoKeys
	}

	return ssh.PublicKeysCallback(client.Signers), func() { _ = conn.Close() }, nil
}

func (s *Service) tryAgentAuth() (ssh.AuthMethod, func(), error) {
	open := s.agentAuth
	if open == nil {
		open = defaultAgentAuth
	}
	return open()
}

func joinCleanups(funcs ...func()) func() {
	return func() {
		for i := len(funcs) - 1; i >= 0; i-- {
			if funcs[i] != nil {
				funcs[i]()
			}
		}
	}
}

func agentDialTimeout() time.Duration {
	return 3 * time.Second
}
