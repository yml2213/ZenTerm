import { MonitorSmartphone, RadioTower, X } from 'lucide-react'

export default function SessionTabs({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  className = '',
  emptyLabel = '还没有活跃终端标签',
  emptyDescription = '选择一台主机后点击连接即可打开新标签。',
}) {
  if (sessions.length === 0) {
    return (
      <section className={`panel session-tabs session-tabs-empty ${className}`.trim()}>
        <div className="session-tabs-empty-icon">
          <MonitorSmartphone size={16} />
        </div>
        <div>
          <strong>{emptyLabel}</strong>
          <span>{emptyDescription}</span>
        </div>
      </section>
    )
  }

  return (
    <section className={`panel session-tabs ${className}`.trim()} aria-label="会话标签栏">
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
              aria-label={`${session.title} ${session.remoteAddr || session.hostID}`}
              onClick={() => onSelect(session.sessionId)}
            >
              <div className="session-tab-row">
                <strong>{session.title}</strong>
                <span className="session-tab-pill">
                  <RadioTower size={11} />
                  Live
                </span>
              </div>
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
