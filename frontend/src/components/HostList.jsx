import { PencilLine, PlugZap, Server, ShieldCheck, Trash2 } from 'lucide-react'

export default function HostList({
  hosts,
  selectedHostId,
  sessionCountByHost,
  connectingHostIds,
  onSelect,
  onConnect,
  onEdit,
  onDelete,
  disabled,
}) {
  if (hosts.length === 0) {
    return (
      <div className="host-grid">
        <div className="empty-card panel">
          <ShieldCheck size={18} />
          <div>
            <strong>还没有主机</strong>
            <p>先新建一台主机，然后解锁保险箱并发起连接。</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="host-grid">
      {hosts.map((host) => {
        const active = host.id === selectedHostId
        const sessionCount = sessionCountByHost[host.id] || 0
        const connecting = connectingHostIds.includes(host.id)

        return (
          <article
            key={host.id}
            className={`host-card${active ? ' active' : ''}`}
            onClick={() => onSelect(host.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(host.id)
              }
            }}
          >
            <div className="host-card-header">
              <div className="host-card-title">
                <Server size={16} />
                <span>{host.name || host.id}</span>
              </div>
              {sessionCount > 0 ? <span className="pill success">会话 {sessionCount}</span> : null}
            </div>

            <div className="host-card-meta">
              <span>{host.username}@{host.address}:{host.port || 22}</span>
              <span>ID: {host.id}</span>
            </div>

            <div className="host-card-footer">
              <span className="pill subtle">{host.known_hosts ? '已信任指纹' : '待验证指纹'}</span>
              <div className="host-card-actions">
                <button
                  type="button"
                  className="ghost-button compact"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(host)
                  }}
                >
                  <PencilLine size={14} />
                  编辑
                </button>
                <button
                  type="button"
                  className="ghost-button compact danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(host)
                  }}
                >
                  <Trash2 size={14} />
                  删除
                </button>
                <button
                  type="button"
                  className="primary-button compact"
                  onClick={(event) => {
                    event.stopPropagation()
                    onConnect(host.id)
                  }}
                  disabled={disabled || connecting}
                >
                  <PlugZap size={14} />
                  {connecting ? '连接中' : '连接'}
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
