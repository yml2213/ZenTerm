package service

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

type sshHop struct {
	host        model.Host
	identity    model.Identity
	persistJump bool
	parentID    string
}

func (s *Service) resolveJumpChain(host model.Host) ([]sshHop, error) {
	var hops []sshHop
	visited := map[string]bool{}
	if host.ID != "" {
		visited[host.ID] = true
	}

	current := host
	for range maxJumpHops {
		spec := jumpSpecFromHost(current)
		if spec == "" {
			reverseHops(hops)
			return hops, nil
		}
		if current.ID != "" && (spec == current.ID || spec == current.Name) {
			return nil, ErrJumpHostSelf
		}

		hop, err := s.resolveJumpHop(current, spec)
		if err != nil {
			return nil, err
		}
		if hop.host.ID != "" {
			if visited[hop.host.ID] {
				return nil, ErrJumpHostCycle
			}
			visited[hop.host.ID] = true
		}
		hops = append(hops, hop)
		if hop.host.ID == "" {
			reverseHops(hops)
			return hops, nil
		}
		next, err := s.store.GetHost(hop.host.ID)
		if err != nil {
			return nil, err
		}
		current = next
	}
	return nil, ErrJumpHostCycle
}

func jumpSpecFromHost(host model.Host) string {
	if value := strings.TrimSpace(host.JumpHostID); value != "" {
		return value
	}
	return strings.TrimSpace(host.JumpHost)
}

func (s *Service) resolveJumpHop(parent model.Host, spec string) (sshHop, error) {
	if saved, err := s.store.GetHost(spec); err == nil {
		identity, err := s.store.GetIdentity(saved.ID, s.vault)
		if err != nil {
			return sshHop{}, err
		}
		return sshHop{host: saved, identity: identity}, nil
	}

	hosts, err := s.store.GetHosts()
	if err != nil {
		return sshHop{}, err
	}
	for _, candidate := range hosts {
		if candidate.Name == spec || candidate.ID == spec {
			identity, err := s.store.GetIdentity(candidate.ID, s.vault)
			if err != nil {
				return sshHop{}, err
			}
			return sshHop{host: candidate, identity: identity}, nil
		}
	}

	parsed, ok := parseJumpAddress(spec)
	if !ok {
		return sshHop{}, ErrJumpHostNotFound
	}
	if parsed.Username == "" {
		parsed.Username = parent.Username
	}
	hopHost := model.Host{
		ID:         parent.ID,
		Name:       parent.Name,
		Address:    parsed.Address,
		Port:       parsed.Port,
		Username:   parsed.Username,
		UseAgent:   true,
		KnownHosts: parent.JumpKnownHosts,
	}
	return sshHop{
		host:        hopHost,
		identity:    model.Identity{},
		persistJump: true,
		parentID:    parent.ID,
	}, nil
}

type jumpAddress struct {
	Username string
	Address  string
	Port     int
}

func parseJumpAddress(value string) (jumpAddress, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return jumpAddress{}, false
	}
	if !looksLikeNetworkAddress(value) {
		return jumpAddress{}, false
	}

	username := ""
	hostPort := value
	if strings.Contains(value, "@") {
		username, hostPort, _ = strings.Cut(value, "@")
		username = strings.TrimSpace(username)
		hostPort = strings.TrimSpace(hostPort)
	}
	if hostPort == "" {
		return jumpAddress{}, false
	}

	host, port, err := net.SplitHostPort(hostPort)
	if err != nil {
		if strings.HasPrefix(hostPort, "[") && strings.HasSuffix(hostPort, "]") {
			host = strings.TrimSuffix(strings.TrimPrefix(hostPort, "["), "]")
			return jumpAddress{Username: username, Address: host, Port: defaultSSHPort}, host != ""
		}
		return jumpAddress{Username: username, Address: hostPort, Port: defaultSSHPort}, true
	}
	parsedPort, convErr := strconv.Atoi(port)
	if convErr != nil || parsedPort <= 0 {
		return jumpAddress{}, false
	}
	return jumpAddress{Username: username, Address: host, Port: parsedPort}, host != ""
}

func looksLikeNetworkAddress(value string) bool {
	if strings.ContainsAny(value, "@:.") {
		return true
	}
	if ip := net.ParseIP(value); ip != nil {
		return true
	}
	return strings.EqualFold(value, "localhost")
}

func reverseHops(hops []sshHop) {
	for i, j := 0, len(hops)-1; i < j; i, j = i+1, j-1 {
		hops[i], hops[j] = hops[j], hops[i]
	}
}

func sshHostPort(host model.Host) string {
	port := host.Port
	if port == 0 {
		port = defaultSSHPort
	}
	return net.JoinHostPort(host.Address, strconv.Itoa(port))
}

func jumpTargetChanged(existing, next model.Host) bool {
	return strings.TrimSpace(existing.JumpHostID) != strings.TrimSpace(next.JumpHostID) ||
		strings.TrimSpace(existing.JumpHost) != strings.TrimSpace(next.JumpHost)
}

func (s *Service) dialVia(ctx context.Context, jump sshClient, host model.Host, config *ssh.ClientConfig) (sshClient, error) {
	addr := sshHostPort(host)
	if via, ok := s.dialer.(sshViaDialer); ok {
		client, err := via.DialVia(ctx, jump, "tcp", addr, config)
		if err != nil {
			return nil, fmt.Errorf("dial ssh via jump: %w", err)
		}
		return client, nil
	}
	return dialSSHViaJump(ctx, jump, "tcp", addr, config)
}

func (s *Service) clientConfigForHop(ctx context.Context, hop sshHop) (*ssh.ClientConfig, func(), error) {
	config, cleanup, err := s.newClientConfigContext(ctx, hop.host, hop.identity)
	if err != nil {
		return nil, cleanup, err
	}
	if hop.persistJump {
		config.HostKeyCallback = s.hostKeyCallbackFor(ctx, hop.host, true)
	}
	return config, cleanup, nil
}
