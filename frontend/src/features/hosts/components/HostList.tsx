import { Clock3, FolderOpen, GripVertical, PencilLine, Pin, PlugZap, SearchX, ShieldCheck, ShieldQuestion, Star, Tags, Trash2 } from 'lucide-react'
import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import { HostContextMenu } from './HostContextMenu'
import { getHostSystemProfile } from './hostSystemIcons'

function parseTags(tags?: string) {
  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatLastConnected(value?: string) {
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

interface HostListProps {
  hosts: cmd.Host[]
  hasAnyHosts: boolean
  searchQuery: string
  viewMode?: 'grid' | 'list'
  selectedHostId: string | null
  sessionCountByHost: Record<string, number>
  connectingHostIds: string[]
  onSelect: (id: string) => void
  onConnect: (id: string) => void
  onEdit: (host: cmd.Host) => void
  onDelete: (host: cmd.Host) => void
  onCopyAddress?: (host: cmd.Host) => void
  onToggleFavorite?: (host: cmd.Host) => void
  onTogglePinned?: (host: cmd.Host) => void
  onReorderHosts?: (orderedHostIds: string[]) => void
  disabled: boolean
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
  onTogglePinned,
  onReorderHosts,
  disabled,
}: HostListProps) {
  const [contextMenu, setContextMenu] = useState<{ host: cmd.Host; x: number; y: number } | null>(null)
  const [draggingHostId, setDraggingHostId] = useState<string | null>(null)
  const [dragOverHostId, setDragOverHostId] = useState<string | null>(null)
  const canReorder = Boolean(onReorderHosts) && !disabled

  function clearDragState() {
    setDraggingHostId(null)
    setDragOverHostId(null)
  }

  function handleDragStart(event: DragEvent<HTMLElement>, host: cmd.Host) {
    if (!canReorder) {
      event.preventDefault()
      return
    }

    setContextMenu(null)
    setDraggingHostId(host.id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', host.id)
  }

  function handleDragOver(event: DragEvent<HTMLElement>, host: cmd.Host) {
    if (!canReorder || draggingHostId === host.id) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (draggingHostId) {
      setDragOverHostId(host.id)
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetHost: cmd.Host) {
    if (!canReorder) {
      return
    }

    event.preventDefault()
    const sourceHostId = event.dataTransfer.getData('text/plain') || draggingHostId
    clearDragState()
    if (!sourceHostId || sourceHostId === targetHost.id) {
      return
    }

    const sourceIndex = hosts.findIndex((host) => host.id === sourceHostId)
    if (sourceIndex < 0) {
      return
    }

    const nextHosts = hosts.slice()
    const [movedHost] = nextHosts.splice(sourceIndex, 1)
    const targetIndex = nextHosts.findIndex((host) => host.id === targetHost.id)
    if (!movedHost || targetIndex < 0) {
      return
    }

    const targetRect = event.currentTarget.getBoundingClientRect()
    const shouldInsertAfter = event.clientY > targetRect.top + targetRect.height / 2
    nextHosts.splice(targetIndex + (shouldInsertAfter ? 1 : 0), 0, movedHost)
    onReorderHosts?.(nextHosts.map((host) => host.id))
  }

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
        const trusted = Boolean(host.known_hosts)
        const canConnect = !disabled && !connecting
        const tags = parseTags(host.tags)
        const systemProfile = getHostSystemProfile(host.system_type)
        const SystemIcon = systemProfile.icon
        const lastConnected = formatLastConnected(host.last_connected_at)

        return (
          <article
            key={host.id}
            className={[
              'host-card',
              active ? 'active' : '',
              host.pinned ? 'pinned' : '',
              draggingHostId === host.id ? 'dragging' : '',
              dragOverHostId === host.id && draggingHostId !== host.id ? 'drag-over' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelect(host.id)}
            onContextMenu={(event: MouseEvent<HTMLElement>) => {
              event.preventDefault()
              onSelect(host.id)
              setContextMenu({ host, x: event.clientX, y: event.clientY })
            }}
            onDoubleClick={() => {
              if (canConnect) {
                onConnect(host.id)
              }
            }}
            onDragOver={(event) => handleDragOver(event, host)}
            onDragEnter={(event) => handleDragOver(event, host)}
            onDrop={(event) => handleDrop(event, host)}
            onDragEnd={clearDragState}
            role="button"
            tabIndex={0}
            aria-label={`${host.name || host.id}，${host.username}@${host.address}:${host.port || 22}`}
            onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
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
                <button
                  type="button"
                  className="host-drag-handle"
                  aria-label={`拖拽排序 ${host.name || host.id}`}
                  title="拖拽排序"
                  draggable={canReorder}
                  disabled={!canReorder}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => handleDragStart(event, host)}
                  onDragEnd={clearDragState}
                >
                  <GripVertical size={15} />
                </button>
                <div className={`host-card-avatar system-${systemProfile.id}`} title={systemProfile.label} aria-label={systemProfile.label}>
                  <SystemIcon size={18} />
                </div>
                <div className="host-card-title">
                  <strong>{host.name || host.id}</strong>
                  <span>{host.username}@{host.address}:{host.port || 22}</span>
                </div>
              </div>
              <div className="host-card-badges">
                <button
                  type="button"
                  className={`host-pin-btn${host.pinned ? ' active' : ''}`}
                  aria-label={`${host.pinned ? '取消置顶' : '置顶'} ${host.name || host.id}`}
                  title={host.pinned ? '取消置顶' : '置顶'}
                  disabled={!onTogglePinned}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTogglePinned?.(host)
                  }}
                >
                  <Pin size={14} />
                </button>
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

            <div className="host-card-detail-grid">
              <span className="host-card-detail-item">
                <Clock3 size={13} />
                <span>最近连接</span>
                <strong>{lastConnected}</strong>
              </span>
              <span className="host-card-detail-item">
                <FolderOpen size={13} />
                <span>分组</span>
                <strong>{host.group || '未分组'}</strong>
              </span>
            </div>

            <div className="host-card-footer">
              <div className="host-tag-row" aria-label="主机标签">
                <Tags size={13} />
                {(tags.length > 0 ? tags : ['未标记']).slice(0, 2).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div
                className="host-card-actions"
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="host-card-action-btn host-delete-btn"
                  aria-label={`删除 ${host.name || host.id}`}
                  title="删除"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(host)
                  }}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  className="host-card-action-btn"
                  aria-label="编辑"
                  title="编辑"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(host)
                  }}
                >
                  <PencilLine size={15} />
                </button>
                <button
                  type="button"
                  className="primary-button compact host-connect-btn"
                  title={connecting ? '连接中' : '连接'}
                  onClick={(event) => {
                    event.stopPropagation()
                    onConnect(host.id)
                  }}
                  disabled={disabled || connecting}
                >
                  <PlugZap size={14} />
                  <span className="host-connect-label">{connecting ? '连接中' : '连接'}</span>
                </button>
              </div>
            </div>
          </article>
        )
      })}
      {contextMenu ? (
        <HostContextMenu
          host={contextMenu.host}
          x={contextMenu.x}
          y={contextMenu.y}
          disabled={disabled}
          connectingHostIds={connectingHostIds}
          onConnect={onConnect}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopyAddress={onCopyAddress}
          onTogglePinned={onTogglePinned}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  )
}
