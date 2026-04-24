package service

import (
	"bytes"
	"crypto/ed25519"
	cryptorand "crypto/rand"
	"io"
	"os"
	pathpkg "path"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func newTestPublicKey(t *testing.T) ssh.PublicKey {
	t.Helper()

	publicKey, _, err := ed25519.GenerateKey(cryptorand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}

	sshKey, err := ssh.NewPublicKey(publicKey)
	if err != nil {
		t.Fatalf("NewPublicKey() error = %v", err)
	}

	return sshKey
}

type stubDialer struct {
	network string
	addr    string
	config  *ssh.ClientConfig
	client  *stubSSHClient
	err     error
	hits    int
}

func (d *stubDialer) Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error) {
	d.network = network
	d.addr = addr
	d.config = config
	d.hits++
	if d.err != nil {
		return nil, d.err
	}

	return d.client, nil
}

type stubSSHClient struct {
	session     *stubSSHSession
	sftp        *stubSFTPClient
	closed      bool
	newSFTPHits int
}

func (c *stubSSHClient) NewSession() (sshSession, error) {
	if c.session == nil {
		c.session = &stubSSHSession{}
	}

	c.session.ensureDefaults()
	return c.session, nil
}

func (c *stubSSHClient) NewSFTPClient() (sftpClient, error) {
	c.newSFTPHits++
	if c.sftp == nil {
		c.sftp = &stubSFTPClient{
			cwd:       "/",
			realPaths: map[string]string{".": "/"},
			dirs:      map[string][]os.FileInfo{"/": {}},
			stats:     map[string]os.FileInfo{"/": stubFileInfo{name: "/", mode: os.ModeDir | 0o755, dir: true}},
			files:     map[string][]byte{},
		}
	}

	return c.sftp, nil
}

func (c *stubSSHClient) Close() error {
	c.closed = true
	return nil
}

type stubSFTPClient struct {
	cwd       string
	realPaths map[string]string
	dirs      map[string][]os.FileInfo
	stats     map[string]os.FileInfo
	files     map[string][]byte
	closed    bool
}

func (c *stubSFTPClient) ReadDir(path string) ([]os.FileInfo, error) {
	entries, ok := c.dirs[path]
	if !ok {
		return nil, os.ErrNotExist
	}

	return entries, nil
}

func (c *stubSFTPClient) RealPath(path string) (string, error) {
	if resolved, ok := c.realPaths[path]; ok {
		return resolved, nil
	}

	return "", os.ErrNotExist
}

func (c *stubSFTPClient) Getwd() (string, error) {
	return c.cwd, nil
}

func (c *stubSFTPClient) Stat(path string) (os.FileInfo, error) {
	if info, ok := c.stats[path]; ok {
		return info, nil
	}
	if _, ok := c.dirs[path]; ok {
		return stubFileInfo{name: pathpkg.Base(path), mode: os.ModeDir | 0o755, dir: true}, nil
	}
	if payload, ok := c.files[path]; ok {
		return stubFileInfo{name: pathpkg.Base(path), size: int64(len(payload)), mode: 0o644}, nil
	}

	return nil, os.ErrNotExist
}

func (c *stubSFTPClient) Open(path string) (io.ReadCloser, error) {
	payload, ok := c.files[path]
	if !ok {
		return nil, os.ErrNotExist
	}

	return io.NopCloser(bytes.NewReader(payload)), nil
}

func (c *stubSFTPClient) Create(path string) (io.WriteCloser, error) {
	return &stubSFTPWriteCloser{
		onClose: func(data []byte) {
			if c.files == nil {
				c.files = make(map[string][]byte)
			}
			if c.stats == nil {
				c.stats = make(map[string]os.FileInfo)
			}

			c.files[path] = append([]byte(nil), data...)
			c.stats[path] = stubFileInfo{
				name:    pathpkg.Base(path),
				size:    int64(len(data)),
				mode:    0o644,
				modTime: time.Now().UTC(),
			}
		},
	}, nil
}

func (c *stubSFTPClient) Mkdir(path string) error {
	if c.dirs == nil {
		c.dirs = make(map[string][]os.FileInfo)
	}
	if c.stats == nil {
		c.stats = make(map[string]os.FileInfo)
	}
	if _, ok := c.dirs[path]; ok {
		return os.ErrExist
	}

	c.dirs[path] = []os.FileInfo{}
	c.stats[path] = stubFileInfo{name: pathpkg.Base(path), mode: os.ModeDir | 0o755, dir: true, modTime: time.Now().UTC()}
	return nil
}

