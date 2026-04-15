import { MonitorSmartphone, X } from 'lucide-react'

export default function SessionTabs({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
}) {
  if (sessions.length === 0) {
    return (
      <section className="panel session-tabs session-tabs-empty">
        <MonitorSmartphone size={16} />
        <span>还没有活跃终端标签，选择一台主机后点击连接即可打开新标签。</span>
      </section>
    )
  }

  return (
    <section className="panel session-tabs" aria-label="会话标签栏">
      {sessions.map((session) => {
        const active = session.sessionId === activeSessionId

        return (
          <div
            key={session.sessionId}
            className={`session-tab${active ? ' active' : ''}`}
          >
            <button
              type="button"
              className="session-tab-main"
              onClick={() => onSelect(session.sessionId)}
            >
              <strong>{session.title}</strong>
              <span>{session.remoteAddr || session.hostID}</span>
            </button>
            <button
              type="button"
              className="session-tab-close"
              aria-label={`关闭 ${session.title}`}
              onClick={() => onClose(session.sessionId)}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </section>
  )
}
