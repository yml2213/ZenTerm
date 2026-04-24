import { Clock3, Copy, PencilLine, PlugZap, SearchX, Server, ShieldCheck, ShieldQuestion, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

const avatarTones = ['amber', 'emerald', 'cyan', 'violet', 'rose', 'blue']

function parseTags(tags) {
  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatLastConnected(value) {
  if (!value) {
    return '暂无记录'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '暂无记录'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function HostList({
  hosts,
  hasAnyHosts,
  searchQuery,
  viewMode = 'grid',
  selectedHostId,
  sessionCountByHost,
  connectingHostIds,
  onSelect,
  onConnect,
  onEdit,
  onDelete,
  onCopyAddress,
  onToggleFavorite,
  disabled,
}) {
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    function closeContextMenu() {
      setContextMenu(null)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', closeContextMenu)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', closeContextMenu)
    }
  }, [contextMenu])

  if (hosts.length === 0) {
    const isSearching = Boolean(searchQuery?.trim())

    return (
      <div className="host-grid host-grid-empty">
        <div className="empty-card">
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
    <div className={`host-grid host-grid-${viewMode}`}>
      {hosts.map((host) => {
        const active = host.id === selectedHostId
        const sessionCount = sessionCountByHost[host.id] || 0
        const connecting = connectingHostIds.includes(host.id)
        const avatarTone = avatarTones[host.id.length % avatarTones.length]
        const trusted = Boolean(host.known_hosts)
        const canConnect = !disabled && !connecting
        const tags = parseTags(host.tags)
        const lastConnected = formatLastConnected(host.last_connected_at)

        return (
          <article
            key={host.id}
            className={`host-card${active ? ' active' : ''}`}
            onClick={() => onSelect(host.id)}
            onContextMenu={(event) => {
              event.preventDefault()
              onSelect(host.id)
              setContextMenu({ host, x: event.clientX, y: event.clientY })
            }}
            onDoubleClick={() => {
              if (canConnect) {
                onConnect(host.id)
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`${host.name || host.id}，${host.username}@${host.address}:${host.port || 22}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (canConnect) {
                  onConnect(host.id)
                }
              }
              if (event.key === ' ') {
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
                </div>
              </div>
              <div className="host-card-badges">
                <button
                  type="button"
                  className={`host-favorite-btn${host.favorite ? ' active' : ''}`}
                  aria-label={`${host.favorite ? '取消收藏' : '收藏'} ${host.name || host.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleFavorite?.(host)
                  }}
                >
                  <Star size={14} />
                </button>
                {sessionCount > 0 ? <span className="pill success">会话 {sessionCount}</span> : null}
                <span className={`host-inline-state ${trusted ? 'trusted' : 'pending'}`}>
                  {trusted ? <ShieldCheck size={13} /> : <ShieldQuestion size={13} />}
                  {trusted ? '已信任' : '待验证'}
                </span>
              </div>
            </div>

            <div className="host-card-meta-row">
              <span>
                <Clock3 size={13} />
                最近连接：{lastConnected}
              </span>
              <span>{host.group || '未分组'}</span>
            </div>

            <div className="host-tag-row" aria-label="主机标签">
              {(tags.length > 0 ? tags : ['未标记']).slice(0, 3).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <div className="host-card-footer">
              <span className="host-card-summary">
                {disabled ? '输入主密码后可继续连接与编辑' : trusted ? '可信指纹已写入' : '首次连接会确认指纹'}
              </span>
              <div
                className="host-card-actions"
                onDoubleClick={(event) => event.stopPropagation()}
              >
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
                  className="icon-button compact host-delete-btn"
                  aria-label={`删除 ${host.name || host.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(host)
                  }}
                >
                  <Trash2 size={14} />
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
      {contextMenu ? (
        <div
          className="host-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label={`${contextMenu.host.name || contextMenu.host.id} 操作菜单`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={disabled || connectingHostIds.includes(contextMenu.host.id)}
            onClick={() => {
              onConnect(contextMenu.host.id)
              setContextMenu(null)
            }}
          >
            <PlugZap size={14} />
            连接
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onEdit(contextMenu.host)
              setContextMenu(null)
            }}
          >
            <PencilLine size={14} />
            编辑
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopyAddress?.(contextMenu.host)
              setContextMenu(null)
            }}
          >
            <Copy size={14} />
            复制地址
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              onDelete(contextMenu.host)
              setContextMenu(null)
            }}
          >
            <Trash2 size={14} />
            删除
          </button>
        </div>
      ) : null}
    </div>
  )
}
