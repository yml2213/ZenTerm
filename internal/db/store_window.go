package db

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"zenterm/internal/model"
)

const windowStateFileName = "window-state.json"

func (s *Store) LoadWindowState() (model.WindowState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	state, ok, err := s.loadWindowStateFileLocked()
	if err != nil {
		return model.WindowState{}, err
	}
	if ok {
		return state, nil
	}

	data, err := s.loadLocked()
	if err != nil {
		return model.WindowState{}, err
	}

	return data.Window, nil
}

// SaveWindowState 持久化当前窗口状态 / persists the current window state.
func (s *Store) SaveWindowState(state model.WindowState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.saveWindowStateFileLocked(state)
}

// ExportSyncSnapshot 导出可跨设备同步的数据快照，不包含本机窗口状态、活跃会话和 transcript 文件。
// ExportSyncSnapshot exports data that can be synced across devices, excluding local-only state and transcript files.
func (s *Store) loadWindowStateFileLocked() (model.WindowState, bool, error) {
	bytes, err := os.ReadFile(s.windowStateFilePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return model.WindowState{}, false, nil
		}
		return model.WindowState{}, false, fmt.Errorf("read window state: %w", err)
	}

	var state model.WindowState
	if err := json.Unmarshal(bytes, &state); err != nil {
		return model.WindowState{}, false, fmt.Errorf("decode window state: %w", err)
	}
	return state, true, nil
}
func (s *Store) saveWindowStateFileLocked(state model.WindowState) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create store directory: %w", err)
	}

	bytes, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode window state: %w", err)
	}

	if err := writeFileAtomic(s.windowStateFilePath(), bytes, 0o600); err != nil {
		return fmt.Errorf("write window state: %w", err)
	}

	return nil
}
func (s *Store) windowStateFilePath() string {
	return filepath.Join(filepath.Dir(s.path), windowStateFileName)
}
