import { X } from 'lucide-react'
import type { LocalSSHKey } from '@/lib/backend'
import type { ImportLocalKeyForm } from '../keychainConfig'

interface ImportLocalKeyDrawerProps {
  form: ImportLocalKeyForm
  localKey: LocalSSHKey
  error: string | null
  operationLoading: boolean
  onClose: () => void
  onSubmit: () => void
  onFormChange: (updater: (current: ImportLocalKeyForm) => ImportLocalKeyForm) => void
}

export default function ImportLocalKeyDrawer({
  form,
  localKey,
  error,
  operationLoading,
  onClose,
  onSubmit,
  onFormChange,
}: ImportLocalKeyDrawerProps) {
  return (
    <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="import-local-key-title">
      <div className="keychain-drawer-head">
        <div>
          <h3 id="import-local-key-title">导入本机 SSH 密钥</h3>
          <p>从 ~/.ssh 读取私钥并加密保存到保险箱</p>
        </div>
        <button type="button" className="toolbar-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="keychain-drawer-body">
        {error && <div className="error-message">{error}</div>}

        <label>
          密钥标签
          <input
            type="text"
            value={form.label}
            onChange={(event) => onFormChange((current) => ({ ...current, label: event.target.value }))}
            placeholder="例如：MacBook 本机密钥"
            disabled={operationLoading}
          />
        </label>

        <label>
          本机路径
          <input
            type="text"
            value={localKey.path}
            readOnly
          />
        </label>

        <label>
          密码短语（可选）
          <input
            type="password"
            value={form.passphrase}
            onChange={(event) => onFormChange((current) => ({ ...current, passphrase: event.target.value }))}
            placeholder={localKey.encrypted ? '该私钥已加密，请输入密码短语' : '如果私钥有密码保护'}
            disabled={operationLoading}
          />
        </label>

        <p className="form-hint">
          导入后会生成一条保险箱凭据；后续上传到服务器、绑定主机和连接都会使用保险箱中的加密副本。
        </p>
      </div>

      <div className="keychain-drawer-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={onClose}
          disabled={operationLoading}
        >
          取消
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onSubmit}
          disabled={!form.label.trim() || operationLoading}
        >
          {operationLoading ? '导入中...' : '导入保险箱'}
        </button>
      </div>
    </aside>
  )
}
