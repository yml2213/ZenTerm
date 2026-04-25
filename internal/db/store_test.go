package db

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

func TestStoreAddHostEncryptsIdentity(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-1",
		Name:     "Production",
		Address:  "prod.example.com",
		Port:     22,
		Username: "root",
	}
	identity := model.Identity{
		Password:   "super-secret",
		PrivateKey: "PRIVATE KEY",
	}

	if err := store.AddHost(host, identity, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	bytes, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}

	content := string(bytes)
	if strings.Contains(content, identity.Password) {
		t.Fatal("store file contains plaintext password")
	}
	if strings.Contains(content, identity.PrivateKey) {
		t.Fatal("store file contains plaintext private key")
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 1 {
		t.Fatalf("len(GetHosts()) = %d, want 1", len(hosts))
	}
	if hosts[0] != host {
		t.Fatalf("GetHosts()[0] = %#v, want %#v", hosts[0], host)
	}

	loadedIdentity, err := store.GetIdentity(host.ID, vault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
}

func TestStoreUpdateLastConnectedAt(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{ID: "host-last", Address: "10.0.0.8", Port: 22, Username: "root"}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	connectedAt := time.Date(2026, 4, 24, 9, 30, 0, 0, time.UTC)
	if err := store.UpdateLastConnectedAt(host.ID, connectedAt); err != nil {
		t.Fatalf("UpdateLastConnectedAt() error = %v", err)
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 1 {
		t.Fatalf("len(GetHosts()) = %d, want 1", len(hosts))
	}
	if !hosts[0].LastConnectedAt.Equal(connectedAt) {
		t.Fatalf("LastConnectedAt = %v, want %v", hosts[0].LastConnectedAt, connectedAt)
	}
}

func TestStoreSessionLogLifecycle(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	startedAt := time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC)
	log := model.SessionLog{
		ID:          "log-1",
		HostID:      "host-1",
		HostAddress: "10.0.0.1",
		HostPort:    22,
		SSHUsername: "root",
		Protocol:    "ssh",
		Status:      model.SessionLogStatusConnecting,
		StartedAt:   startedAt,
	}
	if err := store.CreateSessionLog(log); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}

	log.Status = model.SessionLogStatusActive
	log.SessionID = "session-1"
	if err := store.UpdateSessionLog(log); err != nil {
		t.Fatalf("UpdateSessionLog() error = %v", err)
	}
	if err := store.ToggleSessionLogFavorite(log.ID, true); err != nil {
		t.Fatalf("ToggleSessionLogFavorite() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.AppendSessionTranscript(log.ID, "session-1", "secret terminal output", vault); err != nil {
		t.Fatalf("AppendSessionTranscript() error = %v", err)
	}
	if err := store.AppendSessionTranscript(log.ID, "session-1", "\nnext line", vault); err != nil {
		t.Fatalf("AppendSessionTranscript() second append error = %v", err)
	}

	logs, err := store.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("len(ListSessionLogs()) = %d, want 1", len(logs))
	}
	if logs[0].SessionID != "session-1" {
		t.Fatalf("SessionID = %q, want session-1", logs[0].SessionID)
	}
	if !logs[0].Favorite {
		t.Fatal("Favorite = false, want true")
	}

	loaded, err := store.GetSessionLog(log.ID)
	if err != nil {
		t.Fatalf("GetSessionLog() error = %v", err)
	}
	if loaded.ID != log.ID {
		t.Fatalf("GetSessionLog().ID = %q, want %q", loaded.ID, log.ID)
	}
	transcript, err := store.GetSessionTranscript(log.ID, vault)
	if err != nil {
		t.Fatalf("GetSessionTranscript() error = %v", err)
	}
	if transcript.Content != "secret terminal output\nnext line" {
		t.Fatalf("SessionTranscript.Content = %q", transcript.Content)
	}
	bytes, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if strings.Contains(string(bytes), "secret terminal output") {
		t.Fatal("store file contains plaintext terminal transcript")
	}
	if strings.Contains(string(bytes), "session_transcripts") {
		t.Fatal("store file contains transcript payload metadata")
	}
	transcriptBytes, err := os.ReadFile(store.transcriptFilePath(log.ID))
	if err != nil {
		t.Fatalf("ReadFile(transcript) error = %v", err)
	}
	if strings.Contains(string(transcriptBytes), "secret terminal output") || strings.Contains(string(transcriptBytes), "next line") {
		t.Fatal("transcript file contains plaintext terminal output")
	}

	if err := store.DeleteSessionLog(log.ID); err != nil {
		t.Fatalf("DeleteSessionLog() error = %v", err)
	}
	logs, err = store.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() after delete error = %v", err)
	}
	if len(logs) != 0 {
		t.Fatalf("len(ListSessionLogs()) after delete = %d, want 0", len(logs))
	}
	if _, err := store.GetSessionTranscript(log.ID, vault); !errors.Is(err, ErrSessionTranscriptNotFound) {
		t.Fatalf("GetSessionTranscript() after delete error = %v, want %v", err, ErrSessionTranscriptNotFound)
	}
	if _, err := os.Stat(store.transcriptFilePath(log.ID)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("transcript file after delete error = %v, want %v", err, os.ErrNotExist)
	}
}

