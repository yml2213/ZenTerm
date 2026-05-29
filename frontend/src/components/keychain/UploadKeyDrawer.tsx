import { X } from 'lucide-react'
import { main } from '../../wailsjs/wailsjs/go/models'
import type { UploadKeyForm } from './keychainConfig'

type Host = main.Host

interface UploadKeyDrawerProps {
  form: UploadKeyForm
  hosts: Host[]
  error: string | null
  operationLoading: boolean
  onClose: () => void
  onSubmit: () => void
  onFormChange: (updater: (current: UploadKeyForm) => UploadKeyForm) => void
}

export default function UploadKeyDrawer({
  form,
  hosts,
  error,
  operationLoading,
  onClose,
  onSubmit,
  onFormChange,
}: UploadKeyDrawerProps) {
  return (
    <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="upload-key-title">
      <div className="keychain-drawer-head">
        <div>
          <h3 id="upload-key-title">上传 SSH 公钥</h3>
          <p>写入远端 authorized_keys，并可自动切换主机认证方式</p>
        </div>
        <button type="button" className="toolbar-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="keychain-drawer-body">
        {error && <div className="error-message">{error}</div>}

        <label>
          目标主机
          <select
            value={form.hostId}
            onChange={(event) => onFormChange((current) => ({ ...current, hostId: event.target.value }))}
            disabled={operationLoading}
          >
            <option value="">选择主机...</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name || host.id} ({host.username}@{host.address})
              </option>
            ))}
          </select>
        </label>

        <label className="remember-toggle">
          <input
            type="checkbox"
            checked={form.bindAfterUpload}
            onChange={(event) => onFormChange((current) => ({ ...current, bindAfterUpload: event.target.checked }))}
            disabled={operationLoading}
          />
          <span>
            <strong>上传后绑定此凭据</strong>
            <small>成功后主机将改用该密钥登录</small>
          </span>
        </label>

        <p className="form-hint">
          上传会使用目标主机当前保存的认证方式先登录远端，然后追加公钥；不会上传私钥。
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
          disabled={!form.hostId || operationLoading}
        >
          {operationLoading ? '上传中...' : '上传公钥'}
        </button>
      </div>
    </aside>
  )
}
