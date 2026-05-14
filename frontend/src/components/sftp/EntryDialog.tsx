import { getScopeLabel, buildDialogDescription, type DialogState } from '../../lib/sftpUtils'

interface ExtendedDialogState extends DialogState {
  value?: string
  direction?: 'upload' | 'download'
}

interface EntryDialogProps {
  state: ExtendedDialogState | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  onChange: (value: string) => void
}

export default function EntryDialog({ state, busy, onClose, onConfirm, onChange }: EntryDialogProps) {
  if (!state) {
    return null
  }

  const isDelete = state.type === 'delete'
  const isDeleteBatch = state.type === 'delete-batch'
  const isRename = state.type === 'rename'
  const isCreate = state.type === 'mkdir'
  const isOverwriteTransfer = state.type === 'overwrite-transfer'
  const title = isCreate
    ? `在${getScopeLabel(state.scope)}创建目录`
    : isOverwriteTransfer
      ? `${state.direction === 'upload' ? '上传' : '下载'}覆盖确认`
      : isDeleteBatch
        ? `删除${getScopeLabel(state.scope)}所选条目`
        : isRename
          ? `重命名${getScopeLabel(state.scope)}条目`
          : `删除${getScopeLabel(state.scope)}条目`

  const confirmLabel = isCreate
    ? '确认创建'
    : isOverwriteTransfer
      ? '覆盖并继续'
      : isDeleteBatch
        ? '删除所选'
        : isRename
          ? '确认重命名'
          : '确认删除'

  const description = buildDialogDescription(state)
  const hideInput = isDelete || isDeleteBatch || isOverwriteTransfer

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-narrow sftp-action-modal">
        <div className="modal-eyebrow">
          <span className="panel-kicker">SFTP</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭操作弹窗">
            ×
          </button>
        </div>

        <div className="sftp-action-dialog-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>

        {hideInput ? null : (
          <label className="modal-form-stack">
            <span>{isCreate ? '目录名称' : '新名称'}</span>
            <input
              autoFocus
              value={state.value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={isCreate ? '例如 logs' : '请输入新名称'}
            />
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={`primary-button${isDelete || isDeleteBatch ? ' danger' : ''}${isOverwriteTransfer ? ' warning' : ''}`}
            onClick={onConfirm}
            disabled={busy || (!hideInput && !String(state.value || '').trim())}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
