import {
  Archive,
  Eye,
  EyeOff,
  FileArchive,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
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

export default function ContextMenu({ state, onClose, onAction }: ContextMenuProps) {
  if (!state) {
    return null
  }

  const position = getContextMenuPosition(state)
  const isArchive = state.entry ? isArchiveFile(state.entry.name) : false

  return (
    <div
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

      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" onClick={() => onAction('rename')}>
          <Pencil size={14} />
          <span>重命名</span>
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
    </div>
  )
}

