import { PlusCircle } from 'lucide-react'

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

export default function HostForm({ value, onChange, onSubmit, disabled, busy }) {
  function update(field, nextValue) {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="panel-title">
        <PlusCircle size={18} />
        <span>添加主机</span>
      </div>

      <div className="form-grid">
        <label>
          主机 ID
          <input
            value={value.id}
            onChange={(event) => update('id', event.target.value)}
            placeholder="prod-hk-01"
            required
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
            placeholder="可选"
          />
        </label>
      </div>

      <label>
        私钥
        <textarea
          value={value.privateKey}
          onChange={(event) => update('privateKey', event.target.value)}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          rows={5}
        />
      </label>

      <button type="submit" className="primary-button" disabled={disabled || busy}>
        {busy ? '保存中...' : '加密保存'}
      </button>

      <p className="form-hint">
        首次连接未知主机时，ZenTerm 会弹出指纹确认框；信任后会自动写入本地 `config.zen`。
      </p>
    </form>
  )
}
