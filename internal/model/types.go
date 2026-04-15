package model

import "time"

// Host 保存不包含敏感信息的 SSH 连接元数据 / contains non-sensitive SSH connection metadata.
type Host struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Address    string `json:"address"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	KnownHosts string `json:"known_hosts,omitempty"`
}

// Identity 保存主机认证所需的敏感凭据 / contains the sensitive authentication material for a host.
type Identity struct {
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"private_key,omitempty"`
}

// FileEntry 表示文件浏览器中的单个条目 / represents a single file-system entry in the browser.
type FileEntry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	Mode    string    `json:"mode"`
	ModTime time.Time `json:"modTime"`
	Type    string    `json:"type"`
	IsDir   bool      `json:"isDir"`
}

// FileListing 表示一个目录列表响应 / represents a directory listing response.
type FileListing struct {
	Path       string      `json:"path"`
	ParentPath string      `json:"parentPath,omitempty"`
	Entries    []FileEntry `json:"entries"`
}
