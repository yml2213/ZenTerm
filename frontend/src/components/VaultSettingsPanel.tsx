import {
  AlertTriangle,
  Cloud,
  Database,
  KeyRound,
  Palette,
  RotateCcw,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  configureWebDAVSync,
  getWebDAVSyncStatus,
  pullWebDAVSync,
  pushWebDAVSync,
  testWebDAVSync,
  type WebDAVSyncStatus,
} from '../lib/backend'
import type { ChangeMasterForm } from '../types'

type SettingsSection = 'security' | 'sync' | 'data' | 'appearance' | 'advanced'

interface VaultSettingsPanelProps {
  changeForm: ChangeMasterForm
  changeBusy: boolean
  resetConfirmed: boolean
  resetBusy: boolean
  onChangeField: (field: keyof ChangeMasterForm, value: string) => void
  onChangePassword: (event: FormEvent) => void
  onResetConfirmedChange: (value: boolean) => void
  onResetVault: () => void
}

const settingsSections: Array<{
  id: SettingsSection
  label: string
  description: string
  icon: typeof ShieldCheck
}> = [
  { id: 'security', label: '安全', description: '主密码与本机钥匙串', icon: ShieldCheck },
  { id: 'sync', label: '同步', description: 'WebDAV 与坚果云', icon: Cloud },
  { id: 'data', label: '数据', description: '导入、导出与状态', icon: Database },
  { id: 'appearance', label: '外观', description: '主题与密度', icon: Palette },
  { id: 'advanced', label: '高级', description: '启动与调试', icon: Settings2 },
]

