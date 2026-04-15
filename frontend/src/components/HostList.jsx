import { Server, ShieldCheck } from 'lucide-react'

export default function HostList({
  hosts,
  selectedHostId,
  connectedHostId,
  onSelect,
  onConnect,
  disabled,
}) {
  if (hosts.length === 0) {
    return (
      <div className="empty-card">
        <ShieldCheck size={18} />
        <div>
          <strong>还没有主机</strong>
          <p>先在下方添加一台主机，然后解锁保险箱并发起连接。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="host-list">
      {hosts.map((host) => {
        const active = host.id === selectedHostId
        const connected = host.id === connectedHostId

        return (
          <button
            key={host.id}
            type="button"
            className={`host-card${active ? ' active' : ''}`}
            onClick={() => onSelect(host.id)}
          >
            <div className="host-card-header">
              <div className="host-card-title">
                <Server size={16} />
                <span>{host.name || host.id}</span>
              </div>
              {connected ? <span className="pill success">在线</span> : null}
            </div>

            <div className="host-card-meta">
              <span>{host.username}@{host.address}</span>
              <span>:{host.port || 22}</span>
            </div>

            <div className="host-card-footer">
              <span className="pill subtle">{host.known_hosts ? '已信任指纹' : '待验证指纹'}</span>
              <span className="text-link" aria-hidden="true">
                {disabled ? '已锁定' : '选择'}
              </span>
            </div>

            <span className="host-card-action">
              <span
                className="secondary-button"
                onClick={(event) => {
                  event.stopPropagation()
                  onConnect(host.id)
                }}
              >
                连接
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