func TestStoreResetVaultClearsSessionLogs(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	logID := "log-reset"
	if err := store.CreateSessionLog(model.SessionLog{
		ID:          logID,
		HostID:      "host-1",
		HostAddress: "10.0.0.1",
		HostPort:    22,
		SSHUsername: "root",
		Protocol:    "ssh",
		Status:      model.SessionLogStatusClosed,
		StartedAt:   time.Now().UTC(),
	}); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}
	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.AppendSessionTranscript(logID, "session-reset", "reset transcript", vault); err != nil {
		t.Fatalf("AppendSessionTranscript() error = %v", err)
	}
	if _, err := os.Stat(store.transcriptFilePath(logID)); err != nil {
		t.Fatalf("transcript file before reset error = %v", err)
	}
	if err := store.ResetVault(); err != nil {
		t.Fatalf("ResetVault() error = %v", err)
	}

	logs, err := store.ListSessionLogs(10)
	if err != nil {
		t.Fatalf("ListSessionLogs() error = %v", err)
	}
	if len(logs) != 0 {
		t.Fatalf("len(ListSessionLogs()) = %d, want 0", len(logs))
	}
	if _, err := os.Stat(store.transcriptDirPath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("transcript directory after reset error = %v, want %v", err, os.ErrNotExist)
	}
}

func TestStorePruneSessionLogsRemovesTranscriptFiles(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	logs := []model.SessionLog{
		{
			ID:          "log-old",
			HostID:      "host-old",
			HostAddress: "10.0.0.1",
			HostPort:    22,
			SSHUsername: "root",
			Protocol:    "ssh",
			Status:      model.SessionLogStatusClosed,
			StartedAt:   time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
		},
		{
			ID:          "log-new",
			HostID:      "host-new",
			HostAddress: "10.0.0.2",
			HostPort:    22,
			SSHUsername: "root",
			Protocol:    "ssh",
			Status:      model.SessionLogStatusClosed,
			StartedAt:   time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC),
		},
	}
	for _, log := range logs {
		if err := store.CreateSessionLog(log); err != nil {
			t.Fatalf("CreateSessionLog(%s) error = %v", log.ID, err)
		}
		if err := store.AppendSessionTranscript(log.ID, "session-"+log.ID, "content "+log.ID, vault); err != nil {
			t.Fatalf("AppendSessionTranscript(%s) error = %v", log.ID, err)
		}
	}

	if err := store.PruneSessionLogs(1); err != nil {
		t.Fatalf("PruneSessionLogs() error = %v", err)
	}

	if _, err := os.Stat(store.transcriptFilePath("log-old")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old transcript file error = %v, want %v", err, os.ErrNotExist)
	}
	if _, err := os.Stat(store.transcriptFilePath("log-new")); err != nil {
		t.Fatalf("new transcript file error = %v", err)
	}
}

func TestStoreEnsureSaltPersistsAcrossRestarts(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	first, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	second, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	saltA, err := first.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	saltB, err := second.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}

	if string(saltA) != string(saltB) {
		t.Fatal("EnsureSalt() returned different salts for the same store")
	}
}

