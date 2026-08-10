package service

import (
	"crypto/ed25519"
	cryptoRand "crypto/rand"
	"errors"
	"io"
	"net"
	"path/filepath"
	"testing"
	"time"

	"zenterm/internal/db"
	"zenterm/internal/model"
	"zenterm/internal/security"

	"golang.org/x/crypto/ssh"
)

// TestConnectAgainstLocalSSHServer 验证真实 SSH 握手、主机密钥校验、PTY/shell 和断开流程。
func TestConnectAgainstLocalSSHServer(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(cryptoRand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey() error = %v", err)
	}
	signer, err := ssh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatalf("NewSignerFromKey() error = %v", err)
	}
	sshPublicKey, err := ssh.NewPublicKey(publicKey)
	if err != nil {
		t.Fatalf("NewPublicKey() error = %v", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer listener.Close()

	serverConfig := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if conn.User() != "zen" || string(password) != "secret" {
				return nil, errors.New("invalid test credentials")
			}
			return nil, nil
		},
	}
	serverConfig.AddHostKey(signer)
	serverDone := make(chan struct{})
	go serveLocalSSH(listener, serverConfig, serverDone)

	store, err := db.NewStore(filepath.Join(t.TempDir(), "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	tcpAddr := listener.Addr().(*net.TCPAddr)
	host := model.Host{
		ID:         "local-ssh-integration",
		Address:    "127.0.0.1",
		Port:       tcpAddr.Port,
		Username:   "zen",
		KnownHosts: string(ssh.MarshalAuthorizedKey(sshPublicKey)),
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	svc, err := New(store, vault)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	sessionID, err := svc.Connect(host.ID)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	if sessionID == "" {
		t.Fatal("Connect() returned an empty session ID")
	}
	if sessions := svc.ListSessions(); len(sessions) != 1 || sessions[0].ID != sessionID {
		t.Fatalf("ListSessions() = %#v, want one connected session", sessions)
	}

	if err := svc.Disconnect(sessionID); err != nil {
		t.Fatalf("Disconnect() error = %v", err)
	}
	select {
	case <-serverDone:
	case <-time.After(2 * time.Second):
		t.Fatal("local SSH server did not shut down after disconnect")
	}
}

func serveLocalSSH(listener net.Listener, config *ssh.ServerConfig, done chan<- struct{}) {
	defer close(done)
	conn, err := listener.Accept()
	if err != nil {
		return
	}
	sshConn, channels, requests, err := ssh.NewServerConn(conn, config)
	if err != nil {
		_ = conn.Close()
		return
	}
	defer sshConn.Close()
	go ssh.DiscardRequests(requests)

	for newChannel := range channels {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(ssh.UnknownChannelType, "session channels only")
			continue
		}
		channel, channelRequests, err := newChannel.Accept()
		if err != nil {
			continue
		}
		go serveLocalSSHChannel(channel, channelRequests)
	}
}

func serveLocalSSHChannel(channel ssh.Channel, requests <-chan *ssh.Request) {
	defer channel.Close()
	for request := range requests {
		switch request.Type {
		case "pty-req", "shell":
			_ = request.Reply(true, nil)
			if request.Type == "shell" {
				_, _ = io.WriteString(channel, "ready\n")
			}
		default:
			_ = request.Reply(false, nil)
		}
	}
}
