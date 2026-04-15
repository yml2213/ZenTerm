import { useEffect, useState } from 'react'
import { PencilLine, PlusCircle, X, KeyRound } from 'lucide-react'
import { getCredentials } from '../lib/backend'

const initialState = {
  id: '',
  name: '',
  address: '',
  port: '22',
  username: '',
  password: '',
  privateKey: '',
  credentialId: '',
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
    credentialId: host?.credential_id || '',
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
  const [credentials, setCredentials] = useState([])
  const [loadingCredentials, setLoadingCredentials] = useState(false)

  useEffect(() => {
    loadCredentials()
  }, [])

  async function loadCredentials() {
    setLoadingCredentials(true)
    try {
      const creds = await getCredentials()
      setCredentials(creds || [])
    } catch (err) {
      console.error('加载凭据失败:', err)
    } finally {
      setLoadingCredentials(false)
    }
  }

  function update(field, nextValue) {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  function handleCredentialSelect(credentialId) {
    update('credentialId', credentialId)
    if (credentialId) {
      update('password', '')
      update('privateKey', '')
    }
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
            认证方式
            <select
              value={value.credentialId ? 'credential' : value.privateKey ? 'key' : 'password'}
              onChange={(event) => {
                const authType = event.target.value
                if (authType === 'credential') {
                  handleCredentialSelect(credentials[0]?.id || '')
                } else if (authType === 'key') {
                  handleCredentialSelect('')
                  update('password', '')
                } else {
                  handleCredentialSelect('')
                  update('privateKey', '')
                }
              }}
              disabled={loadingCredentials}
            >
              <option value="password">密码认证</option>
              <option value="key">密钥认证</option>
              {credentials.length > 0 && (
                <option value="credential">从凭据中心选择</option>
              )}
            </select>
          </label>

          {value.credentialId && (
            <label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <KeyRound size={14} />
                <span>选择凭据</span>
              </div>
              <select
                value={value.credentialId}
                onChange={(event) => handleCredentialSelect(event.target.value)}
                disabled={loadingCredentials}
              >
                <option value="">选择凭据...</option>
                {credentials.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    {cred.label} ({cred.algorithm})
                  </option>
                ))}
              </select>
            </label>
          )}

          {!value.credentialId && (
            <>
              <label>
                密码
                <input
                  type="password"
                  value={value.password}
                  onChange={(event) => update('password', event.target.value)}
                  placeholder={isEdit ? '留空则保留现有密码' : '可选'}
                />
              </label>

              <label>
                私钥
                <textarea
                  value={value.privateKey}
                  onChange={(event) => update('privateKey', event.target.value)}
                  placeholder={isEdit ? '留空则保留现有私钥' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                  rows={5}
                />
              </label>
            </>
          )}
        </div>

        <p className="form-hint">
          {isEdit
            ? '编辑时如果密码、私钥或凭据留空，后端会保留原有的加密凭据。'
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
