package service

import (
	"context"
	"strings"
	"time"
	"unicode"

	"zenterm/internal/model"

	"golang.org/x/crypto/ssh"
)

const keyboardInteractiveEvent = "ssh:keyboard-interactive:prompt"

// AnswerKeyboardInteractive 提交 keyboard-interactive 挑战的应答，不记录明文答案 / submits answers for a pending keyboard-interactive challenge without logging the secrets.
func (s *Service) AnswerKeyboardInteractive(hostID, promptID string, answers []string) error {
	pending, err := s.takeKeyboardInteractive(hostID, promptID)
	if err != nil {
		return err
	}
	pending.respond(keyboardInteractiveResult{answers: answers})
	return nil
}

// CancelKeyboardInteractive 取消待处理的 keyboard-interactive 挑战 / cancels a pending keyboard-interactive challenge.
func (s *Service) CancelKeyboardInteractive(hostID, promptID string) error {
	pending, err := s.takeKeyboardInteractive(hostID, promptID)
	if err != nil {
		return err
	}
	pending.respond(keyboardInteractiveResult{cancel: true})
	return nil
}

func (s *Service) takeKeyboardInteractive(hostID, promptID string) (*pendingKeyboardInteractive, error) {
	s.kbdIntMu.Lock()
	defer s.kbdIntMu.Unlock()

	pending, ok := s.pendingKbdInt[promptID]
	if !ok || pending.hostID != hostID {
		return nil, ErrKeyboardInteractiveNotFound
	}
	delete(s.pendingKbdInt, promptID)
	return pending, nil
}

func (s *Service) keyboardInteractiveCallback(ctx context.Context, host model.Host, identity model.Identity) ssh.KeyboardInteractiveChallenge {
	return func(name, instruction string, questions []string, echos []bool) ([]string, error) {
		answers := make([]string, len(questions))
		pendingIdx := make([]int, 0, len(questions))
		pendingQuestions := make([]KeyboardInteractiveQuestion, 0, len(questions))

		for i, question := range questions {
			echo := false
			if i < len(echos) {
				echo = echos[i]
			}
			if identity.Password != "" && !echo && looksLikePasswordPrompt(question) {
				answers[i] = identity.Password
				continue
			}
			pendingIdx = append(pendingIdx, i)
			pendingQuestions = append(pendingQuestions, KeyboardInteractiveQuestion{
				Prompt: question,
				Echo:   echo,
			})
		}

		if len(pendingQuestions) == 0 {
			return answers, nil
		}

		promptID, err := newSessionID()
		if err != nil {
			return nil, err
		}
		pending := &pendingKeyboardInteractive{
			promptID: promptID,
			hostID:   host.ID,
			result:   make(chan keyboardInteractiveResult, 1),
		}

		s.kbdIntMu.Lock()
		if _, exists := s.pendingKbdInt[promptID]; exists {
			s.kbdIntMu.Unlock()
			return nil, ErrKeyboardInteractivePending
		}
		if s.pendingKbdInt == nil {
			s.pendingKbdInt = make(map[string]*pendingKeyboardInteractive)
		}
		s.pendingKbdInt[promptID] = pending
		s.kbdIntMu.Unlock()

		s.emit(keyboardInteractiveEvent, KeyboardInteractivePrompt{
			PromptID:    promptID,
			HostID:      host.ID,
			Name:        name,
			Instruction: instruction,
			Questions:   pendingQuestions,
		})

		select {
		case result := <-pending.result:
			if result.cancel {
				return nil, ErrKeyboardInteractiveCanceled
			}
			if len(result.answers) != len(pendingQuestions) {
				return nil, ErrKeyboardInteractiveCanceled
			}
			for i, idx := range pendingIdx {
				if i < len(result.answers) {
					answers[idx] = result.answers[i]
				}
			}
			return answers, nil
		case <-ctx.Done():
			s.clearKeyboardInteractive(promptID)
			return nil, ctx.Err()
		case <-time.After(hostKeyConfirmTimeout):
			s.clearKeyboardInteractive(promptID)
			return nil, ErrKeyboardInteractiveTimeout
		}
	}
}

func (s *Service) clearKeyboardInteractive(promptID string) {
	s.kbdIntMu.Lock()
	delete(s.pendingKbdInt, promptID)
	s.kbdIntMu.Unlock()
}

func (s *Service) cancelAllKeyboardInteractive() {
	s.kbdIntMu.Lock()
	pending := make([]*pendingKeyboardInteractive, 0, len(s.pendingKbdInt))
	for promptID, confirmation := range s.pendingKbdInt {
		delete(s.pendingKbdInt, promptID)
		pending = append(pending, confirmation)
	}
	s.kbdIntMu.Unlock()
	for _, confirmation := range pending {
		confirmation.respond(keyboardInteractiveResult{cancel: true})
	}
}

func (p *pendingKeyboardInteractive) respond(result keyboardInteractiveResult) {
	p.once.Do(func() {
		p.result <- result
		close(p.result)
	})
}

func looksLikePasswordPrompt(question string) bool {
	normalized := strings.ToLower(strings.TrimSpace(question))
	if normalized == "" {
		return false
	}
	trimmed := strings.TrimRightFunc(normalized, func(r rune) bool {
		return unicode.IsSpace(r) || r == ':'
	})
	switch {
	case strings.Contains(trimmed, "password"):
		return true
	case strings.Contains(trimmed, "passphrase"):
		return true
	case strings.Contains(trimmed, "密码"):
		return true
	case strings.Contains(trimmed, "口令"):
		return true
	default:
		return false
	}
}
