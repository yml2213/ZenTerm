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
import { SettingsGroup } from '../components/SettingsComponents'

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
      {/* 当前版本与更新看板 */}
      <div className="update-hero-banner">
        <div className="update-hero-main">
          <div className="update-hero-logo">
            <Download size={22} />
          </div>
          <div>
            <div className="update-hero-title-row">
              <h3>ZenTerm 版本更新</h3>
              <span className="update-version-badge">
                v{appVersion || '0.1.9'}
              </span>
            </div>
            <p className="update-hero-sub">
              上次检查时间：{lastCheckText} · 渠道：{config.channel === 'stable' ? '官方稳定版' : config.channel}
            </p>
          </div>
        </div>

        <div className="update-hero-ctrls">
          <button
            type="button"
            className="primary-button"
            onClick={handleCheck}
            disabled={Boolean(busy)}
          >
            <RefreshCw size={14} className={busy === 'check' ? 'spin' : ''} />
            <span>{busy === 'check' ? '正在检查…' : '检查更新'}</span>
          </button>
        </div>
      </div>

      {/* 自动更新偏好设置 */}
      <SettingsGroup
        title="自动化更新偏好"
        description="控制应用是否在后台检测 GitHub Releases 的新版本并提前获取安装包。"
      >
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => updateConfig('enabled', event.target.checked)}
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>启动时自动检查</strong>
            <small>应用启动时按设定时间间隔自动在后台查询是否有可用新版本。</small>
          </div>
          <span className={`settings-switch-track${config.enabled ? ' is-checked' : ''}`} aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </label>

        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={config.auto_download}
            onChange={(event) => updateConfig('auto_download', event.target.checked)}
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>发现新版本后自动下载</strong>
            <small>在后台静默拉取更新安装包，并在下载完成后提醒您安装。</small>
          </div>
          <span className={`settings-switch-track${config.auto_download ? ' is-checked' : ''}`} aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </label>

        <div className="settings-form-grid" style={{ padding: '0.85rem 1.1rem' }}>
          <div className="settings-form-field">
            <label className="settings-field-label">
              检查时间间隔
              <select
                value={config.check_interval}
                onChange={(event) => updateConfig('check_interval', Number(event.target.value))}
                className="settings-select"
              >
                <option value={0}>每次启动应用时</option>
                <option value={6}>每 6 小时</option>
                <option value={12}>每 12 小时</option>
                <option value={24}>每天一次 (推荐)</option>
                <option value={168}>每周一次</option>
              </select>
            </label>
          </div>

          <div className="settings-form-field">
            <label className="settings-field-label">
              更新发布通道
              <select
                value={config.channel || 'stable'}
                onChange={(event) => updateConfig('channel', event.target.value)}
                className="settings-select"
              >
                <option value="stable">稳定版 (Stable Release)</option>
              </select>
            </label>
          </div>
        </div>

        <div className="settings-actions-bar" style={{ padding: '0.6rem 1.1rem 1rem' }}>
          <button
            type="button"
            className="ghost-button"
            onClick={handleSave}
            disabled={Boolean(busy)}
          >
            <Save size={14} />
            <span>{busy === 'save' ? '保存中…' : '保存更新设置'}</span>
          </button>
        </div>
      </SettingsGroup>

      {/* 下载进度 */}
      {downloadProgress && (
        <div className="update-progress-card">
          <div className="update-progress-header">
            <div className="update-progress-title">
              <RefreshCw size={15} className="spin text-accent" />
              <strong>正在下载更新安装包…</strong>
            </div>
            <span className="update-progress-meta">
              {downloadProgress.percent.toFixed(1)}% · {downloadProgress.speed}
            </span>
          </div>
          <div className="update-progress-track">
            <div
              className="update-progress-fill"
              style={{ width: `${Math.max(2, Math.min(100, downloadProgress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {/* 下载完成提示 */}
      {downloadedFile && (
        <div className="update-downloaded-card">
          <div className="update-downloaded-info">
            <Download size={18} className="text-success" />
            <div>
              <strong>新版本更新包已下载完成</strong>
              <small>{getUpdateFileName(downloadedFile)}</small>
            </div>
          </div>
          <button
            type="button"
            className="primary-button compact"
            onClick={handleShowDownloadedFile}
          >
            <FolderOpen size={14} />
            <span>打开所在文件夹</span>
          </button>
        </div>
      )}

      {/* 跳过版本恢复 */}
      {config.skipped_version && (
        <div className="settings-note-card">
          <span>已跳过版本 {config.skipped_version} 的更新提醒。</span>
          <button
            type="button"
            className="ghost-button compact"
            onClick={handleClearSkippedVersion}
            disabled={Boolean(busy)}
          >
            恢复提醒
          </button>
        </div>
      )}

      {/* 发现新版本卡片 */}
      {updateInfo?.available && (
        <SettingsGroup
          title={`发现新版本 v${updateInfo.latestVersion}`}
          description={`当前版本为 v${updateInfo.currentVersion}，新安装包大小约 ${
            updateInfo.downloadSize ? formatUpdateSize(updateInfo.downloadSize) : '未知'
          }。`}
        >
          {updateInfo.releaseNotes && (
            <div className="update-release-notes-box">
              <span className="update-notes-title">版本更新日志 (Release Notes):</span>
              <div className="update-notes-body">
                {updateInfo.releaseNotes
                  .split('\n')
                  .slice(0, 8)
                  .map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
              </div>
            </div>
          )}

          <div className="settings-actions-bar" style={{ padding: '0.8rem 1.1rem' }}>
            <button
              type="button"
              className="primary-button"
              onClick={handleDownload}
              disabled={Boolean(busy)}
            >
              <Download size={14} />
              <span>{busy === 'download' ? '正在下载更新包…' : '立即下载更新'}</span>
            </button>
            {updateInfo.releaseUrl && (
              <a
                className="ghost-button settings-link-button"
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                <span>在 GitHub 查看 Release</span>
              </a>
            )}
          </div>
        </SettingsGroup>
      )}

      {notice && (
        <div className="settings-inline-message success">
          <Download size={15} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="settings-inline-message error">
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
