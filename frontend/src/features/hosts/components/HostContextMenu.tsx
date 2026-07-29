import { Copy, PencilLine, Pin, PlugZap, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { cmd } from '@/wailsjs/wailsjs/go/models'

// 主机右键菜单：从 HostList 拆出，自包含全局关闭监听（点击/Esc/resize）/ host context menu, extracted from HostList and self-contained with global dismiss listeners (click/Esc/resize).

const MENU_GAP = 6
const VIEWPORT_MARGIN = 8

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}

function getAxisPosition(pointer: number, menuSize: number, viewportSize: number) {
  const afterPointer = pointer + MENU_GAP
  const beforePointer = pointer - menuSize - MENU_GAP

  if (afterPointer + menuSize + VIEWPORT_MARGIN <= viewportSize) {
    return afterPointer
  }

  if (beforePointer >= VIEWPORT_MARGIN) {
    return beforePointer
  }

  return clamp(afterPointer, VIEWPORT_MARGIN, viewportSize - menuSize - VIEWPORT_MARGIN)
}

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
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x + MENU_GAP, top: y + MENU_GAP, measured: false })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) {
      return
    }

    // 根据菜单真实尺寸计算位置，避免靠近窗口边缘或滚动容器时发生错位。
    const rect = menu.getBoundingClientRect()
    const nextLeft = getAxisPosition(x, rect.width, window.innerWidth)
    const nextTop = getAxisPosition(y, rect.height, window.innerHeight)

    setPosition({
      left: nextLeft,
      top: nextTop,
      measured: true,
    })
  }, [x, y, host.id])

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('click', onClose)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const menuStyle: CSSProperties = {
    left: position.left,
    top: position.top,
    visibility: position.measured ? 'visible' : 'hidden',
  }

  return createPortal(
    <div
      ref={menuRef}
      className="host-context-menu"
      style={menuStyle}
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
    </div>,
    document.body,
  )
}
