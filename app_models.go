package main

import (
	"time"

	"zenterm/internal/model"
	"zenterm/internal/service"
)

type Host struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Address          string `json:"address"`
	Port             int    `json:"port"`
	Username         string `json:"username"`
	Group            string `json:"group,omitempty"`
	Tags             string `json:"tags,omitempty"`
	Favorite         bool   `json:"favorite,omitempty"`
	SystemType       string `json:"system_type,omitempty"`
	SystemTypeSource string `json:"system_type_source,omitempty"`
	LastConnectedAt  string `json:"last_connected_at,omitempty"`
	KnownHosts       string `json:"known_hosts,omitempty"`
	CredentialID     string `json:"credential_id,omitempty"`
}

type Credential struct {
	ID         string               `json:"id"`
	Label      string               `json:"label"`
	Type       model.CredentialType `json:"type"`
	Algorithm  string               `json:"algorithm,omitempty"`
	PublicKey  string               `json:"public_key,omitempty"`
	CreatedAt  string               `json:"created_at"`
	UpdatedAt  string               `json:"updated_at,omitempty"`
	LastUsedAt string               `json:"last_used_at,omitempty"`
}

type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"modTime"`
	Type    string `json:"type"`
	IsDir   bool   `json:"isDir"`
}

type FileListing struct {
	Path       string      `json:"path"`
	ParentPath string      `json:"parentPath,omitempty"`
	Entries    []FileEntry `json:"entries"`
}

type Session struct {
	ID          string `json:"ID"`
	HostID      string `json:"HostID"`
	RemoteAddr  string `json:"RemoteAddr"`
	ConnectedAt string `json:"ConnectedAt"`
}

func hostFromModel(host model.Host) Host {
	return Host{
		ID:               host.ID,
		Name:             host.Name,
		Address:          host.Address,
		Port:             host.Port,
		Username:         host.Username,
		Group:            host.Group,
		Tags:             host.Tags,
		Favorite:         host.Favorite,
		SystemType:       host.SystemType,
		SystemTypeSource: host.SystemTypeSource,
		LastConnectedAt:  formatTime(host.LastConnectedAt),
		KnownHosts:       host.KnownHosts,
		CredentialID:     host.CredentialID,
	}
}

func (host Host) toModel() model.Host {
	return model.Host{
		ID:               host.ID,
		Name:             host.Name,
		Address:          host.Address,
		Port:             host.Port,
		Username:         host.Username,
		Group:            host.Group,
		Tags:             host.Tags,
		Favorite:         host.Favorite,
		SystemType:       host.SystemType,
		SystemTypeSource: host.SystemTypeSource,
		LastConnectedAt:  parseTime(host.LastConnectedAt),
		KnownHosts:       host.KnownHosts,
		CredentialID:     host.CredentialID,
	}
}

func hostsFromModel(hosts []model.Host) []Host {
	result := make([]Host, 0, len(hosts))
	for _, host := range hosts {
		result = append(result, hostFromModel(host))
	}
	return result
}

func credentialFromModel(credential model.Credential) Credential {
	return Credential{
		ID:         credential.ID,
		Label:      credential.Label,
		Type:       credential.Type,
		Algorithm:  credential.Algorithm,
		PublicKey:  credential.PublicKey,
		CreatedAt:  formatTime(credential.CreatedAt),
		UpdatedAt:  formatTime(credential.UpdatedAt),
		LastUsedAt: formatTime(credential.LastUsedAt),
	}
}

func credentialsFromModel(credentials []model.Credential) []Credential {
	result := make([]Credential, 0, len(credentials))
	for _, credential := range credentials {
		result = append(result, credentialFromModel(credential))
	}
	return result
}

func fileEntryFromModel(entry model.FileEntry) FileEntry {
	return FileEntry{
		Name:    entry.Name,
		Path:    entry.Path,
		Size:    entry.Size,
		Mode:    entry.Mode,
		ModTime: formatTime(entry.ModTime),
		Type:    entry.Type,
		IsDir:   entry.IsDir,
	}
}

func fileListingFromModel(listing model.FileListing) FileListing {
	entries := make([]FileEntry, 0, len(listing.Entries))
	for _, entry := range listing.Entries {
		entries = append(entries, fileEntryFromModel(entry))
	}
	return FileListing{
		Path:       listing.Path,
		ParentPath: listing.ParentPath,
		Entries:    entries,
	}
}

func sessionFromService(session service.Session) Session {
	return Session{
		ID:          session.ID,
		HostID:      session.HostID,
		RemoteAddr:  session.RemoteAddr,
		ConnectedAt: formatTime(session.ConnectedAt),
	}
}

func sessionsFromService(sessions []service.Session) []Session {
	result := make([]Session, 0, len(sessions))
	for _, session := range sessions {
		result = append(result, sessionFromService(session))
	}
	return result
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) time.Time {
	if value == "" {
		return time.Time{}
	}

	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}
	}
	return parsed.UTC()
}
