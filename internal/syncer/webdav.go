package syncer

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
)

// ErrInsecureScheme 表示 WebDAV URL 必须使用 https，拒绝 http 明文传输 Basic Auth 凭据 / indicates the WebDAV URL must use https, refusing to send Basic Auth credentials over plaintext http.
var ErrInsecureScheme = errors.New("webdav url must use https")

// WebDAVProvider 实现通用 WebDAV 文件读写 / implements generic WebDAV file reads and writes.
type WebDAVProvider struct {
	baseURL    *url.URL
	username   string
	password   string
	httpClient *http.Client
	userAgent  string
}

// NewWebDAVProvider 创建 WebDAV Provider / creates a WebDAV provider.
func NewWebDAVProvider(config WebDAVConfig, password string) (*WebDAVProvider, error) {
	httpClient := &http.Client{
		Timeout: defaultHTTPTimeout,
		Transport: &http.Transport{
			// 强制 TLS 1.2+，拒绝过时协议版本 / require TLS 1.2 or newer, rejecting legacy protocol versions.
			TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
		},
	}
	return newWebDAVProviderWithClient(config, password, httpClient)
}

// newWebDAVProviderWithClient 用指定 httpClient 构造 Provider，仅供测试注入信任测试证书的 transport / builds a provider with a given httpClient, for tests to inject a transport that trusts the test server's certificate.
func newWebDAVProviderWithClient(config WebDAVConfig, password string, httpClient *http.Client) (*WebDAVProvider, error) {
	parsed, err := url.Parse(strings.TrimSpace(config.URL))
	if err != nil {
		return nil, fmt.Errorf("parse webdav url: %w", err)
	}
	if parsed.Scheme != "https" {
		return nil, ErrInsecureScheme
	}
	if parsed.Host == "" {
		return nil, errors.New("webdav url host is required")
	}
	if strings.TrimSpace(config.Username) == "" {
		return nil, errors.New("webdav username is required")
	}
	if password == "" {
		return nil, errors.New("webdav password is required")
	}

	return &WebDAVProvider{
		baseURL:    parsed,
		username:   strings.TrimSpace(config.Username),
		password:   password,
		httpClient: httpClient,
		userAgent:   defaultUserAgent,
	}, nil
}

