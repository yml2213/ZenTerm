import {
  AlertTriangle,
  ArrowLeft,
  Cloud,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  configureWebDAVSync,
  getWebDAVSyncStatus,
  checkForUpdates,
  downloadUpdate,
  getAppVersion,
  getUpdateConfig,
  onRuntimeEvent,
  openUpdateFile,
  pullWebDAVSync,
  pushWebDAVSync,
  saveUpdateConfig,
  testWebDAVSync,
  type WebDAVSyncStatus,
} from '../lib/backend'
import { useTerminalPreferences } from '../contexts/TerminalPreferencesProvider'
import type { ChangeMasterForm } from '../types'
import type { UpdateConfig, UpdateInfo, UpdateProgress } from '../types/update'

type SettingsSection = 'security' | 'sync' | 'updates' | 'terminal' | 'data' | 'appearance' | 'advanced'

interface VaultSettingsPanelProps {
  changeForm: ChangeMasterForm
  changeBusy: boolean
  resetConfirmed: boolean
  resetBusy: boolean
  onChangeField: (field: keyof ChangeMasterForm, value: string) => void
  onChangePassword: (event: FormEvent) => void
  onResetConfirmedChange: (value: boolean) => void
  onResetVault: () => void
  onBackToApp: () => void
}

const settingsSections: Array<{
  id: SettingsSection
  label: string
  description: string
  icon: typeof ShieldCheck
}> = [
  { id: 'security', label: '安全', description: '主密码与本机钥匙串', icon: ShieldCheck },
  { id: 'sync', label: '同步', description: 'WebDAV 与坚果云', icon: Cloud },
  { id: 'updates', label: '更新', description: '版本检查与下载', icon: Download },
  { id: 'terminal', label: '终端', description: '右键复制与粘贴', icon: TerminalSquare },
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
  onBackToApp,
}: VaultSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('security')

  const activeMeta = useMemo(
    () => settingsSections.find((section) => section.id === activeSection) || settingsSections[0],
    [activeSection],
  )

  return (
    <section className="settings-stage" aria-label="设置">
      <aside className="settings-nav-panel" aria-label="设置分类">
        <button type="button" className="settings-back-button" onClick={onBackToApp}>
          <ArrowLeft size={15} />
          返回应用
        </button>

        <div className="settings-nav-head">
          <span className="panel-kicker">偏好设置</span>
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
        ) : activeSection === 'updates' ? (
          <UpdateSettings />
        ) : activeSection === 'terminal' ? (
          <TerminalSettings />
        ) : (
          <ReservedSettings section={activeSection} />
        )}
      </main>
    </section>
  )
}

const defaultUpdateConfig: UpdateConfig = {
  enabled: true,
  check_interval: 24,
  last_check_time: 0,
  skipped_version: '',
  auto_download: false,
  channel: 'stable',
}

