import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, ShieldQuestion } from 'lucide-react'
import type { KeyboardInteractivePrompt } from '@/features/sessions/sessionTypes'

interface KeyboardInteractiveModalProps {
  prompt: KeyboardInteractivePrompt | null
  busy: boolean
  onSubmit: (answers: string[]) => void
  onCancel: () => void
}

export default function KeyboardInteractiveModal({
  prompt,
  busy,
  onSubmit,
  onCancel,
}: KeyboardInteractiveModalProps) {
  const [answers, setAnswers] = useState<string[]>([])

  useEffect(() => {
    setAnswers((prompt?.questions || []).map(() => ''))
  }, [prompt?.promptID, prompt?.questions])

  if (!prompt) {
    return null
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(answers)
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="hostkey-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbdint-modal-title"
        onSubmit={handleSubmit}
      >
        <div className="hostkey-modal-head">
          <span className="pill subtle">
            <KeyRound size={14} />
            交互认证
          </span>
          <ShieldQuestion size={18} />
        </div>

        <h2 id="kbdint-modal-title">服务器请求 keyboard-interactive 认证</h2>
        <p>请按提示完成口令或 OTP 验证。应答不会写入明文日志。</p>

        <div className="hostkey-meta">
          <div>
            <span className="panel-kicker">Host</span>
            <strong>{prompt.hostID}</strong>
            {prompt.name ? <small>{prompt.name}</small> : null}
            {prompt.instruction ? <small>{prompt.instruction}</small> : null}
          </div>
        </div>

        <div className="kbdint-questions">
          {prompt.questions.map((question, index) => (
            <label key={`${prompt.promptID}-${index}`}>
              <span>{question.prompt || `提示 ${index + 1}`}</span>
              <input
                type={question.echo ? 'text' : 'password'}
                value={answers[index] || ''}
                onChange={(event) => {
                  const next = answers.slice()
                  next[index] = event.target.value
                  setAnswers(next)
                }}
                autoComplete="off"
                autoFocus={index === 0}
              />
            </label>
          ))}
        </div>

        <div className="hostkey-actions">
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
            取消连接
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? '提交中...' : '继续连接'}
          </button>
        </div>
      </form>
    </div>
  )
}
