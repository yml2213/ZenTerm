import { useEffect, useState, type FormEvent } from 'react'
import {
  FileKey2,
  Folder,
  KeyRound,
  MapPin,
  MonitorCog,
  Plus,
  PencilLine,
  PlusCircle,
  Server,
  ShieldCheck,
  Star,
  Tags,
  UserRound,
  X,
} from 'lucide-react'
import { getCredentials } from '../lib/backend'
import type { HostFormModel } from '../types'
import { main } from '../wailsjs/wailsjs/go/models'

type Credential = main.Credential
type Host = main.Host

const initialState: HostFormModel = {
  id: '',
  name: '',
  address: '',
  port: '22',
  username: '',
  group: '',
  tags: '',
  favorite: false,
  systemType: '',
  systemTypeSource: 'auto',
  authType: 'password',
  password: '',
  privateKey: '',
  credentialId: '',
}

export function createInitialHostForm(): HostFormModel {
  return { ...initialState }
}

export function createHostFormFromHost(host: Host | null | undefined): HostFormModel {
  const systemTypeSource = host?.system_type_source
  return {
    id: host?.id || '',
    name: host?.name || '',
    address: host?.address || '',
    port: String(host?.port || 22),
    username: host?.username || '',
    group: host?.group || '',
    tags: host?.tags || '',
    favorite: Boolean(host?.favorite),
    systemType: host?.system_type || '',
    systemTypeSource: (systemTypeSource === 'manual' ? 'manual' : 'auto') as 'auto' | 'manual',
    authType: host?.credential_id ? 'credential' : 'password',
    password: '',
    privateKey: '',
    credentialId: host?.credential_id || '',
  }
}

interface HostFormProps {
  mode: 'create' | 'edit'
  value: HostFormModel
  onChange: (value: HostFormModel) => void
  onSubmit: (event: FormEvent) => void
  disabled: boolean
  busy: boolean
  onClose: () => void
}

