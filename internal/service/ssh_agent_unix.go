//go:build !windows

package service

import (
	"net"
	"os"
)

func dialSSHAgent() (net.Conn, error) {
	sock := os.Getenv("SSH_AUTH_SOCK")
	if sock == "" {
		return nil, errAgentUnavailable
	}
	return net.DialTimeout("unix", sock, agentDialTimeout())
}
