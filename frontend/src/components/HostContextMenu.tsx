import { Copy, PencilLine, Pin, PlugZap, Trash2 } from 'lucide-react'
import { useEffect, type MouseEvent } from 'react'
import { cmd } from '../wailsjs/wailsjs/go/models'

// 主机右键菜单：从 HostList 拆出，自包含全局关闭监听（点击/Esc/resize）/ host context menu, extracted from HostList and self-contained with global dismiss listeners (click/Esc/resize).

interface HostContextMenuProps {
  host: cmd.Host
  x: number
  y: number
  disabled: boolean
  connectingHostIds: string[]
  onConnect: (id: string) => void
  onEdit: (host: cmd.Host) => void
  onDelete: (host: cmd.Host) => void
  onCopyAddress?: (host: cmd.Host) => void
  onTogglePinned?: (host: cmd.Host) => void
  onClose: () => void
}

export function HostContextMenu({
  host,
  x,
  y,
  disabled,
  connectingHostIds,
  onConnect,
  onEdit,
  onDelete,
  onCopyAddress,
  onTogglePinned,
  onClose,
}: HostContextMenuProps) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('click', onClose)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div
      className="host-context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label={`${host.name || host.id} 操作菜单`}
      onClick={(event: MouseEvent) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={disabled || connectingHostIds.includes(host.id)}
        onClick={() => {
          onConnect(host.id)
          onClose()
        }}
      >
        <PlugZap size={14} />
        连接
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onEdit(host)
          onClose()
        }}
      >
        <PencilLine size={14} />
        编辑
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCopyAddress?.(host)
          onClose()
        }}
      >
        <Copy size={14} />
        复制地址
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!onTogglePinned}
        onClick={() => {
          onTogglePinned?.(host)
          onClose()
        }}
      >
        <Pin size={14} />
        {host.pinned ? '取消置顶' : '置顶'}
      </button>
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => {
          onDelete(host)
          onClose()
        }}
      >
        <Trash2 size={14} />
        删除
      </button>
    </div>
  )
}
