import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, RefreshCw, SkipForward, X } from 'lucide-react'
import {
  checkForUpdates,
  downloadUpdate,
  onRuntimeEvent,
  openUpdateFile,
  skipVersion,
} from '@/lib/backend'
import { UpdateInfo, UpdateProgress } from '@/types/update'
import './UpdateNotification.css'

interface UpdateNotificationProps {
  onClose?: () => void
}

type StatusNotice = {
  tone: 'info' | 'error'
  message: string
}

export function UpdateNotification({ onClose }: UpdateNotificationProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null)
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusNotice | null>(null)

  const close = useCallback(() => {
    setUpdateInfo(null)
    setChecking(false)
    setDownloading(false)
    setDownloadProgress(null)
    setDownloadedFile(null)
    setStatus(null)
    onClose?.()
  }, [onClose])

  const handleCheckUpdate = useCallback(async () => {
    try {
      setChecking(true)
      setStatus(null)
      setDownloadedFile(null)
      setDownloadProgress(null)
      const info = await checkForUpdates()
      if (info.available) {
        setUpdateInfo(info)
      } else {
        setUpdateInfo(null)
        setStatus({
          tone: 'info',
          message: `当前已是最新版本 ${info.currentVersion}`,
        })
      }
    } catch (err) {
      setUpdateInfo(null)
      setStatus({
        tone: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const disposers = [
      onRuntimeEvent('update:available', (payload) => {
        const info = payload as UpdateInfo
        setUpdateInfo(info)
        setStatus(null)
        setDownloadedFile(null)
        setDownloadProgress(null)
      }),
      onRuntimeEvent('update:progress', (payload) => {
        const progress = payload as UpdateProgress
        setDownloading(true)
        setStatus(null)
        setDownloadProgress(progress)
      }),
      onRuntimeEvent('update:complete', (payload) => {
        const data = payload as { filePath: string }
        setDownloading(false)
        setDownloadedFile(data.filePath)
      }),
      onRuntimeEvent('update:error', (payload) => {
        const data = payload as { message: string }
        setDownloading(false)
        setStatus({
          tone: 'error',
          message: data.message,
        })
      }),
      onRuntimeEvent('update:check-requested', () => {
        void handleCheckUpdate()
      }),
    ]

    return () => {
      disposers.forEach((dispose) => dispose())
    }
  }, [handleCheckUpdate])

  async function handleDownload() {
    if (!updateInfo?.downloadUrl) {
      return
    }

    try {
      setDownloading(true)
      setStatus(null)
      await downloadUpdate(updateInfo.downloadUrl)
    } catch (err) {
      setDownloading(false)
      setStatus({
        tone: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleSkip() {
    if (!updateInfo?.latestVersion) {
      return
    }

    try {
      await skipVersion(updateInfo.latestVersion)
      close()
    } catch (err) {
      setStatus({
        tone: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleOpenFile() {
    if (!downloadedFile) {
      return
    }

    try {
      await openUpdateFile(downloadedFile)
    } catch (err) {
      setStatus({
        tone: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (!updateInfo && !status && !checking && !downloading && !downloadedFile) {
    return null
  }

  const title = updateInfo
    ? '发现新版本'
    : checking
      ? '正在检查更新'
      : downloading
        ? '正在下载更新'
        : status?.tone === 'error'
          ? '更新检查失败'
          : '更新状态'

  return (
    <aside className="update-notification" aria-live="polite" aria-label={title}>
      <div className="update-header">
        <h3>
          {checking ? <RefreshCw size={16} className="spin" /> : null}
          {title}
        </h3>
        <button type="button" onClick={close} className="close-btn" aria-label="关闭更新提示">
          <X size={18} />
        </button>
      </div>

      <div className="update-body">
        {updateInfo ? (
          <>
            <div className="version-info">
              <span className="current-version">当前版本: {updateInfo.currentVersion}</span>
              <span className="arrow">→</span>
              <span className="latest-version">最新版本: {updateInfo.latestVersion}</span>
            </div>

            {updateInfo.releaseNotes ? (
              <div className="release-notes">
                <h4>更新内容</h4>
                <div className="notes-content">
                  {updateInfo.releaseNotes.split('\n').slice(0, 5).map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {updateInfo.downloadSize ? (
              <div className="download-size">下载大小: {formatSize(updateInfo.downloadSize)}</div>
            ) : null}
          </>
        ) : (
          <p className={`update-status-text ${status?.tone || 'info'}`}>
            {checking ? '正在连接发布服务...' : downloading ? '正在下载更新包...' : status?.message}
          </p>
        )}

        {status && updateInfo ? (
          <div className={`error-message ${status.tone}`}>
            {status.message}
          </div>
        ) : null}

        {downloading && downloadProgress ? (
          <div className="download-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
              />
            </div>
            <div className="progress-info">
              <span>{downloadProgress.percent.toFixed(1)}%</span>
              <span>{downloadProgress.speed}</span>
            </div>
          </div>
        ) : null}

        {downloadedFile ? (
          <div className="download-complete">
            <p>下载完成</p>
            <p className="install-hint">下载位置</p>
            <p className="download-path">{downloadedFile}</p>
          </div>
        ) : null}
      </div>

      <div className="update-actions">
        {!updateInfo ? (
          <button type="button" onClick={close} className="btn-secondary">
            知道了
          </button>
        ) : downloadedFile ? (
          <>
            <button type="button" onClick={handleOpenFile} className="btn-primary">
              <ExternalLink size={16} />
              显示文件
            </button>
            <button type="button" onClick={close} className="btn-secondary">
              稍后
            </button>
          </>
        ) : downloading ? (
          <button type="button" disabled className="btn-secondary">
            下载中...
          </button>
        ) : (
          <>
            <button type="button" onClick={handleDownload} className="btn-primary">
              <Download size={16} />
              立即下载
            </button>
            <button type="button" onClick={handleSkip} className="btn-secondary">
              <SkipForward size={16} />
              跳过此版本
            </button>
            {updateInfo.releaseUrl ? (
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-link"
              >
                查看详情
              </a>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}
