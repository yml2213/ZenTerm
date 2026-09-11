//go:build windows

package service

import (
	"net"
	"os"
	"time"

	"golang.org/x/sys/windows"
)

const windowsOpenSSHAgentPipe = `\\.\pipe\openssh-ssh-agent`

func dialSSHAgent() (net.Conn, error) {
	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if conn, err := net.DialTimeout("unix", sock, agentDialTimeout()); err == nil {
			return conn, nil
		}
		if conn, err := net.DialTimeout("tcp", sock, agentDialTimeout()); err == nil {
			return conn, nil
		}
	}
	return dialWindowsNamedPipe(windowsOpenSSHAgentPipe)
}

func dialWindowsNamedPipe(pipe string) (net.Conn, error) {
	path, err := windows.UTF16PtrFromString(pipe)
	if err != nil {
		return nil, err
	}
	handle, err := windows.CreateFile(
		path,
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		0,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_ATTRIBUTE_NORMAL,
		0,
	)
	if err != nil {
		return nil, err
	}
	file := os.NewFile(uintptr(handle), pipe)
	if file == nil {
		_ = windows.CloseHandle(handle)
		return nil, errAgentUnavailable
	}
	return &windowsPipeConn{File: file}, nil
}

type windowsPipeConn struct {
	*os.File
}

func (c *windowsPipeConn) LocalAddr() net.Addr  { return pipeAddr("local") }
func (c *windowsPipeConn) RemoteAddr() net.Addr { return pipeAddr("remote") }
func (c *windowsPipeConn) SetDeadline(t time.Time) error {
	return c.File.SetDeadline(t)
}
func (c *windowsPipeConn) SetReadDeadline(t time.Time) error {
	return c.File.SetReadDeadline(t)
}
func (c *windowsPipeConn) SetWriteDeadline(t time.Time) error {
	return c.File.SetWriteDeadline(t)
}

type pipeAddr string

func (a pipeAddr) Network() string { return "pipe" }
func (a pipeAddr) String() string  { return string(a) }
