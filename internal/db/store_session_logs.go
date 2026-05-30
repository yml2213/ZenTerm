package db

import (
	"sort"

	"zenterm/internal/model"
)

func (s *Store) CreateSessionLog(log model.SessionLog) error {
	if log.ID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.SessionLogs {
		if data.SessionLogs[i].ID == log.ID {
			data.SessionLogs[i] = log
			return s.saveLocked(data)
		}
	}

	data.SessionLogs = append(data.SessionLogs, log)
	return s.saveLocked(data)
}

// GetSessionLog 返回指定连接历史记录 / returns the requested connection history record.
func (s *Store) GetSessionLog(logID string) (model.SessionLog, error) {
	if logID == "" {
		return model.SessionLog{}, ErrSessionLogIDRequired
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return model.SessionLog{}, err
	}

	for _, log := range data.SessionLogs {
		if log.ID == logID {
			return log, nil
		}
	}

	return model.SessionLog{}, ErrSessionLogNotFound
}

// UpdateSessionLog 更新已有连接历史记录 / updates an existing connection history record.
func (s *Store) UpdateSessionLog(log model.SessionLog) error {
	if log.ID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.SessionLogs {
		if data.SessionLogs[i].ID == log.ID {
			data.SessionLogs[i] = log
			return s.saveLocked(data)
		}
	}

	return ErrSessionLogNotFound
}

// ListSessionLogs 返回按开始时间倒序排列的连接历史记录 / returns connection history records sorted newest first.
func (s *Store) ListSessionLogs(limit int) ([]model.SessionLog, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	logs := append([]model.SessionLog(nil), data.SessionLogs...)
	sort.SliceStable(logs, func(i, j int) bool {
		return logs[i].StartedAt.After(logs[j].StartedAt)
	})
	if limit > 0 && len(logs) > limit {
		logs = logs[:limit]
	}
	return logs, nil
}

// ToggleSessionLogFavorite 更新连接历史收藏状态 / updates the favorite state for a connection history record.
func (s *Store) ToggleSessionLogFavorite(logID string, favorite bool) error {
	if logID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	for i := range data.SessionLogs {
		if data.SessionLogs[i].ID == logID {
			data.SessionLogs[i].Favorite = favorite
			return s.saveLocked(data)
		}
	}

	return ErrSessionLogNotFound
}

// DeleteSessionLog 删除一条连接历史记录 / deletes a connection history record.
func (s *Store) DeleteSessionLog(logID string) error {
	if logID == "" {
		return ErrSessionLogIDRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	filtered := data.SessionLogs[:0]
	deleted := false
	for _, log := range data.SessionLogs {
		if log.ID == logID {
			deleted = true
			continue
		}
		filtered = append(filtered, log)
	}
	if !deleted {
		return ErrSessionLogNotFound
	}
	data.SessionLogs = filtered

	transcripts := data.SessionTranscripts[:0]
	for _, transcript := range data.SessionTranscripts {
		if transcript.LogID == logID {
			continue
		}
		transcripts = append(transcripts, transcript)
	}
	data.SessionTranscripts = transcripts
	if err := s.saveLocked(data); err != nil {
		return err
	}
	return s.deleteTranscriptFilesLocked([]string{logID})
}

// AppendSessionTranscript 追加并加密保存会话终端输出 / appends and encrypts visible terminal output for a session.
func (s *Store) PruneSessionLogs(maxEntries int) error {
	if maxEntries <= 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := s.loadLocked()
	if err != nil {
		return err
	}

	sort.SliceStable(data.SessionLogs, func(i, j int) bool {
		return data.SessionLogs[i].StartedAt.After(data.SessionLogs[j].StartedAt)
	})
	removedLogIDs := []string{}
	if len(data.SessionLogs) > maxEntries {
		for _, log := range data.SessionLogs[maxEntries:] {
			removedLogIDs = append(removedLogIDs, log.ID)
		}
		data.SessionLogs = data.SessionLogs[:maxEntries]
	}

	keptLogIDs := make(map[string]struct{}, len(data.SessionLogs))
	for _, log := range data.SessionLogs {
		keptLogIDs[log.ID] = struct{}{}
	}
	transcripts := data.SessionTranscripts[:0]
	for _, transcript := range data.SessionTranscripts {
		if _, ok := keptLogIDs[transcript.LogID]; ok {
			transcripts = append(transcripts, transcript)
			continue
		}
		removedLogIDs = append(removedLogIDs, transcript.LogID)
	}
	data.SessionTranscripts = transcripts
	if err := s.saveLocked(data); err != nil {
		return err
	}
	return s.deleteTranscriptFilesLocked(removedLogIDs)
}

// LoadWindowState 读取最近一次持久化的窗口状态 / loads the last persisted window state.
