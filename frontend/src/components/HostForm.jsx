import { PencilLine, PlusCircle, X } from 'lucide-react'

const initialState = {
  id: '',
  name: '',
  address: '',
  port: '22',
  username: '',
  password: '',
  privateKey: '',
}

export function createInitialHostForm() {
  return { ...initialState }
}

export function createHostFormFromHost(host) {
  return {
    id: host?.id || '',
    name: host?.name || '',
    address: host?.address || '',
    port: String(host?.port || 22),
    username: host?.username || '',
    password: '',
    privateKey: '',
  }
}

export default function HostForm({
  mode,
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  onClose,
}) {
  const isEdit = mode === 'edit'

  function update(field, nextValue) {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  return (
    <form className="form-panel" onSubmit={onSubmit}>
      <div className="form-toggle">
        <div>
          <span className="panel-kicker">{isEdit ? '编辑主机' : '新增主机'}</span>
          <div className="panel-title form-title">
            {isEdit ? <PencilLine size={16} /> : <PlusCircle size={16} />}
            <span>{isEdit ? '更新连接配置' : '保存新的 SSH 主机'}</span>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭主机表单">
          <X size={16} />
        </button>
      </div>

      <div className="form-body">
        <div className="form-grid">
          <label>
            主机 ID
            <input
              value={value.id}
              onChange={(event) => update('id', event.target.value)}
              placeholder="prod-hk-01"
              required
              disabled={isEdit}
            />
          </label>

          <label>
            显示名称
            <input
              value={value.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Production HK"
            />
          </label>

          <label>
            地址
            <input
              value={value.address}
              onChange={(event) => update('address', event.target.value)}
              placeholder="10.0.0.8"
              required
            />
          </label>

          <label>
            端口
            <input
              value={value.port}
              onChange={(event) => update('port', event.target.value)}
              inputMode="numeric"
              placeholder="22"
            />
          </label>

          <label>
            用户名
            <input
              value={value.username}
              onChange={(event) => update('username', event.target.value)}
              placeholder="root"
              required
            />
          </label>

          <label>
            密码
            <input
              type="password"
              value={value.password}
              onChange={(event) => update('password', event.target.value)}
              placeholder={isEdit ? '留空则保留现有密码' : '可选'}
            />
          </label>
        </div>

        <label>
          私钥
          <textarea
            value={value.privateKey}
            onChange={(event) => update('privateKey', event.target.value)}
            placeholder={isEdit ? '留空则保留现有私钥' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
            rows={5}
          />
        </label>

        <p className="form-hint">
          {isEdit
            ? '编辑时如果密码或私钥留空，后端会保留原有的加密凭据。'
            : '首次连接未知主机时，ZenTerm 会弹出指纹确认框；信任后会自动写入本地 config.zen。'}
        </p>

        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={disabled || busy}>
            {busy ? (isEdit ? '更新中...' : '保存中...') : (isEdit ? '保存修改' : '加密保存')}
          </button>
        </div>
      </div>
    </form>
  )
}
