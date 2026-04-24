package service

import (
	"io"
	"os"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type sshDialer interface {
	Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error)
}

type sshClient interface {
	NewSession() (sshSession, error)
	NewSFTPClient() (sftpClient, error)
	Close() error
}

type sshSession interface {
	StdinPipe() (io.WriteCloser, error)
	StdoutPipe() (io.Reader, error)
	StderrPipe() (io.Reader, error)
	RequestPty(term string, h, w int, modes ssh.TerminalModes) error
	Shell() error
	WindowChange(h, w int) error
	Wait() error
	Close() error
}

type realSSHDialer struct{}

func (d realSSHDialer) Dial(network, addr string, config *ssh.ClientConfig) (sshClient, error) {
	client, err := ssh.Dial(network, addr, config)
	if err != nil {
		return nil, err
	}

	return &realSSHClient{client: client}, nil
}

type realSSHClient struct {
	client *ssh.Client
}

func (c *realSSHClient) NewSession() (sshSession, error) {
	session, err := c.client.NewSession()
	if err != nil {
		return nil, err
	}

	return &realSSHSession{session: session}, nil
}

func (c *realSSHClient) NewSFTPClient() (sftpClient, error) {
	client, err := sftp.NewClient(c.client)
	if err != nil {
		return nil, err
	}

	return &realSFTPClient{client: client}, nil
}

func (c *realSSHClient) Close() error {
	return c.client.Close()
}

type realSFTPClient struct {
	client *sftp.Client
}

func (c *realSFTPClient) ReadDir(path string) ([]os.FileInfo, error) {
	return c.client.ReadDir(path)
}

func (c *realSFTPClient) RealPath(path string) (string, error) {
	return c.client.RealPath(path)
}

func (c *realSFTPClient) Getwd() (string, error) {
	return c.client.Getwd()
}

func (c *realSFTPClient) Stat(path string) (os.FileInfo, error) {
	return c.client.Stat(path)
}

func (c *realSFTPClient) Open(path string) (io.ReadCloser, error) {
	return c.client.Open(path)
}

func (c *realSFTPClient) Create(path string) (io.WriteCloser, error) {
	return c.client.Create(path)
}

func (c *realSFTPClient) Mkdir(path string) error {
	return c.client.Mkdir(path)
}

func (c *realSFTPClient) Rename(oldPath, newPath string) error {
	return c.client.Rename(oldPath, newPath)
}

func (c *realSFTPClient) Remove(path string) error {
	return c.client.Remove(path)
}

func (c *realSFTPClient) RemoveDirectory(path string) error {
	return c.client.RemoveDirectory(path)
}

func (c *realSFTPClient) Close() error {
	return c.client.Close()
}

type realSSHSession struct {
	session *ssh.Session
}

func (s *realSSHSession) StdinPipe() (io.WriteCloser, error) {
	return s.session.StdinPipe()
}

func (s *realSSHSession) StdoutPipe() (io.Reader, error) {
	return s.session.StdoutPipe()
}

func (s *realSSHSession) StderrPipe() (io.Reader, error) {
	return s.session.StderrPipe()
}

func (s *realSSHSession) RequestPty(term string, h, w int, modes ssh.TerminalModes) error {
	return s.session.RequestPty(term, h, w, modes)
}

func (s *realSSHSession) Shell() error {
	return s.session.Shell()
}

func (s *realSSHSession) WindowChange(h, w int) error {
	return s.session.WindowChange(h, w)
}

func (s *realSSHSession) Wait() error {
	return s.session.Wait()
}

func (s *realSSHSession) Close() error {
	return s.session.Close()
}
