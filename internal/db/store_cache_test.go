package db

import (
	"os"
	"path/filepath"
	"testing"

	"zenterm/internal/model"
	"zenterm/internal/security"
)

// newSeededStore 创建一个已写入一个主机并解锁 vault 的 store，供缓存测试复用 / creates a store seeded with one host and an unlocked vault for cache tests.
func newSeededStore(t *testing.T) (*Store, *security.Vault, model.Host, model.Identity) {
	t.Helper()
	store, err := NewStore(filepath.Join(t.TempDir(), "config.zen"))
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
	host := model.Host{ID: "host-1", Name: "Production", Address: "prod.example.com", Port: 22, Username: "root"}
	identity := model.Identity{Password: "secret"}
	if err := store.AddHost(host, identity, vault); err != nil {
		t.Fatalf("AddHost() error = %v", err)
	}
	return store, vault, host, identity
}

// TestStoreCacheSurvivesFileRemoval 验证：写入后缓存命中，即使磁盘文件被外部删除，loadLocked 仍能从缓存返回数据 / verifies the cache serves reads even when the on-disk file is externally removed.
func TestStoreCacheSurvivesFileRemoval(t *testing.T) {
	store, _, host, _ := newSeededStore(t)

	// 模拟外部删除数据文件 / simulate external removal of the data file
	if err := os.Remove(store.Path()); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}

	// GetHosts 应命中缓存而非读盘，仍返回已写入的主机 / GetHosts should hit the cache instead of reading disk and still return the seeded host.
	hosts, err := store.GetHosts()
	if err != nil {
		t.Fatalf("GetHosts() after file removal err = %v, want cache hit", err)
	}
	if len(hosts) != 1 || hosts[0].ID != host.ID {
		t.Fatalf("GetHosts() = %#v, want seeded host", hosts)
	}
}

// TestStoreLoadLockedCacheHitReturnsIndependentClone 验证：缓存命中时 loadLocked 返回的副本与缓存独立，调用方修改切片元素不污染缓存 / verifies a cache-hit loadLocked returns a clone independent of the cache, so caller mutations to slice elements don't pollute the cache.
func TestStoreLoadLockedCacheHitReturnsIndependentClone(t *testing.T) {
	store, _, _, _ := newSeededStore(t)

	data1, err := store.loadLocked()
	if err != nil {
		t.Fatalf("loadLocked() first err = %v", err)
	}
	if len(data1.Hosts) != 1 {
		t.Fatalf("len(data1.Hosts) = %d, want 1", len(data1.Hosts))
	}

	// 篡改返回副本的切片元素 / tamper with a slice element on the returned clone
	data1.Hosts[0].Host.Name = "TAMPERED"
	// 再追加一个元素，验证切片 header 独立 / also append to verify slice-header independence
	data1.Hosts = append(data1.Hosts, hostEntry{Host: model.Host{ID: "host-ghost"}})

	data2, err := store.loadLocked()
	if err != nil {
		t.Fatalf("loadLocked() second err = %v", err)
	}
	if len(data2.Hosts) != 1 {
		t.Fatalf("len(data2.Hosts) = %d, want 1 (cache polluted by append)", len(data2.Hosts))
	}
	if data2.Hosts[0].Host.Name == "TAMPERED" {
		t.Fatal("cache polluted by caller mutating returned clone's slice element")
	}
}

// TestStoreCacheRefreshedAfterSave 验证：saveLocked 写盘后缓存被刷新为最新值，后续读看到新数据 / verifies saveLocked refreshes the cache so subsequent reads see the new value.
func TestStoreCacheRefreshedAfterSave(t *testing.T) {
	store, _, host, _ := newSeededStore(t)

	// 通过 UpdateHostPinned 改状态（走 loadLocked 命中缓存 → 修改 → saveLocked 刷缓存）/ UpdateHostPinned goes through loadLocked (cache hit) → mutate → saveLocked (cache refresh).
	if err := store.UpdateHostPinned(host.ID, true); err != nil {
		t.Fatalf("UpdateHostPinned() error = %v", err)
	}

	got, err := store.GetHost(host.ID)
	if err != nil {
		t.Fatalf("GetHost() error = %v", err)
	}
	if !got.Pinned {
		t.Fatal("GetHost().Pinned = false, want true (cache not refreshed after save)")
	}
}
