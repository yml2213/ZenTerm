import { Download, ExternalLink, FolderOpen, RefreshCw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  checkForUpdates,
  downloadUpdate,
  getAppVersion,
  getUpdateConfig,
  onRuntimeEvent,
  openUpdateFile,
  saveUpdateConfig,
} from '@/lib/backend'
import type { UpdateConfig, UpdateInfo, UpdateProgress } from '@/types/update'

const defaultUpdateConfig: UpdateConfig = {
  enabled: true,
  check_interval: 24,
  last_check_time: 0,
  skipped_version: '',
  auto_download: false,
  channel: 'stable',
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

export default function UpdatesSection() {
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
