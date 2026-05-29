import { X } from 'lucide-react'
import type { ImportKeyForm } from './keychainConfig'

interface ImportKeyDrawerProps {
  form: ImportKeyForm
  error: string | null
  operationLoading: boolean
  onClose: () => void
  onSubmit: () => void
  onFieldChange: <K extends keyof ImportKeyForm>(field: K, value: ImportKeyForm[K]) => void
}

export default function ImportKeyDrawer({
  form,
  error,
  operationLoading,
  onClose,
  onSubmit,
  onFieldChange,
}: ImportKeyDrawerProps) {
  return (
    <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="import-key-title">
      <div className="keychain-drawer-head">
        <div>
          <h3 id="import-key-title">导入 SSH 密钥</h3>
          <p>导入现有的 SSH 私钥</p>
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
            onChange={(event) => onFieldChange('label', event.target.value)}
            placeholder="例如：GitHub、公司服务器"
            disabled={operationLoading}
          />
        </label>

        <label>
          私钥内容
          <textarea
            value={form.privateKeyPEM}
            onChange={(event) => onFieldChange('privateKeyPEM', event.target.value)}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
            rows={8}
            disabled={operationLoading}
          />
        </label>

        <label>
          密码短语（可选）
          <input
            type="password"
            value={form.passphrase}
            onChange={(event) => onFieldChange('passphrase', event.target.value)}
            placeholder="如果私钥有密码保护"
            disabled={operationLoading}
          />
        </label>
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
          disabled={!form.label.trim() || !form.privateKeyPEM.trim() || operationLoading}
        >
          {operationLoading ? '导入中...' : '导入并保存'}
        </button>
      </div>
    </aside>
  )
}