func TestStoreGetHostReturnsRequestedHost(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-lookup",
		Name:     "Lookup",
		Address:  "lookup.example.com",
		Port:     22,
		Username: "zen",
	}

	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	got, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}

	if got != host {
		t.Fatalf("GetHost() = %#v, want %#v", got, host)
	}
}

func TestStoreUpdateKnownHostsPreservesIdentity(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-known-hosts",
		Name:     "Known Hosts",
		Address:  "known.example.com",
		Port:     22,
		Username: "zen",
	}
	identity := model.Identity{
		Password: "secret-password",
	}

	if err := store.AddHost(host, identity, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	const knownHosts = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKnownHostKeyValue"
	if err := store.UpdateKnownHosts(host.ID, knownHosts); err != nil {
		t.Fatalf("UpdateKnownHosts() error = %v", err)
	}

	updatedHost, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if updatedHost.KnownHosts != knownHosts {
		t.Fatalf("GetHost().KnownHosts = %q, want %q", updatedHost.KnownHosts, knownHosts)
	}

	loadedIdentity, err := store.GetIdentity(host.ID, vault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
}

func TestStoreDeleteHostRemovesHostAndIdentity(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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

	host := model.Host{
		ID:       "host-delete",
		Name:     "Delete Me",
		Address:  "delete.example.com",
		Port:     22,
		Username: "zen",
	}
	if err := store.AddHost(host, model.Identity{Password: "secret"}, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := store.DeleteHost(host.ID); err != nil {
		t.Fatalf("DeleteHost() error = %v", err)
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("len(GetHosts()) = %d, want 0", len(hosts))
	}

	_, err = store.GetIdentity(host.ID, vault)
	if err == nil {
		t.Fatal("GetIdentity() error = nil, want host not found")
	}
	if err != ErrHostNotFound {
		t.Fatalf("GetIdentity() error = %v, want %v", err, ErrHostNotFound)
	}
}

func TestStoreVerifyOrInitVaultCheckRejectsWrongPassword(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	store, err := NewStore(path)
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

	if err := store.VerifyOrInitVaultCheck(vault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}
	if err := store.AddHost(
		model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
		vault,
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	reopened, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	wrongVault := security.NewVault()
	salt, err = reopened.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := wrongVault.Unlock("wrong-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	err = reopened.VerifyOrInitVaultCheck(wrongVault)
	if err != security.ErrInvalidMasterPassword {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v, want %v", err, security.ErrInvalidMasterPassword)
	}
}

func TestStoreIsVaultInitializedTracksLifecycle(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	initialized, err := store.IsVaultInitialized()
	if err != nil {
		t.Fatalf("IsVaultInitialized() error = %v", err)
	}
	if initialized {
		t.Fatal("IsVaultInitialized() = true, want false")
	}

	vault := security.NewVault()
	salt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := vault.Unlock("master-password", salt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.VerifyOrInitVaultCheck(vault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}

	initialized, err = store.IsVaultInitialized()
	if err != nil {
		t.Fatalf("IsVaultInitialized() error = %v", err)
	}
	if !initialized {
		t.Fatal("IsVaultInitialized() = false, want true")
	}
}

func TestStoreRekeyVaultMigratesSecretsToNewPassword(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")
	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	currentVault := security.NewVault()
	currentSalt, err := store.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := currentVault.Unlock("master-password", currentSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := store.VerifyOrInitVaultCheck(currentVault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}

	host := model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"}
	identity := model.Identity{Password: "secret", PrivateKey: "PRIVATE KEY"}
	if err := store.AddHost(host, identity, currentVault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}
	log := model.SessionLog{
		ID:          "log-rekey",
		HostID:      host.ID,
		HostAddress: host.Address,
		HostPort:    host.Port,
		SSHUsername: host.Username,
		Protocol:    "ssh",
		Status:      model.SessionLogStatusClosed,
		StartedAt:   time.Now().UTC(),
	}
	if err := store.CreateSessionLog(log); err != nil {
		t.Fatalf("CreateSessionLog() error = %v", err)
	}
	if err := store.AppendSessionTranscript(log.ID, "session-rekey", "first encrypted chunk\n", currentVault); err != nil {
		t.Fatalf("AppendSessionTranscript(first) error = %v", err)
	}
	if err := store.AppendSessionTranscript(log.ID, "session-rekey", "second encrypted chunk", currentVault); err != nil {
		t.Fatalf("AppendSessionTranscript(second) error = %v", err)
	}

	nextSalt, err := security.NewSalt(16)
	if err != nil {
		t.Fatalf("NewSalt() error = %v", err)
	}
	nextVault := security.NewVault()
	if err := nextVault.Unlock("next-password", nextSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}

	if err := store.RekeyVault(currentVault, nextVault, nextSalt); err != nil {
		t.Fatalf("RekeyVault() error = %v", err)
	}

	reopened, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	wrongVault := security.NewVault()
	reopenedSalt, err := reopened.EnsureSalt()
	if err != nil {
		t.Fatalf("EnsureSalt() error = %v", err)
	}
	if err := wrongVault.Unlock("master-password", reopenedSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := reopened.VerifyOrInitVaultCheck(wrongVault); err != security.ErrInvalidMasterPassword {
		t.Fatalf("VerifyOrInitVaultCheck(old) error = %v, want %v", err, security.ErrInvalidMasterPassword)
	}

	verifiedVault := security.NewVault()
	if err := verifiedVault.Unlock("next-password", reopenedSalt); err != nil {
		t.Fatalf("Unlock() error = %v", err)
	}
	if err := reopened.VerifyOrInitVaultCheck(verifiedVault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck(new) error = %v", err)
	}

	loadedIdentity, err := reopened.GetIdentity(host.ID, verifiedVault)
	if err != nil {
		t.Fatalf("GetIdentity() error = %v", err)
	}
	if loadedIdentity != identity {
		t.Fatalf("GetIdentity() = %#v, want %#v", loadedIdentity, identity)
	}
	transcript, err := reopened.GetSessionTranscript(log.ID, verifiedVault)
	if err != nil {
		t.Fatalf("GetSessionTranscript() error = %v", err)
	}
	if transcript.Content != "first encrypted chunk\nsecond encrypted chunk" {
		t.Fatalf("SessionTranscript.Content = %q", transcript.Content)
	}
}

func TestStoreResetVaultClearsHostsAndInitialization(t *testing.T) {
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "config.zen"))
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
	if err := store.VerifyOrInitVaultCheck(vault); err != nil {
		t.Fatalf("VerifyOrInitVaultCheck() error = %v", err)
	}
	if err := store.AddHost(
		model.Host{ID: "host-1", Address: "127.0.0.1", Port: 22, Username: "root"},
		model.Identity{Password: "secret"},
		vault,
	); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}

	if err := store.AddCredential(
		model.Credential{ID: "cred-1", Label: "reset-me", Type: model.CredentialTypeSSHKey},
		"PRIVATE KEY",
		"",
		vault,
	); err != nil {
		t.Fatalf("AddCredential() error = %v", err)
	}

	if err := store.ResetVault(); err != nil {
		t.Fatalf("ResetVault() error = %v", err)
	}

	initialized, err := store.IsVaultInitialized()
	if err != nil {
		t.Fatalf("IsVaultInitialized() error = %v", err)
	}
	if initialized {
		t.Fatal("IsVaultInitialized() = true, want false")
	}

	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() error = %v", err)
	}
	if len(hosts) != 0 {
		t.Fatalf("len(GetHosts()) = %d, want 0", len(hosts))
	}

	creds, err := store.GetCredentials()
	if err != nil {
		t.Fatalf("GetCredentials() error = %v", err)
	}
	if len(creds) != 0 {
		t.Fatalf("len(GetCredentials()) = %d, want 0", len(creds))
	}
}

func TestStoreSaveAndLoadWindowState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.zen")

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	expected := model.WindowState{
		Width:     1520,
		Height:    980,
		Maximised: true,
	}
	if err := store.SaveWindowState(expected); err != nil {
		t.Fatalf("SaveWindowState() error = %v", err)
	}

	reopened, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	state, err := reopened.LoadWindowState()
	if err != nil {
		t.Fatalf("LoadWindowState() error = %v", err)
	}
	if state != expected {
		t.Fatalf("LoadWindowState() = %#v, want %#v", state, expected)
	}
}
