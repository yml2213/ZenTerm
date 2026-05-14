import { getContextMenuPosition, getContextMenuTitle, getScopeLabel, type ContextMenuState } from '../../lib/sftpUtils'

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
              {state.transferLabel}
            </button>
          ) : null}
          {state.canClearSelection ? (
            <button type="button" role="menuitem" onClick={() => onAction('clear-selection')}>
              清空选择
            </button>
          ) : null}
          {state.canDeleteSelection ? (
            <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete-selection')}>
              {state.deleteSelectionLabel}
            </button>
          ) : null}
        </>
      ) : state.entry?.isDir ? (
        <button type="button" role="menuitem" onClick={() => onAction('open')}>
          打开目录
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={() => onAction('mkdir')}>
        新建目录
      </button>
      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" onClick={() => onAction('rename')}>
          重命名
        </button>
      ) : null}
      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete')}>
          删除
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={() => onAction('refresh')}>
        刷新
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('toggle-hidden-files')}>
        {state.hiddenFilesLabel}
      </button>
      <div className="sftp-context-menu-separator" />
      <button type="button" role="menuitem" onClick={onClose}>
        关闭菜单
      </button>
    </div>
  )
}
