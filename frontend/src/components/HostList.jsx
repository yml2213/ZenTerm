import { PencilLine, PlugZap, SearchX, Server, ShieldCheck, ShieldQuestion, Trash2 } from 'lucide-react'

const avatarTones = ['amber', 'emerald', 'cyan', 'violet', 'rose', 'blue']

export default function HostList({
  hosts,
  hasAnyHosts,
  searchQuery,
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
    const isSearching = Boolean(searchQuery?.trim())

    return (
      <div className="host-grid host-grid-empty">
        <div className="empty-card panel">
          <div className="empty-card-icon">
            {isSearching ? <SearchX size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div>
            <strong>{isSearching && hasAnyHosts ? '没有匹配的主机' : '还没有主机'}</strong>
            <p>
              {isSearching && hasAnyHosts
                ? `没有找到与 “${searchQuery}” 匹配的主机，试试主机名、地址或用户名。`
                : '先新建一台主机，再通过主密码保护本地凭据并发起连接。'}
            </p>
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
        const avatarTone = avatarTones[host.id.length % avatarTones.length]
        const trusted = Boolean(host.known_hosts)

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
              <div className="host-card-identity">
                <div className={`host-card-avatar ${avatarTone}`}>
                  <Server size={15} />
                </div>
                <div className="host-card-title">
                  <strong>{host.name || host.id}</strong>
                  <span>{host.username}@{host.address}:{host.port || 22}</span>
                  <small>{host.id}</small>
                </div>
              </div>
              <div className="host-card-badges">
                {sessionCount > 0 ? <span className="pill success">会话 {sessionCount}</span> : null}
                <span className={`host-inline-state ${trusted ? 'trusted' : 'pending'}`}>
                  {trusted ? <ShieldCheck size={13} /> : <ShieldQuestion size={13} />}
                  {trusted ? '已信任' : '待验证'}
                </span>
              </div>
            </div>

            <div className="host-card-footer">
              <span className="host-card-summary">
                {disabled ? '输入主密码后可继续连接与编辑' : trusted ? '可信指纹已写入' : '首次连接会确认指纹'}
              </span>
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
