package service

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"zenterm/internal/model"
)

// ListLocalSSHConfigHosts 读取本机 ~/.ssh/config 中可导入的 Host / reads importable hosts from local ~/.ssh/config.
func (s *Service) ListLocalSSHConfigHosts() ([]model.LocalSSHConfigHost, error) {
	configPath, err := localSSHConfigPath()
	if err != nil {
		return nil, err
	}

	entries, err := parseLocalSSHConfig(configPath)
	if err != nil {
		return nil, err
	}

	hosts, err := s.store.GetHosts()
	if err != nil {
		return nil, err
	}
	imported := make(map[string]bool, len(hosts))
	for _, host := range hosts {
		imported[host.ID] = true
	}

	credentialByIdentity, err := s.credentialByIdentityFile()
	if err != nil {
		return nil, err
	}

	for i := range entries {
		entries[i].Imported = imported[entries[i].ID]
		if entries[i].IdentityFile != "" {
			entries[i].CredentialID = credentialByIdentity[entries[i].IdentityFile]
		}
	}

	return entries, nil
}

// ImportLocalSSHConfigHosts 批量导入本机 SSH config 中的主机 / imports selected local SSH config hosts.
func (s *Service) ImportLocalSSHConfigHosts(ids []string) ([]model.Host, error) {
	if len(ids) == 0 {
		return []model.Host{}, nil
	}

	entries, err := s.ListLocalSSHConfigHosts()
	if err != nil {
		return nil, err
	}

	selected := make(map[string]bool, len(ids))
	for _, id := range ids {
		selected[id] = true
	}

	imported := make([]model.Host, 0, len(ids))
	for _, entry := range entries {
		if !selected[entry.ID] || entry.Imported {
			continue
		}

		host := model.Host{
			ID:           entry.ID,
			Name:         entry.Alias,
			Address:      entry.HostName,
			Port:         entry.Port,
			Username:     entry.User,
			Group:        "SSH Config",
			CredentialID: entry.CredentialID,
		}
		if host.Port == 0 {
			host.Port = defaultSSHPort
		}
		if host.Username == "" {
			host.Username = os.Getenv("USER")
		}

		if err := s.store.AddHost(host, model.Identity{}, s.vault); err != nil {
			return nil, err
		}
		imported = append(imported, host)
	}

	return imported, nil
}

func localSSHConfigPath() (string, error) {
	sshDir, err := localSSHDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(sshDir, "config"), nil
}

func parseLocalSSHConfig(path string) ([]model.LocalSSHConfigHost, error) {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return []model.LocalSSHConfigHost{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("open ssh config: %w", err)
	}
	defer func() { _ = file.Close() }()

	var entries []model.LocalSSHConfigHost
	var current *model.LocalSSHConfigHost
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := stripSSHConfigComment(strings.TrimSpace(scanner.Text()))
		if line == "" {
			continue
		}

		key, value, ok := splitSSHConfigDirective(line)
		if !ok {
			continue
		}

		switch strings.ToLower(key) {
		case "host":
			if current != nil {
				entries = appendSSHConfigHost(entries, *current)
			}
			current = newSSHConfigHost(value)
		case "hostname":
			if current != nil {
				current.HostName = value
			}
		case "user":
			if current != nil {
				current.User = value
			}
		case "port":
			if current != nil {
				if port, err := strconv.Atoi(value); err == nil && port > 0 {
					current.Port = port
				}
			}
		case "identityfile":
			if current != nil {
				current.IdentityFile = expandSSHPath(value)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan ssh config: %w", err)
	}
	if current != nil {
		entries = appendSSHConfigHost(entries, *current)
	}

	return entries, nil
}

func appendSSHConfigHost(entries []model.LocalSSHConfigHost, entry model.LocalSSHConfigHost) []model.LocalSSHConfigHost {
	if entry.ID == "" || strings.ContainsAny(entry.Alias, "*?") {
		return entries
	}
	if entry.HostName == "" {
		entry.HostName = entry.Alias
	}
	if entry.Port == 0 {
		entry.Port = defaultSSHPort
	}
	return append(entries, entry)
}

func newSSHConfigHost(patterns string) *model.LocalSSHConfigHost {
	fields := strings.Fields(patterns)
	if len(fields) == 0 {
		return nil
	}
	alias := fields[0]
	return &model.LocalSSHConfigHost{
		ID:    sanitizeHostID(alias),
		Alias: alias,
		Port:  defaultSSHPort,
	}
}

func stripSSHConfigComment(line string) string {
	if index := strings.Index(line, "#"); index >= 0 {
		return strings.TrimSpace(line[:index])
	}
	return line
}

func splitSSHConfigDirective(line string) (string, string, bool) {
	if key, value, ok := strings.Cut(line, "="); ok {
		return strings.TrimSpace(key), strings.TrimSpace(value), strings.TrimSpace(key) != ""
	}
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return "", "", false
	}
	return fields[0], strings.Join(fields[1:], " "), true
}

func expandSSHPath(value string) string {
	value = strings.Trim(value, `"'`)
	if strings.HasPrefix(value, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, value[2:])
		}
	}
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	sshDir, err := localSSHDir()
	if err != nil {
		return value
	}
	return filepath.Join(sshDir, value)
}

func sanitizeHostID(value string) string {
	value = strings.TrimSpace(value)
	replacer := strings.NewReplacer(" ", "-", "\t", "-", "/", "-", "\\", "-", ":", "-")
	return replacer.Replace(value)
}

func (s *Service) credentialByIdentityFile() (map[string]string, error) {
	localKeys, err := s.ListLocalSSHKeys()
	if err != nil {
		return nil, err
	}

	result := make(map[string]string, len(localKeys))
	for _, key := range localKeys {
		if key.Path != "" && key.CredentialID != "" {
			result[key.Path] = key.CredentialID
		}
	}
	return result, nil
}