function UpdateSettings() {
  const [config, setConfig] = useState<UpdateConfig>(defaultUpdateConfig)
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null)
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    Promise.all([getUpdateConfig(), getAppVersion()])
      .then(([nextConfig, version]) => {
        if (disposed) {
          return
        }
        setConfig({ ...defaultUpdateConfig, ...nextConfig })
        setAppVersion(version)
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

  useEffect(() => {
    const disposers = [
      onRuntimeEvent('update:progress', (payload) => {
        setBusy('download')
        setError(null)
        setNotice(null)
        setDownloadProgress(payload as UpdateProgress)
      }),
      onRuntimeEvent('update:complete', (payload) => {
        const data = payload as { filePath: string }
        setBusy(null)
        setDownloadProgress(null)
        setDownloadedFile(data.filePath)
        setNotice(`更新包已下载到 ${getUpdateFileName(data.filePath)}。`)
      }),
      onRuntimeEvent('update:error', (payload) => {
        const data = payload as { message: string }
        setBusy(null)
        setDownloadProgress(null)
        setError(data.message)
      }),
    ]

    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [])

  function updateConfig(field: keyof UpdateConfig, value: boolean | number | string) {
    setConfig((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleSave() {
    setBusy('save')
    setError(null)
    setNotice(null)

    saveUpdateConfig(config)
      .then(() => setNotice('更新设置已保存。'))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handleCheck() {
    setBusy('check')
    setError(null)
    setNotice(null)

    checkForUpdates()
      .then((info) => {
        setUpdateInfo(info)
        if (info.available) {
          setNotice(`发现新版本 ${info.latestVersion}。`)
          return
        }
        setNotice(`当前已是最新版本 ${info.currentVersion}。`)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handleDownload() {
    if (!updateInfo?.downloadUrl) {
      return
    }

    setBusy('download')
    setError(null)
    setNotice(null)
    setDownloadProgress(null)
    setDownloadedFile(null)

    downloadUpdate(updateInfo.downloadUrl)
      .then(() => setNotice('更新包正在下载。'))
      .catch((err) => {
        setBusy(null)
        setError(err.message || String(err))
      })
  }

  function handleShowDownloadedFile() {
    if (!downloadedFile) {
      return
    }

    setError(null)
    openUpdateFile(downloadedFile).catch((err) => setError(err.message || String(err)))
  }

  function handleClearSkippedVersion() {
    const nextConfig = {
      ...config,
      skipped_version: '',
    }
    setConfig(nextConfig)
    setBusy('skip')
    setError(null)
    setNotice(null)

    saveUpdateConfig(nextConfig)
      .then(() => setNotice('已恢复此版本的更新提醒。'))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  const lastCheckText = config.last_check_time ? formatUpdateTime(config.last_check_time) : '尚未检查'

  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Download size={18} />
          <div>
            <h3>版本更新</h3>
            <p>当前版本 {appVersion || '读取中'}，上次检查 {lastCheckText}。</p>
          </div>
        </div>

        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(event) => updateConfig('enabled', event.target.checked)}
            />
            <span>
              <strong>启动时自动检查</strong>
              <small>按设定间隔在后台检查 GitHub Release。</small>
            </span>
          </label>

          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={config.auto_download}
              onChange={(event) => updateConfig('auto_download', event.target.checked)}
            />
            <span>
              <strong>发现新版本后自动下载</strong>
              <small>仍会保留安装确认，由你决定何时打开安装包。</small>
            </span>
          </label>
        </div>

        <div className="settings-form-grid">
          <label>
            检查间隔
            <select
              value={config.check_interval}
              onChange={(event) => updateConfig('check_interval', Number(event.target.value))}
            >
              <option value={0}>每次启动</option>
              <option value={6}>每 6 小时</option>
              <option value={12}>每 12 小时</option>
              <option value={24}>每天</option>
              <option value={168}>每周</option>
            </select>
          </label>

          <label>
            发布渠道
            <select
              value={config.channel || 'stable'}
              onChange={(event) => updateConfig('channel', event.target.value)}
            >
              <option value="stable">稳定版</option>
            </select>
          </label>
        </div>

        <div className="settings-actions">
          <button type="button" className="ghost-button" onClick={handleCheck} disabled={Boolean(busy)}>
            <RefreshCw size={16} />
            {busy === 'check' ? '检查中...' : '检查更新'}
          </button>
          <button type="button" className="primary-button" onClick={handleSave} disabled={Boolean(busy)}>
            <Save size={16} />
            {busy === 'save' ? '保存中...' : '保存更新设置'}
          </button>
        </div>

        {downloadProgress ? (
          <div className="settings-note-row">
            <RefreshCw size={16} className="spin" />
            <span>
              正在下载 {downloadProgress.percent.toFixed(1)}%，{downloadProgress.speed}
            </span>
          </div>
        ) : null}

        {downloadedFile ? (
          <div className="settings-note-row settings-download-result">
            <Download size={16} />
            <span>
              <strong>下载完成</strong>
              <small>{getUpdateFileName(downloadedFile)}</small>
              <code>{downloadedFile}</code>
            </span>
            <button type="button" className="ghost-button compact" onClick={handleShowDownloadedFile}>
              <FolderOpen size={14} />
              显示文件
            </button>
          </div>
        ) : null}

        {config.skipped_version ? (
          <div className="settings-note-row">
            <span>已跳过版本 {config.skipped_version}</span>
            <button type="button" className="ghost-button compact" onClick={handleClearSkippedVersion} disabled={Boolean(busy)}>
              恢复提醒
            </button>
          </div>
        ) : null}
      </section>

      {updateInfo?.available ? (
        <section className="settings-section-panel">
          <div className="settings-section-title">
            <Download size={18} />
            <div>
              <h3>新版本 {updateInfo.latestVersion}</h3>
              <p>当前版本 {updateInfo.currentVersion}，安装包大小 {updateInfo.downloadSize ? formatUpdateSize(updateInfo.downloadSize) : '未知'}。</p>
            </div>
          </div>

          {updateInfo.releaseNotes ? (
            <div className="settings-release-notes">
              {updateInfo.releaseNotes.split('\n').slice(0, 6).map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          ) : null}

          <div className="settings-actions">
            <button type="button" className="primary-button" onClick={handleDownload} disabled={Boolean(busy)}>
              <Download size={16} />
              {busy === 'download' ? '下载中...' : '下载更新'}
            </button>
            {updateInfo.releaseUrl ? (
              <a className="ghost-button settings-link-button" href={updateInfo.releaseUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                查看详情
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {notice ? <div className="settings-inline-message success">{notice}</div> : null}
      {error ? <div className="settings-inline-message error">{error}</div> : null}
    </div>
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

function TerminalSettings() {
  const {
    quickEditEnabled,
    webLinksEnabled,
    setQuickEditEnabled,
    setWebLinksEnabled,
  } = useTerminalPreferences()

  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <TerminalSquare size={18} />
          <div>
            <h3>终端交互</h3>
            <p>调整 SSH 终端里的鼠标与剪贴板行为。</p>
          </div>
        </div>

        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={quickEditEnabled}
              onChange={(event) => setQuickEditEnabled(event.target.checked)}
            />
            <span>
              <strong>快速编辑模式</strong>
              <small>选中文本时右键复制，没有选区时右键粘贴。</small>
            </span>
          </label>

          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={webLinksEnabled}
              onChange={(event) => setWebLinksEnabled(event.target.checked)}
            />
            <span>
              <strong>URL 点击打开</strong>
              <small>识别终端输出中的 http 和 https 链接，点击后用系统浏览器打开。</small>
            </span>
          </label>
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

function formatUpdateTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatUpdateSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getUpdateFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath
}

function ReservedSettings({ section }: { section: SettingsSection }) {
  const copy = {
    data: ['数据', '导入、导出、备份恢复和诊断入口会集中在这里。'],
    appearance: ['外观', '主题、强调色和界面密度会在这里统一管理。'],
    advanced: ['高级', '启动行为、调试和实验选项会收进这里。'],
    security: ['', ''],
    sync: ['', ''],
    updates: ['', ''],
    terminal: ['', ''],
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
