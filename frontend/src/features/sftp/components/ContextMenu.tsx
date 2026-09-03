import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive,
  Eye,
  EyeOff,
  FileArchive,
  FileEdit,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import {
  getContextMenuPosition,
  getContextMenuTitle,
  getScopeLabel,
  isArchiveFile,
  type ContextMenuState,
} from '../sftpUtils'

interface ExtendedContextMenuState extends ContextMenuState {
  transferLabel?: string
  deleteSelectionLabel?: string
  hiddenFilesLabel?: string
}

interface ContextMenuProps {
  state: ExtendedContextMenuState | null
  onClose: () => void
  onAction: (action: string) => void
}

const VIEWPORT_GAP = 12

export default function ContextMenu({ state, onClose, onAction }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number }>(() =>
    state ? getContextMenuPosition(state) : { left: 0, top: 0 }
  )

  // 用真实 DOM 尺寸重新钳位，避免估算高度不准导致菜单在视口边缘被截断。
  // 注意：菜单有 scale(0.96) 入场动画，getBoundingClientRect 会返回缩放中的
  // 视觉尺寸（偏小约 4%），因此改用不受 transform 影响的 offsetWidth/offsetHeight。
  useLayoutEffect(() => {
    if (!state || !menuRef.current) {
      return
    }

    const menuWidth = menuRef.current.offsetWidth
    const menuHeight = menuRef.current.offsetHeight
    const maxX = Math.max(VIEWPORT_GAP, window.innerWidth - menuWidth - VIEWPORT_GAP)
    const maxY = Math.max(VIEWPORT_GAP, window.innerHeight - menuHeight - VIEWPORT_GAP)
    const nextLeft = Math.min(state.x, maxX)
    const nextTop = Math.min(state.y, maxY)

    setPosition((prev) => (prev.left === nextLeft && prev.top === nextTop ? prev : { left: nextLeft, top: nextTop }))
  }, [state])

  if (!state) {
    return null
  }

  const isArchive = state.entry ? isArchiveFile(state.entry.name) : false

  return createPortal(
    <div
      ref={menuRef}
      className="sftp-context-menu"
      role="menu"
      aria-label={`${getScopeLabel(state.scope)}${state.entry ? '条目' : '工作区'}菜单`}
      style={position}
    >
      <div className="sftp-context-menu-title">{getContextMenuTitle(state)}</div>
      {state.useSelectionActions ? (
        <>
          {state.canTransferSelection ? (
            <button type="button" role="menuitem" onClick={() => onAction('transfer')}>
              <Upload size={14} />
              <span>{state.transferLabel}</span>
            </button>
          ) : null}
          {state.canClearSelection ? (
            <button type="button" role="menuitem" onClick={() => onAction('clear-selection')}>
              <X size={14} />
              <span>清空选择</span>
            </button>
          ) : null}
          {state.canDeleteSelection ? (
            <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete-selection')}>
              <Trash2 size={14} />
              <span>{state.deleteSelectionLabel}</span>
            </button>
          ) : null}
        </>
      ) : state.entry?.isDir ? (
        <button type="button" role="menuitem" onClick={() => onAction('open')}>
          <FolderOpen size={14} />
          <span>打开目录</span>
        </button>
      ) : null}

      {/* 解压选项：如果是压缩文件 */}
      {!state.useSelectionActions && state.entry && !state.entry.parent && isArchive && (
        <>
          <button type="button" role="menuitem" className="accent" onClick={() => onAction('extract')}>
            <FileArchive size={14} />
            <span>解压到当前目录</span>
          </button>
          <button type="button" role="menuitem" onClick={() => onAction('extract-subfolder')}>
            <Archive size={14} />
            <span>解压到同名文件夹</span>
          </button>
          <div className="sftp-context-menu-separator" />
        </>
      )}

      {/* 压缩选项 */}
      {!state.useSelectionActions && state.entry && !state.entry.parent && (
        <>
          <button type="button" role="menuitem" onClick={() => onAction('compress-targz')}>
            <Archive size={14} />
            <span>压缩为 .tar.gz</span>
          </button>
          <button type="button" role="menuitem" onClick={() => onAction('compress-zip')}>
            <Archive size={14} />
            <span>压缩为 .zip</span>
          </button>
          <div className="sftp-context-menu-separator" />
        </>
      )}

      <button type="button" role="menuitem" onClick={() => onAction('mkdir')}>
        <FolderPlus size={14} />
        <span>新建目录</span>
      </button>

      {!state.useSelectionActions && state.entry && !state.entry.parent && !state.entry.isDir ? (
        <button type="button" role="menuitem" onClick={() => onAction('edit')}>
          <FileEdit size={14} />
          <span>编辑文件</span>
        </button>
      ) : null}

      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" onClick={() => onAction('rename')}>
          <Pencil size={14} />
          <span>重命名</span>
        </button>
      ) : null}

      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" onClick={() => onAction('chmod')}>
          <Shield size={14} />
          <span>修改权限</span>
        </button>
      ) : null}

      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete')}>
          <Trash2 size={14} />
          <span>删除</span>
        </button>
      ) : null}

      <div className="sftp-context-menu-separator" />

      <button type="button" role="menuitem" onClick={() => onAction('refresh')}>
        <RefreshCw size={14} />
        <span>刷新</span>
      </button>

      <button type="button" role="menuitem" onClick={() => onAction('toggle-hidden-files')}>
        {state.hiddenFilesLabel?.includes('隐藏') ? <EyeOff size={14} /> : <Eye size={14} />}
        <span>{state.hiddenFilesLabel}</span>
      </button>

      <div className="sftp-context-menu-separator" />

      <button type="button" role="menuitem" onClick={onClose}>
        <X size={14} />
        <span>关闭菜单</span>
      </button>
    </div>,
    // 渲染到 body：祖先 .page-shell 上的 backdrop-filter 会把 position: fixed
    // 的包含块从视口改为该元素，导致菜单坐标系偏离视口并被 overflow: hidden 裁剪。
    // Portal 到 body 后 fixed 重新相对视口，clientX/clientY 与钳位计算完全一致。
    document.body
  )
}