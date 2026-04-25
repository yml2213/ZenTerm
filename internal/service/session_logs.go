package service

import (
	"errors"
	"os"
	"strings"
	"time"

	"zenterm/internal/model"
)

const sessionLogProtocolSSH = "ssh"

// ListSessionLogs 返回连接历史记录 / returns connection history records.
func (s *Service) ListSessionLogs(limit int) ([]model.SessionLog, error) {
	if err := s.reconcileActiveSessionLogs(); err != nil {
		return nil, err
	}

	return s.store.ListSessionLogs(limit)
}

// GetSessionTranscript 返回解密后的终端输出记录 / returns decrypted terminal output for a connection log.
func (s *Service) GetSessionTranscript(logID string) (model.SessionTranscript, error) {
	if err := s.flushSessionTranscript(logID); err != nil {
		return model.SessionTranscript{}, err
	}

	return s.store.GetSessionTranscript(logID, s.vault)
}

// ToggleSessionLogFavorite 更新连接历史收藏状态 / updates the favorite state for a connection history record.
func (s *Service) ToggleSessionLogFavorite(logID string, favorite bool) error {
	return s.store.ToggleSessionLogFavorite(logID, favorite)
}

// DeleteSessionLog 删除一条连接历史记录 / deletes a connection history record.
func (s *Service) DeleteSessionLog(logID string) error {
	return s.store.DeleteSessionLog(logID)
}

func (s *Service) beginSessionLog(host model.Host) string {
	logID, err := newSessionID()
	if err != nil {
		return ""
	}

	port := host.Port
	if port == 0 {
		port = defaultSSHPort
	}

	log := model.SessionLog{
		ID:            logID,
		HostID:        host.ID,
		HostName:      host.Name,
		HostAddress:   host.Address,
		HostPort:      port,
		SSHUsername:   host.Username,
		LocalUsername: currentLocalUsername(),
		Protocol:      sessionLogProtocolSSH,
		Status:        model.SessionLogStatusConnecting,
		StartedAt:     time.Now().UTC(),
	}
	if err := s.store.CreateSessionLog(log); err != nil {
		return ""
	}
	return logID
}

func (s *Service) markSessionLogActive(logID, sessionID, remoteAddr string) {
	if logID == "" {
		return
	}

	log, err := s.store.GetSessionLog(logID)
	if err != nil {
		return
	}
	log.SessionID = sessionID
	log.RemoteAddr = remoteAddr
	log.Status = model.SessionLogStatusActive
	log.ErrorMessage = ""
	_ = s.store.UpdateSessionLog(log)
}

func (s *Service) appendSessionTranscript(logID, sessionID, chunk string) {
	if logID == "" || chunk == "" {
		return
	}

	s.enqueueSessionTranscript(logID, sessionID, chunk)
}

func (s *Service) markSessionLogFinished(logID, status, errorMessage string) {
	if logID == "" {
		return
	}

	_ = s.flushSessionTranscript(logID)

	log, err := s.store.GetSessionLog(logID)
	if err != nil {
		return
	}
	_ = s.finishSessionLog(log, status, errorMessage)
}

func (s *Service) enqueueSessionTranscript(logID, sessionID, chunk string) {
	s.transcriptMu.Lock()
	defer s.transcriptMu.Unlock()

	pending := s.transcripts[logID]
	if pending == nil {
		pending = &pendingTranscript{}
		s.transcripts[logID] = pending
	}
	pending.sessionID = sessionID
	pending.chunks = append(pending.chunks, chunk)

	if pending.timer == nil {
		pending.timer = time.AfterFunc(s.transcriptDelay, func() {
			_ = s.flushSessionTranscript(logID)
		})
	}
}

func (s *Service) flushSessionTranscript(logID string) error {
	if logID == "" {
		return nil
	}

	s.transcriptMu.Lock()
	pending := s.transcripts[logID]
	if pending == nil || len(pending.chunks) == 0 {
		if pending != nil && pending.timer != nil {
			pending.timer.Stop()
			pending.timer = nil
		}
		delete(s.transcripts, logID)
		s.transcriptMu.Unlock()
		return nil
	}

	sessionID := pending.sessionID
	chunk := strings.Join(pending.chunks, "")
	if pending.timer != nil {
		pending.timer.Stop()
	}
	delete(s.transcripts, logID)
	err := s.store.AppendSessionTranscript(logID, sessionID, chunk, s.vault)
	s.transcriptMu.Unlock()
	return err
}

func (s *Service) flushAllSessionTranscripts() error {
	s.transcriptMu.Lock()
	logIDs := make([]string, 0, len(s.transcripts))
	for logID := range s.transcripts {
		logIDs = append(logIDs, logID)
	}
	s.transcriptMu.Unlock()

	var flushErr error
	for _, logID := range logIDs {
		if err := s.flushSessionTranscript(logID); err != nil && flushErr == nil {
			flushErr = err
		}
	}
	return flushErr
}

func (s *Service) reconcileActiveSessionLogs() error {
	activeSessionIDs := s.activeSessionIDs()
	logs, err := s.store.ListSessionLogs(0)
	if err != nil {
		return err
	}

	for _, log := range logs {
		if log.Status != model.SessionLogStatusActive {
			continue
		}
		if log.SessionID != "" {
			if _, ok := activeSessionIDs[log.SessionID]; ok {
				continue
			}
		}
		if err := s.finishSessionLog(log, model.SessionLogStatusClosed, ""); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) activeSessionIDs() map[string]struct{} {
	s.sessionMu.RLock()
	defer s.sessionMu.RUnlock()

	sessionIDs := make(map[string]struct{}, len(s.sessions))
	for sessionID := range s.sessions {
		sessionIDs[sessionID] = struct{}{}
	}
	return sessionIDs
}

func (s *Service) finishSessionLog(log model.SessionLog, status, errorMessage string) error {
	if log.Status == model.SessionLogStatusClosed {
		return nil
	}

	endedAt := time.Now().UTC()
	log.Status = status
	log.EndedAt = endedAt
	log.DurationMillis = durationMillis(log.StartedAt, endedAt)
	log.ErrorMessage = sanitizeSessionLogError(errorMessage)
	return s.store.UpdateSessionLog(log)
}

func statusForConnectError(err error) string {
	if errors.Is(err, ErrHostKeyRejected) {
		return model.SessionLogStatusRejected
	}
	return model.SessionLogStatusFailed
}

func durationMillis(startedAt, endedAt time.Time) int64 {
	if startedAt.IsZero() || endedAt.IsZero() || endedAt.Before(startedAt) {
		return 0
	}
	return endedAt.Sub(startedAt).Milliseconds()
}

func currentLocalUsername() string {
	if username := os.Getenv("USER"); username != "" {
		return username
	}
	if username := os.Getenv("USERNAME"); username != "" {
		return username
	}
	return ""
}

func sanitizeSessionLogError(message string) string {
	const maxLength = 280
	if len(message) <= maxLength {
		return message
	}
	return message[:maxLength]
}
