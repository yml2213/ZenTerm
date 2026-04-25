import { FileText, Plus, X } from 'lucide-react'

export default function SessionTabs({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  className = '',
}) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <section className={`panel session-tabs ${className}`.trim()} aria-label="会话标签栏">
      {sessions.map((session) => {
        const tabId = session.tabId || session.sessionId
        const isNewTab = session.type === 'new'
        const isLogTab = session.type === 'log'
        const active = tabId === activeSessionId
        const label = isNewTab || isLogTab ? session.title : `${session.title} ${session.remoteAddr || session.hostID}`

        return (
          <article
            key={tabId}
            className={`session-tab ${isNewTab ? 'new-tab' : isLogTab ? 'log-tab' : 'ssh-tab'}${active ? ' active' : ''}`}
          >
            <button
              type="button"
              className="session-tab-main"
              aria-label={label}
              onClick={() => onSelect(session)}
            >
              {isNewTab ? <Plus className="session-tab-icon" size={13} /> : null}
              {isLogTab ? <FileText className="session-tab-icon" size={13} /> : null}
              <strong>{session.title}</strong>
            </button>
            <button
              type="button"
              className="session-tab-close"
              aria-label={`关闭 ${session.title}`}
              onClick={() => onClose(session)}
            >
              <X size={14} />
            </button>
          </article>
        )
      })}
    </section>
  )
}
