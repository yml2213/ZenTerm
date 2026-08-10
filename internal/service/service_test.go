package service

import (
	"bytes"
	"context"
	"crypto/ed25519"
	cryptorand "crypto/rand"
	"io"
	"os"
	pathpkg "path"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func TestCancelConnectionCancelsRegisteredHost(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	svc := &Service{connectCancels: map[string]context.CancelFunc{"host-1": cancel}}

	svc.CancelConnection("host-1")
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("CancelConnection() did not cancel the registered host")
	}
}

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
	mu             sync.Mutex
	session        *stubSSHSession
	sftp           *stubSFTPClient
	closed         bool
	newSFTPHits    int
	newSessionHits int
	systemOutput   string
}

func (c *stubSSHClient) NewSession() (sshSession, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.newSessionHits++
	if c.session == nil {
		c.session = &stubSSHSession{}
	}
	if c.newSessionHits > 1 {
		session := &stubSSHSession{combinedOutput: c.systemOutput}
		session.ensureDefaults()
		return session, nil
	}

	c.session.ensureDefaults()
	return c.session, nil
}

func (c *stubSSHClient) NewSFTPClient() (sftpClient, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
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
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = true
	return nil
}

func (c *stubSSHClient) SendKeepAlive() error {
	return nil
}

type stubSFTPClient struct {
	mu        sync.Mutex
	cwd       string
	realPaths map[string]string
	dirs      map[string][]os.FileInfo
	stats     map[string]os.FileInfo
	files     map[string][]byte
	createErr error
	writeErr  error
	closeErr  error
	readErr   error
	renameErr error
	closed    bool
}

func (c *stubSFTPClient) ReadDir(path string) ([]os.FileInfo, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entries, ok := c.dirs[path]
	if !ok {
		return nil, os.ErrNotExist
	}

	return entries, nil
}

func (c *stubSFTPClient) RealPath(path string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if resolved, ok := c.realPaths[path]; ok {
		return resolved, nil
	}

	return "", os.ErrNotExist
}

func (c *stubSFTPClient) Getwd() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.cwd, nil
}

func (c *stubSFTPClient) Stat(path string) (os.FileInfo, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
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
	c.mu.Lock()
	defer c.mu.Unlock()
	payload, ok := c.files[path]
	if !ok {
		return nil, os.ErrNotExist
	}
	if c.readErr != nil {
		return &stubSFTPReadCloser{
			reader: bytes.NewReader(payload),
			err:    c.readErr,
		}, nil
	}

	return io.NopCloser(bytes.NewReader(payload)), nil
}

func (c *stubSFTPClient) Create(path string) (io.WriteCloser, error) {
	if c.createErr != nil {
		return nil, c.createErr
	}
	return &stubSFTPWriteCloser{
		writeErr: c.writeErr,
		closeErr: c.closeErr,
		onClose: func(data []byte) {
			c.mu.Lock()
			defer c.mu.Unlock()
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
	c.mu.Lock()
	defer c.mu.Unlock()
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
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.renameErr != nil {
		return c.renameErr
	}
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

func (c *stubSFTPClient) PosixRename(oldPath, newPath string) error {
	return c.Rename(oldPath, newPath)
}

func (c *stubSFTPClient) Remove(path string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.files, path)
	delete(c.stats, path)
	return nil
}

func (c *stubSFTPClient) RemoveDirectory(path string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.dirs, path)
	delete(c.stats, path)
	return nil
}

func (c *stubSFTPClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = true
	return nil
}

type stubSFTPWriteCloser struct {
	buffer   bytes.Buffer
	writeErr error
	closeErr error
	onClose  func(data []byte)
}

func (w *stubSFTPWriteCloser) Write(p []byte) (int, error) {
	if w.writeErr != nil {
		return 0, w.writeErr
	}
	return w.buffer.Write(p)
}

func (w *stubSFTPWriteCloser) Close() error {
	if w.onClose != nil {
		w.onClose(w.buffer.Bytes())
	}
	if w.closeErr != nil {
		return w.closeErr
	}
	return nil
}

type stubSFTPReadCloser struct {
	reader      *bytes.Reader
	err         error
	sentPartial bool
	sentErr     bool
}

func (r *stubSFTPReadCloser) Read(p []byte) (int, error) {
	if !r.sentPartial {
		r.sentPartial = true
		if len(p) > 1 {
			p = p[:len(p)/2]
		}
		if n, _ := r.reader.Read(p); n > 0 {
			return n, nil
		}
	}
	if r.err != nil && !r.sentErr {
		r.sentErr = true
		return 0, r.err
	}
	return r.reader.Read(p)
}

func (r *stubSFTPReadCloser) Close() error {
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
	mu              sync.Mutex
	stdin           bytes.Buffer
	stdout          io.ReadCloser
	stderr          io.ReadCloser
	ptyRequested    bool
	shellStarted    bool
	windowRows      int
	windowCols      int
	combinedOutput  string
	combinedCommand string
	waitCh          chan struct{}
	closed          bool
}

func (s *stubSSHSession) ensureDefaults() {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stdout, nil
}

func (s *stubSSHSession) StderrPipe() (io.Reader, error) {
	s.ensureDefaults()
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stderr, nil
}

func (s *stubSSHSession) RequestPty(_ string, h, w int, _ ssh.TerminalModes) error {
	s.ensureDefaults()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ptyRequested = true
	s.windowRows = h
	s.windowCols = w
	return nil
}

func (s *stubSSHSession) Shell() error {
	s.ensureDefaults()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.shellStarted = true
	return nil
}

func (s *stubSSHSession) CombinedOutput(cmd string) ([]byte, error) {
	s.ensureDefaults()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.combinedCommand = cmd
	return []byte(s.combinedOutput), nil
}

func (s *stubSSHSession) WindowChange(h, w int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.windowRows = h
	s.windowCols = w
	return nil
}

func (s *stubSSHSession) Wait() error {
	s.ensureDefaults()
	s.mu.Lock()
	ch := s.waitCh
	s.mu.Unlock()
	<-ch
	return nil
}

func (s *stubSSHSession) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
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