func (c *stubSFTPClient) Rename(oldPath, newPath string) error {
	if info, ok := c.stats[oldPath]; ok {
		c.stats[newPath] = stubFileInfo{
			name:    pathpkg.Base(newPath),
			size:    info.Size(),
			mode:    info.Mode(),
			dir:     info.IsDir(),
			modTime: info.ModTime(),
		}
		delete(c.stats, oldPath)
	}
	if payload, ok := c.files[oldPath]; ok {
		c.files[newPath] = payload
		delete(c.files, oldPath)
	}
	if entries, ok := c.dirs[oldPath]; ok {
		c.dirs[newPath] = entries
		delete(c.dirs, oldPath)
	}
	return nil
}

func (c *stubSFTPClient) Remove(path string) error {
	delete(c.files, path)
	delete(c.stats, path)
	return nil
}

func (c *stubSFTPClient) RemoveDirectory(path string) error {
	delete(c.dirs, path)
	delete(c.stats, path)
	return nil
}

func (c *stubSFTPClient) Close() error {
	c.closed = true
	return nil
}

type stubSFTPWriteCloser struct {
	buffer  bytes.Buffer
	onClose func(data []byte)
}

func (w *stubSFTPWriteCloser) Write(p []byte) (int, error) {
	return w.buffer.Write(p)
}

func (w *stubSFTPWriteCloser) Close() error {
	if w.onClose != nil {
		w.onClose(w.buffer.Bytes())
	}
	return nil
}

type stubFileInfo struct {
	name    string
	size    int64
	mode    os.FileMode
	modTime time.Time
	dir     bool
}

func (s stubFileInfo) Name() string       { return s.name }
func (s stubFileInfo) Size() int64        { return s.size }
func (s stubFileInfo) Mode() os.FileMode  { return s.mode }
func (s stubFileInfo) ModTime() time.Time { return s.modTime }
func (s stubFileInfo) IsDir() bool        { return s.dir }
func (s stubFileInfo) Sys() any           { return nil }

type stubSSHSession struct {
	stdin        bytes.Buffer
	stdout       io.ReadCloser
	stderr       io.ReadCloser
	ptyRequested bool
	shellStarted bool
	windowRows   int
	windowCols   int
	waitCh       chan struct{}
	closed       bool
}

func (s *stubSSHSession) ensureDefaults() {
	if s.stdout == nil {
		s.stdout = io.NopCloser(strings.NewReader(""))
	}
	if s.stderr == nil {
		s.stderr = io.NopCloser(strings.NewReader(""))
	}
	if s.waitCh == nil {
		s.waitCh = make(chan struct{})
	}
}

func (s *stubSSHSession) StdinPipe() (io.WriteCloser, error) {
	s.ensureDefaults()
	return nopWriteCloser{Writer: &s.stdin}, nil
}

func (s *stubSSHSession) StdoutPipe() (io.Reader, error) {
	s.ensureDefaults()
	return s.stdout, nil
}

func (s *stubSSHSession) StderrPipe() (io.Reader, error) {
	s.ensureDefaults()
	return s.stderr, nil
}

func (s *stubSSHSession) RequestPty(_ string, h, w int, _ ssh.TerminalModes) error {
	s.ensureDefaults()
	s.ptyRequested = true
	s.windowRows = h
	s.windowCols = w
	return nil
}

func (s *stubSSHSession) Shell() error {
	s.ensureDefaults()
	s.shellStarted = true
	return nil
}

func (s *stubSSHSession) WindowChange(h, w int) error {
	s.windowRows = h
	s.windowCols = w
	return nil
}

func (s *stubSSHSession) Wait() error {
	s.ensureDefaults()
	<-s.waitCh
	return nil
}

func (s *stubSSHSession) Close() error {
	if s.closed {
		return nil
	}
	s.closed = true
	if s.stdout != nil {
		_ = s.stdout.Close()
	}
	if s.stderr != nil {
		_ = s.stderr.Close()
	}
	if s.waitCh != nil {
		close(s.waitCh)
		s.waitCh = nil
	}
	return nil
}

type nopWriteCloser struct {
	io.Writer
}

func (n nopWriteCloser) Close() error {
	return nil
}

type sequenceDialer struct {
	clients []sshClient
	index   int
}

func (d *sequenceDialer) Dial(_ string, _ string, _ *ssh.ClientConfig) (sshClient, error) {
	client := d.clients[d.index]
	d.index++
	return client, nil
}
