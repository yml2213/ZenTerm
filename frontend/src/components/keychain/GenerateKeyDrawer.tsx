import { X } from 'lucide-react'
import {
  ecdsaCurves,
  keyAlgorithms,
  rsaKeySizes,
  type GenerateKeyForm,
} from './keychainConfig'

interface GenerateKeyDrawerProps {
  form: GenerateKeyForm
  error: string | null
  operationLoading: boolean
  onClose: () => void
  onSubmit: () => void
  onFieldChange: <K extends keyof GenerateKeyForm>(field: K, value: GenerateKeyForm[K]) => void
}

export default function GenerateKeyDrawer({
  form,
  error,
  operationLoading,
  onClose,
  onSubmit,
  onFieldChange,
}: GenerateKeyDrawerProps) {
  return (
    <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="generate-key-title">
      <div className="keychain-drawer-head">
        <div>
          <h3 id="generate-key-title">生成 SSH 密钥</h3>
          <p>生成新的 SSH 密钥对并安全存储</p>
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

        <div className="keychain-form-block">
          <span>密钥算法</span>
          <div className="keychain-algorithm-group">
            {keyAlgorithms.map((algorithm) => (
              <button
                key={algorithm.id}
                type="button"
                className={`keychain-algorithm-chip${form.algorithm === algorithm.id ? ' active' : ''}`}
                onClick={() => {
                  onFieldChange('algorithm', algorithm.id)
                  if (algorithm.id === 'rsa' && !form.keyBits) {
                    onFieldChange('keyBits', 2048)
                  } else if (algorithm.id === 'ecdsa' && !form.keyBits) {
                    onFieldChange('keyBits', 384)
                  } else if (algorithm.id === 'ed25519') {
                    onFieldChange('keyBits', null)
                  }
                }}
                disabled={operationLoading}
              >
                {algorithm.label}
              </button>
            ))}
          </div>
        </div>

        {(form.algorithm === 'rsa' || form.algorithm === 'ecdsa') && (
          <div className="keychain-form-block">
            <span>密钥长度</span>
            <div className="keychain-algorithm-group">
              {(form.algorithm === 'rsa' ? rsaKeySizes : ecdsaCurves).map((size) => (
                <button
                  key={size.value}
                  type="button"
                  className={`keychain-algorithm-chip${form.keyBits === size.value ? ' active' : ''}`}
                  onClick={() => onFieldChange('keyBits', size.value)}
                  disabled={operationLoading}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label>
          密码短语（可选，保存于保险箱）
          <input
            type="password"
            value={form.passphrase}
            onChange={(event) => onFieldChange('passphrase', event.target.value)}
            placeholder="用于加密私钥"
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
          disabled={!form.label.trim() || operationLoading}
        >
          {operationLoading ? '生成中...' : '生成并保存'}
        </button>
      </div>
    </aside>
  )
}