export default function HostForm({
  mode,
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  onClose,
}: HostFormProps) {
  const isEdit = mode === 'edit'
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loadingCredentials, setLoadingCredentials] = useState(false)
  const [authMenuOpen, setAuthMenuOpen] = useState(false)

  async function loadCredentials() {
    setLoadingCredentials(true)
    try {
      const creds = await getCredentials()
      setCredentials(creds || [])
    } finally {
      setLoadingCredentials(false)
    }
  }

  useEffect(() => {
    loadCredentials()
  }, [])

  function update(field: keyof HostFormModel, nextValue: string | boolean) {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  function patch(nextFields: Partial<HostFormModel>) {
    onChange({
      ...value,
      ...nextFields,
    })
  }

  function handleCredentialSelect(credentialId: string) {
    patch({
      credentialId,
      ...(credentialId ? { password: '', privateKey: '' } : {}),
    })
  }

  function selectPasswordAuth() {
    patch({
      authType: 'password',
      credentialId: '',
      privateKey: '',
    })
    setAuthMenuOpen(false)
  }

  function selectPrivateKeyAuth() {
    patch({
      authType: 'key',
      credentialId: '',
      password: '',
    })
    setAuthMenuOpen(false)
  }

  function selectCredentialAuth() {
    patch({
      authType: 'credential',
      credentialId: credentials[0]?.id || '',
      password: '',
      privateKey: '',
    })
    setAuthMenuOpen(false)
  }

  function handleSystemTypeChange(nextValue: string) {
    if (nextValue === 'auto') {
      patch({
        systemTypeSource: 'auto',
      })
      return
    }

    patch({
      systemType: nextValue,
      systemTypeSource: 'manual',
    })
  }

  const systemTypeValue = value.systemTypeSource === 'manual' ? value.systemType : 'auto'
  const autoSystemLabel = value.systemType ? `自动检测（当前 ${value.systemType}）` : '自动检测'

  return (
    <form className="form-panel host-drawer-form" onSubmit={onSubmit}>
      <header className="host-drawer-header">
        <div>
          <span className="panel-kicker">{isEdit ? '编辑主机' : '新增主机'}</span>
          <div className="panel-title form-title">
            {isEdit ? <PencilLine size={16} /> : <PlusCircle size={16} />}
            <span>{isEdit ? '主机详情' : '保存新的 SSH 主机'}</span>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭主机表单">
          <X size={16} />
        </button>
      </header>

      <div className="host-drawer-body">
        <section className="host-form-section">
          <div className="host-form-section-title">
            <Server size={15} />
            <span>通用</span>
          </div>
          <label>
            <span className="sr-only">主机 ID</span>
            <input
              value={value.id}
              onChange={(event) => update('id', event.target.value)}
              placeholder="主机 ID（例如：prod-hk-01）"
              required
              disabled={isEdit}
            />
          </label>
          <label>
            <span className="sr-only">显示名称</span>
            <input
              value={value.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="名称（例如：Production Server）"
            />
          </label>
          <div className="host-form-icon-row">
            <span className="host-form-row-icon" aria-hidden="true">
              <Folder size={15} />
            </span>
            <label>
              <span className="sr-only">分组</span>
              <input
                value={value.group}
                onChange={(event) => update('group', event.target.value)}
                placeholder="父级 Group"
              />
            </label>
          </div>
          <div className="host-form-icon-row">
            <span className="host-form-row-icon" aria-hidden="true">
              <Tags size={15} />
            </span>
            <label>
              <span className="sr-only">标签</span>
              <input
                value={value.tags}
                onChange={(event) => update('tags', event.target.value)}
                placeholder="Add tags..."
              />
            </label>
          </div>
          <button
            type="button"
            className={`host-form-switch${value.favorite ? ' active' : ''}`}
            aria-label="收藏主机"
            aria-pressed={value.favorite}
            onClick={() => update('favorite', !value.favorite)}
          >
            <span>
              <Star size={15} />
              收藏主机
            </span>
            <strong>{value.favorite ? '已启用' : '已禁用'}</strong>
          </button>
        </section>

        <section className="host-form-section">
          <div className="host-form-section-title">
            <MapPin size={15} />
            <span>地址</span>
          </div>
          <div className="host-form-icon-row">
            <span className="host-form-row-icon primary" aria-hidden="true">
              <Server size={16} />
            </span>
            <label>
              <span className="sr-only">地址</span>
              <input
                value={value.address}
                onChange={(event) => update('address', event.target.value)}
                placeholder="IP 或主机名"
                required
              />
            </label>
          </div>
        </section>

        <section className="host-form-section">
          <div className="host-form-section-title">
            <KeyRound size={15} />
            <span>端口与凭据</span>
          </div>
          <label className="host-form-port-control">
            <span className="sr-only">端口</span>
            <span className="host-form-port-prefix">SSH on</span>
              <input
                aria-label="端口"
                value={value.port}
                onChange={(event) => update('port', event.target.value)}
                inputMode="numeric"
                placeholder="22"
              />
            <span className="host-form-port-suffix">端口</span>
          </label>
          <div className="host-form-icon-row">
            <span className="host-form-row-icon" aria-hidden="true">
              <UserRound size={15} />
            </span>
            <label>
              <span className="sr-only">用户名</span>
              <input
                value={value.username}
                onChange={(event) => update('username', event.target.value)}
                placeholder="root"
                required
              />
            </label>
          </div>

          {value.authType !== 'credential' && (
            <label>
              <span className="sr-only">密码</span>
              <input
                type="password"
                value={value.password}
                onChange={(event) => update('password', event.target.value)}
                placeholder={isEdit ? '留空则保留现有密码' : '可选'}
                disabled={value.authType === 'key'}
              />
            </label>
          )}

          {value.credentialId && (
            <label>
              <span className="sr-only">已保存凭据</span>
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

          {!value.credentialId && value.authType === 'key' ? (
            <label>
              <span className="sr-only">私钥</span>
              <textarea
                aria-label="私钥"
                value={value.privateKey}
                onChange={(event) => update('privateKey', event.target.value)}
                placeholder={isEdit ? '留空则保留现有私钥' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                rows={5}
              />
            </label>
          ) : null}

          <div className="auth-add-menu-wrap">
            <button
              type="button"
              className="auth-add-trigger"
              aria-haspopup="menu"
              aria-expanded={authMenuOpen}
              onClick={() => setAuthMenuOpen((open) => !open)}
            >
              <Plus size={14} />
              密钥 / 证书 / 本地密钥
            </button>
            {authMenuOpen ? (
              <div className="auth-add-menu" role="menu">
                <button type="button" role="menuitem" onClick={selectCredentialAuth} disabled={loadingCredentials || credentials.length === 0}>
                  <KeyRound size={18} />
                  <span>
                    <strong>密钥</strong>
                    <small>{credentials.length > 0 ? '使用钥匙串里保存的凭据' : '暂无已保存凭据'}</small>
                  </span>
                </button>
                <button type="button" role="menuitem" disabled>
                  <ShieldCheck size={18} />
                  <span>
                    <strong>证书</strong>
                    <small>SSH 证书支持稍后接入</small>
                  </span>
                </button>
                <button type="button" role="menuitem" onClick={selectPrivateKeyAuth}>
                  <FileKey2 size={18} />
                  <span>
                    <strong>本地密钥文件</strong>
                    <small>粘贴 OpenSSH 私钥内容</small>
                  </span>
                </button>
                {value.authType !== 'password' ? (
                  <button type="button" role="menuitem" onClick={selectPasswordAuth}>
                    <KeyRound size={18} />
                    <span>
                      <strong>密码</strong>
                      <small>切回密码认证</small>
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="form-hint">
            {isEdit
              ? '密码、私钥或凭据留空时，会保留原有的加密凭据。'
              : '首次连接未知主机时，会先确认远端主机指纹。'}
          </p>
        </section>

        <section className="host-form-section">
          <div className="host-form-section-title">
            <MonitorCog size={15} />
            <span>系统类型</span>
          </div>
          <p className="form-hint">连接成功后会自动识别，也可以手动覆盖卡片图标使用的类型。</p>
          <div className="host-form-split-row">
            <label>
              <span className="sr-only">来源</span>
              <select value={systemTypeValue} onChange={(event) => handleSystemTypeChange(event.target.value)}>
                <option value="auto">{autoSystemLabel}</option>
                <option value="ubuntu">Ubuntu</option>
                <option value="debian">Debian</option>
                <option value="centos">CentOS</option>
                <option value="rhel">Red Hat / RHEL</option>
                <option value="fedora">Fedora</option>
                <option value="alpine">Alpine</option>
                <option value="arch">Arch Linux</option>
                <option value="linux">Linux</option>
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
                <option value="database">Database</option>
                <option value="cache">Cache</option>
                <option value="gateway">Gateway</option>
                <option value="server">Server</option>
              </select>
            </label>
            <label>
              <span className="sr-only">当前值</span>
              <input value={value.systemType || '未知'} readOnly />
            </label>
          </div>
        </section>

        <section className="host-form-section">
          <div className="host-form-section-title">
            <ShieldCheck size={15} />
            <span>连接安全</span>
          </div>
          <div className="host-form-muted-line">
            <span>主机指纹</span>
            <strong>首次连接确认</strong>
          </div>
          <p className="form-hint">
            信任后会自动写入本地 config.zen，后续连接将使用已保存的主机指纹校验。
          </p>
        </section>
      </div>

      <footer className="host-drawer-footer">
        <button type="button" className="ghost-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="primary-button" disabled={disabled || busy}>
          {busy ? (isEdit ? '更新中...' : '保存中...') : (isEdit ? '保存修改' : '加密保存')}
        </button>
      </footer>
    </form>
  )
}