// Stat 返回远端文件元数据 / returns metadata for a remote file.
func (p *WebDAVProvider) Stat(ctx context.Context, remotePath string) (RemoteMeta, error) {
	req, err := p.newRequest(ctx, http.MethodHead, remotePath, nil)
	if err != nil {
		return RemoteMeta{}, err
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return RemoteMeta{}, fmt.Errorf("webdav stat: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return RemoteMeta{Exists: false}, nil
	}
	if resp.StatusCode == http.StatusConflict {
		return RemoteMeta{Exists: false}, nil
	}
	if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented {
		return p.propfind(ctx, remotePath)
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return metaFromHeader(resp.Header, true), nil
	}

	return RemoteMeta{}, statusError("webdav stat", resp)
}

// Get 下载远端文件 / downloads a remote file.
func (p *WebDAVProvider) Get(ctx context.Context, remotePath string) ([]byte, RemoteMeta, error) {
	req, err := p.newRequest(ctx, http.MethodGet, remotePath, nil)
	if err != nil {
		return nil, RemoteMeta{}, err
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, RemoteMeta{}, fmt.Errorf("webdav get: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return nil, RemoteMeta{Exists: false}, ErrRemoteNotFound
	}
	if resp.StatusCode == http.StatusConflict {
		return nil, RemoteMeta{Exists: false}, ErrRemoteNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, RemoteMeta{}, statusError("webdav get", resp)
	}

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, RemoteMeta{}, fmt.Errorf("read webdav response: %w", err)
	}
	return payload, metaFromHeader(resp.Header, true), nil
}

// Test 验证远端路径的父目录并返回同步文件状态 / verifies the parent directory and returns remote file status.
func (p *WebDAVProvider) Test(ctx context.Context, remotePath string) (TestResult, error) {
	if err := p.ensureParentDirs(ctx, remotePath); err != nil {
		return TestResult{}, err
	}

	meta, err := p.Stat(ctx, remotePath)
	if err != nil {
		return TestResult{}, err
	}
	if meta.Exists {
		return TestResult{
			OK:         true,
			Exists:     true,
			RemoteETag: meta.ETag,
			Message:    "WebDAV 连接正常，远端同步文件已存在。",
		}, nil
	}

	return TestResult{
		OK:      true,
		Exists:  false,
		Message: "WebDAV 连接正常，远端路径可写，尚未发现同步文件。",
	}, nil
}

// Put 上传远端文件，可选 If-Match 防止覆盖新版本 / uploads a remote file with optional If-Match protection.
func (p *WebDAVProvider) Put(ctx context.Context, remotePath string, payload []byte, ifMatch string) (RemoteMeta, error) {
	if err := p.ensureParentDirs(ctx, remotePath); err != nil {
		return RemoteMeta{}, err
	}

	req, err := p.newRequest(ctx, http.MethodPut, remotePath, bytes.NewReader(payload))
	if err != nil {
		return RemoteMeta{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Length", strconv.Itoa(len(payload)))
	if ifMatch != "" {
		req.Header.Set("If-Match", ifMatch)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return RemoteMeta{}, fmt.Errorf("webdav put: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusPreconditionFailed {
		return RemoteMeta{}, ErrSyncConflict
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return RemoteMeta{}, statusError("webdav put", resp)
	}

	meta := metaFromHeader(resp.Header, true)
	if meta.ETag == "" {
		meta, _ = p.Stat(ctx, remotePath)
	}
	return meta, nil
}

func (p *WebDAVProvider) ensureParentDirs(ctx context.Context, remotePath string) error {
	dir := path.Dir(cleanRemotePath(remotePath))
	if dir == "." || dir == "/" {
		return nil
	}

	current := ""
	for _, segment := range strings.Split(strings.Trim(dir, "/"), "/") {
		if segment == "" {
			continue
		}
		current += "/" + segment
		meta, err := p.propfind(ctx, current)
		if err == nil && meta.Exists {
			continue
		}
		if err != nil {
			return err
		}
		if err := p.mkcol(ctx, current); err != nil {
			return err
		}
	}
	return nil
}

func (p *WebDAVProvider) mkcol(ctx context.Context, remotePath string) error {
	req, err := p.newRequest(ctx, "MKCOL", remotePath, nil)
	if err != nil {
		return err
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("webdav mkcol: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch resp.StatusCode {
	case http.StatusCreated, http.StatusOK, http.StatusMethodNotAllowed:
		return nil
	default:
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}
		return statusError("webdav mkcol", resp)
	}
}

func (p *WebDAVProvider) propfind(ctx context.Context, remotePath string) (RemoteMeta, error) {
	body := strings.NewReader(`<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><getetag/><getcontentlength/><getlastmodified/></prop></propfind>`)
	req, err := p.newRequest(ctx, "PROPFIND", remotePath, body)
	if err != nil {
		return RemoteMeta{}, err
	}
	req.Header.Set("Depth", "0")
	req.Header.Set("Content-Type", "application/xml")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return RemoteMeta{}, fmt.Errorf("webdav propfind: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return RemoteMeta{Exists: false}, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return RemoteMeta{}, statusError("webdav propfind", resp)
	}

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return RemoteMeta{}, fmt.Errorf("read webdav propfind response: %w", err)
	}

	var multistatus struct {
		Responses []struct {
			PropStats []struct {
				Prop struct {
					ETag          string `xml:"getetag"`
					ContentLength string `xml:"getcontentlength"`
					LastModified  string `xml:"getlastmodified"`
				} `xml:"prop"`
			} `xml:"propstat"`
		} `xml:"response"`
	}
	if err := xml.Unmarshal(payload, &multistatus); err != nil {
		return RemoteMeta{}, fmt.Errorf("decode webdav propfind response: %w", err)
	}

	meta := RemoteMeta{Exists: len(multistatus.Responses) > 0}
	for _, response := range multistatus.Responses {
		for _, propstat := range response.PropStats {
			prop := propstat.Prop
			if meta.ETag == "" {
				meta.ETag = strings.TrimSpace(prop.ETag)
			}
			if meta.Size == 0 && strings.TrimSpace(prop.ContentLength) != "" {
				if parsed, err := strconv.ParseInt(strings.TrimSpace(prop.ContentLength), 10, 64); err == nil {
					meta.Size = parsed
				}
			}
			if meta.LastModified.IsZero() && strings.TrimSpace(prop.LastModified) != "" {
				if parsed, err := http.ParseTime(strings.TrimSpace(prop.LastModified)); err == nil {
					meta.LastModified = parsed
				}
			}
		}
	}
	return meta, nil
}

func (p *WebDAVProvider) newRequest(ctx context.Context, method, remotePath string, body io.Reader) (*http.Request, error) {
	target := *p.baseURL
	basePath := strings.TrimRight(target.Path, "/")
	target.Path = joinURLPath(basePath, cleanRemotePath(remotePath))

	req, err := http.NewRequestWithContext(ctx, method, target.String(), body)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(p.username, p.password)
	req.Header.Set("User-Agent", p.userAgent)
	return req, nil
}

func joinURLPath(basePath, remotePath string) string {
	joined := path.Join("/", basePath, remotePath)
	if strings.HasSuffix(remotePath, "/") && !strings.HasSuffix(joined, "/") {
		joined += "/"
	}
	return joined
}

func metaFromHeader(header http.Header, exists bool) RemoteMeta {
	meta := RemoteMeta{
		Exists: exists,
		ETag:   strings.TrimSpace(header.Get("ETag")),
	}
	if value := header.Get("Last-Modified"); value != "" {
		if parsed, err := http.ParseTime(value); err == nil {
			meta.LastModified = parsed
		}
	}
	if value := header.Get("Content-Length"); value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
			meta.Size = parsed
		}
	}
	return meta
}

func statusError(operation string, resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	message := strings.TrimSpace(string(body))
	if message == "" {
		message = resp.Status
	}

	var davError struct {
		XMLName xml.Name
		Message string `xml:",chardata"`
	}
	if strings.HasPrefix(message, "<") {
		if err := xml.Unmarshal([]byte(message), &davError); err == nil && strings.TrimSpace(davError.Message) != "" {
			message = strings.TrimSpace(davError.Message)
		}
	}

	return fmt.Errorf("%s: %s", operation, message)
}