export default function VaultSettingsPanel({
  changeForm,
  changeBusy,
  resetConfirmed,
  resetBusy,
  onChangeField,
  onChangePassword,
  onResetConfirmedChange,
  onResetVault,
}: VaultSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('security')

  const activeMeta = useMemo(
    () => settingsSections.find((section) => section.id === activeSection) || settingsSections[0],
    [activeSection],
  )

  return (
    <section className="settings-stage" aria-label="设置">
      <aside className="settings-nav-panel" aria-label="设置分类">
        <div className="settings-nav-head">
          <span className="panel-kicker">Settings</span>
          <h1>设置</h1>
        </div>

        <div className="settings-nav-list">
          {settingsSections.map((section) => {
            const Icon = section.icon
            return (
              <button
                type="button"
                key={section.id}
                className={`settings-nav-item${activeSection === section.id ? ' active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <Icon size={16} />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="settings-detail">
        <header className="settings-detail-head">
          <span className="panel-kicker">{activeMeta.description}</span>
          <h2>{activeMeta.label}</h2>
        </header>

        {activeSection === 'security' ? (
          <SecuritySettings
            changeForm={changeForm}
            changeBusy={changeBusy}
            resetConfirmed={resetConfirmed}
            resetBusy={resetBusy}
            onChangeField={onChangeField}
            onChangePassword={onChangePassword}
            onResetConfirmedChange={onResetConfirmedChange}
            onResetVault={onResetVault}
          />
        ) : activeSection === 'sync' ? (
          <SyncSettings />
        ) : (
          <ReservedSettings section={activeSection} />
        )}
      </main>
    </section>
  )
}

function SecuritySettings({
  changeForm,
  changeBusy,
  resetConfirmed,
  resetBusy,
  onChangeField,
  onChangePassword,
  onResetConfirmedChange,
  onResetVault,
}: VaultSettingsPanelProps) {
  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <KeyRound size={18} />
          <div>
            <h3>主密码</h3>
            <p>更新后会重新加密已保存凭据，并刷新系统钥匙串中的记忆密码。</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={onChangePassword}>
          <label>
            当前主密码
            <input
              type="password"
              value={changeForm.currentPassword}
              onChange={(event) => onChangeField('currentPassword', event.target.value)}
              placeholder="请输入当前主密码"
              required
            />
          </label>

          <div className="settings-form-grid">
            <label>
              新主密码
              <input
                type="password"
                value={changeForm.nextPassword}
                onChange={(event) => onChangeField('nextPassword', event.target.value)}
                placeholder="请输入新主密码"
                required
              />
            </label>

            <label>
              确认新主密码
              <input
                type="password"
                value={changeForm.confirmPassword}
                onChange={(event) => onChangeField('confirmPassword', event.target.value)}
                placeholder="请再次输入新主密码"
                required
              />
            </label>
          </div>

          <div className="settings-note-row">
            <ShieldCheck size={16} />
            <span>系统钥匙串会同步更新，后续仍可自动进入。</span>
          </div>

          <div className="settings-actions">
            <button type="submit" className="primary-button" disabled={changeBusy}>
              {changeBusy ? '更新中...' : '更新主密码'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section-panel danger-zone">
        <div className="settings-section-title">
          <RotateCcw size={18} />
          <div>
            <h3>危险区域</h3>
            <p>清空当前 Vault 会删除主机、凭据、信任记录和本机钥匙串中的主密码记录。</p>
          </div>
        </div>

        <div className="settings-danger-copy">
          <AlertTriangle size={16} />
          <span>执行后无法撤销。只有在确实忘记主密码或要彻底清空本地数据时才建议使用。</span>
        </div>

        <label className="remember-toggle danger-toggle">
          <input
            type="checkbox"
            checked={resetConfirmed}
            onChange={(event) => onResetConfirmedChange(event.target.checked)}
          />
          <span>
            <strong>我确认要清空当前 Vault</strong>
            <small>包括主机列表、加密凭据、已知主机记录，以及系统钥匙串中的保存信息。</small>
          </span>
        </label>

        <div className="settings-actions">
          <button type="button" className="primary-button danger" onClick={onResetVault} disabled={resetBusy}>
            {resetBusy ? '重置中...' : '重置 Vault'}
          </button>
        </div>
      </section>
    </div>
  )
}

function SyncSettings() {
  const [status, setStatus] = useState<WebDAVSyncStatus | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [url, setURL] = useState('https://dav.jianguoyun.com/dav/')
  const [username, setUsername] = useState('')
  const [remotePath, setRemotePath] = useState('/ZenTerm/zenterm-sync-v1.json')
  const [password, setPassword] = useState('')
  const [masterPassword, setMasterPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const syncMetaText = [
    status?.device_name ? `设备 ${status.device_name}` : '',
    status?.last_sync_at ? `上次同步 ${status.last_sync_at}` : '尚未完成同步',
  ]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    let disposed = false
    getWebDAVSyncStatus()
      .then((nextStatus) => {
        if (disposed) {
          return
        }
        setStatus(nextStatus)
        if (nextStatus.url) {
          setURL(nextStatus.url)
        }
        if (nextStatus.username) {
          setUsername(nextStatus.username)
        }
        if (nextStatus.device_name) {
          setDeviceName(nextStatus.device_name)
        }
        if (nextStatus.remote_path) {
          setRemotePath(nextStatus.remote_path)
        }
      })
      .catch((err) => {
        if (!disposed) {
          setError(err.message || String(err))
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  function handleConfigure(event: FormEvent) {
    event.preventDefault()
    setBusy('config')
    setError(null)
    setNotice(null)

    configureWebDAVSync({
      url,
      username,
      remote_path: remotePath,
      device_name: deviceName,
      password,
    })
      .then((nextStatus) => {
        setStatus(nextStatus)
        setPassword('')
        setNotice('WebDAV 同步配置已保存。')
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handleTest() {
    setBusy('test')
    setError(null)
    setNotice(null)

    testWebDAVSync({
      url,
      username,
      remote_path: remotePath,
      device_name: deviceName,
      password,
    })
      .then((result) => {
        setNotice(result.message || (result.exists ? 'WebDAV 连接正常，远端同步文件已存在。' : 'WebDAV 连接正常。'))
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handlePush(overwrite = false) {
    setBusy(overwrite ? 'push-overwrite' : 'push')
    setError(null)
    setNotice(null)

    pushWebDAVSync(overwrite)
      .then((result) => {
        setNotice(result.message || '已上传本机快照。')
        return getWebDAVSyncStatus()
      })
      .then(setStatus)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handlePull(overwrite = false) {
    if (!masterPassword) {
      setError('请输入主密码后再拉取远端快照。')
      return
    }

    setBusy(overwrite ? 'pull-overwrite' : 'pull')
    setError(null)
    setNotice(null)

    pullWebDAVSync(masterPassword, overwrite)
      .then((result) => {
        setMasterPassword('')
        setNotice(result.message || '已拉取远端快照。')
        return getWebDAVSyncStatus()
      })
      .then(setStatus)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Cloud size={18} />
          <div>
            <h3>WebDAV</h3>
            <p>适用于坚果云和兼容 WebDAV 的网盘。同步包会整体加密后再上传。</p>
          </div>
        </div>

        <div className="sync-status-strip">
          <span className={`sync-dot${status?.configured ? ' active' : ''}`} />
          <strong>{status?.configured ? '已配置' : '未配置'}</strong>
          <small>{syncMetaText}</small>
        </div>

        <form className="settings-form" onSubmit={handleConfigure}>
          <div className="settings-form-grid">
            <label>
              设备名称
              <input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder="例如 MacBook Pro"
              />
            </label>
            <label>
              WebDAV 地址
              <input
                value={url}
                onChange={(event) => setURL(event.target.value)}
                placeholder="https://dav.jianguoyun.com/dav/"
                required
              />
            </label>
          </div>

          <div className="settings-form-grid">
            <label>
              用户名
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="坚果云账号"
                required
              />
            </label>
            <label>
              应用密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={status?.configured ? '留空则继续使用已保存密码' : '请输入第三方应用密码'}
                required={!status?.configured}
              />
            </label>
            <label>
              远端路径
              <input
                value={remotePath}
                onChange={(event) => setRemotePath(event.target.value)}
                placeholder="/ZenTerm/zenterm-sync-v1.json"
                required
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="button" className="ghost-button" onClick={handleTest} disabled={Boolean(busy)}>
              {busy === 'test' ? '测试中...' : '测试连接'}
            </button>
            <button type="submit" className="primary-button" disabled={Boolean(busy)}>
              {busy === 'config' ? '保存中...' : '保存配置'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Database size={18} />
          <div>
            <h3>同步操作</h3>
            <p>默认同步主机和凭据，不同步完整终端记录。</p>
          </div>
        </div>

        <label>
          拉取时使用的主密码
          <input
            type="password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
            placeholder="用于解密远端同步包"
          />
        </label>

        <div className="settings-action-grid">
          <button type="button" className="ghost-button" onClick={() => handlePull(false)} disabled={!status?.configured || Boolean(busy)}>
            {busy === 'pull' ? '拉取中...' : '拉取远端'}
          </button>
          <button type="button" className="ghost-button" onClick={() => handlePush(false)} disabled={!status?.configured || Boolean(busy)}>
            {busy === 'push' ? '上传中...' : '上传本机'}
          </button>
          <button type="button" className="ghost-button danger-outline" onClick={() => handlePush(true)} disabled={!status?.configured || Boolean(busy)}>
            覆盖远端
          </button>
          <button type="button" className="ghost-button danger-outline" onClick={() => handlePull(true)} disabled={!status?.configured || Boolean(busy)}>
            覆盖本机
          </button>
        </div>

        {notice ? <div className="settings-inline-message success">{notice}</div> : null}
        {error ? <div className="settings-inline-message error">{error}</div> : null}
      </section>
    </div>
  )
}

function ReservedSettings({ section }: { section: SettingsSection }) {
  const copy = {
    data: ['数据', '导入、导出、备份恢复和诊断入口会集中在这里。'],
    appearance: ['外观', '主题、强调色和界面密度会在这里统一管理。'],
    advanced: ['高级', '启动行为、调试和实验选项会收进这里。'],
    security: ['', ''],
    sync: ['', ''],
  }[section]

  return (
    <section className="settings-section-panel settings-empty-section">
      <Settings2 size={18} />
      <div>
        <h3>{copy[0]}</h3>
        <p>{copy[1]}</p>
      </div>
      <span className="pill subtle">稍后开放</span>
    </section>
  )
}
