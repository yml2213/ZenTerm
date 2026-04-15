package service

import (
	"bytes"
	"crypto/md5"
	"crypto/subtle"
	"fmt"
	"net"
	"strings"
	"time"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

// AcceptHostKey 接受待确认的主机公钥并将其持久化 / accepts a pending host public key confirmation and persists it.
func (s *Service) AcceptHostKey(hostID, key string) error {
	s.hostKeyMu.Lock()
	pending, ok := s.pendingHostKeys[hostID]
	if !ok {
		s.hostKeyMu.Unlock()
		return ErrHostKeyConfirmationNotFound
	}
	if subtle.ConstantTimeCompare([]byte(pending.key), []byte(strings.TrimSpace(key))) != 1 {
		s.hostKeyMu.Unlock()
		return ErrHostKeyMismatch
	}
	delete(s.pendingHostKeys, hostID)
	s.hostKeyMu.Unlock()

	host, err := s.store.GetHost(hostID)
	if err != nil {
		pending.respond(false)
		return err
	}

	if err := s.store.UpdateKnownHosts(hostID, mergeKnownHosts(host.KnownHosts, pending.key)); err != nil {
		pending.respond(false)
		return err
	}

	pending.respond(true)
	return nil
}

// RejectHostKey 拒绝待确认的主机公钥 / rejects a pending host public key confirmation.
func (s *Service) RejectHostKey(hostID string) error {
	s.hostKeyMu.Lock()
	pending, ok := s.pendingHostKeys[hostID]
	if ok {
		delete(s.pendingHostKeys, hostID)
	}
	s.hostKeyMu.Unlock()

	if !ok {
		return ErrHostKeyConfirmationNotFound
	}

	pending.respond(false)
	return nil
}

func (s *Service) hostKeyCallback(host model.Host) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		if isKnownHostTrusted(host.KnownHosts, key) {
			return nil
		}

		prompt := HostKeyPrompt{
			HostID:     host.ID,
			RemoteAddr: remoteAddressString(remote, hostname),
			Key:        strings.TrimSpace(string(ssh.MarshalAuthorizedKey(key))),
			SHA256:     ssh.FingerprintSHA256(key),
			MD5:        md5Fingerprint(key),
		}

		pending, err := s.registerHostKeyConfirmation(prompt)
		if err != nil {
			return err
		}

		s.emit("ssh:host-key:confirm", prompt)

		select {
		case accepted := <-pending.result:
			if accepted {
				return nil
			}
			return ErrHostKeyRejected
		case <-time.After(hostKeyConfirmTimeout):
			s.clearHostKeyConfirmation(host.ID)
			return ErrHostKeyConfirmationTimeout
		}
	}
}

func (s *Service) registerHostKeyConfirmation(prompt HostKeyPrompt) (*pendingHostKeyConfirmation, error) {
	s.hostKeyMu.Lock()
	defer s.hostKeyMu.Unlock()

	if _, exists := s.pendingHostKeys[prompt.HostID]; exists {
		return nil, ErrHostKeyConfirmationPending
	}

	pending := &pendingHostKeyConfirmation{
		hostID: prompt.HostID,
		key:    prompt.Key,
		result: make(chan bool, 1),
	}
	s.pendingHostKeys[prompt.HostID] = pending
	return pending, nil
}

func (s *Service) clearHostKeyConfirmation(hostID string) {
	s.hostKeyMu.Lock()
	defer s.hostKeyMu.Unlock()
	delete(s.pendingHostKeys, hostID)
}

func (p *pendingHostKeyConfirmation) respond(accepted bool) {
	p.once.Do(func() {
		p.result <- accepted
		close(p.result)
	})
}

func isKnownHostTrusted(knownHosts string, key ssh.PublicKey) bool {
	for _, line := range strings.Split(knownHosts, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parsed, _, _, _, err := ssh.ParseAuthorizedKey([]byte(line))
		if err != nil {
			continue
		}
		if bytes.Equal(parsed.Marshal(), key.Marshal()) {
			return true
		}
	}

	return false
}

func mergeKnownHosts(knownHosts, key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return strings.TrimSpace(knownHosts)
	}

	parsed, _, _, _, err := ssh.ParseAuthorizedKey([]byte(key))
	if err != nil {
		return strings.TrimSpace(knownHosts)
	}
	if isKnownHostTrusted(knownHosts, parsed) {
		return strings.TrimSpace(knownHosts)
	}
	if strings.TrimSpace(knownHosts) == "" {
		return key
	}

	return strings.TrimSpace(knownHosts) + "\n" + key
}

func remoteAddressString(remote net.Addr, fallback string) string {
	if remote != nil && remote.String() != "" {
		return remote.String()
	}

	return fallback
}

func md5Fingerprint(key ssh.PublicKey) string {
	sum := md5.Sum(key.Marshal())
	parts := make([]string, 0, len(sum))
	for _, value := range sum {
		parts = append(parts, fmt.Sprintf("%02x", value))
	}

	return strings.Join(parts, ":")
}
