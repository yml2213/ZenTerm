import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronRight,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { downloadFile, listLocalFiles, listRemoteFiles, uploadFile } from '../lib/backend.js'

function splitLocalPath(path) {
  const normalized = path || ''
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return [{ label: '/', path: '/' }]
  }

  return [
    { label: '/', path: '/' },
    ...parts.map((segment, index) => ({
      label: segment,
      path: `/${parts.slice(0, index + 1).join('/')}`,
    })),
  ]
}

function splitRemotePath(path) {
  const normalized = path || '/'
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return [{ label: '/', path: '/' }]
  }

  return [
    { label: '/', path: '/' },
    ...parts.map((segment, index) => ({
      label: segment,
      path: `/${parts.slice(0, index + 1).join('/')}`,
    })),
  ]
}

function formatSize(size, isDir) {
  if (isDir) {
    return '--'
  }

  if (!Number.isFinite(size) || size < 1024) {
    return `${Math.max(size, 0)} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size
  let unitIndex = -1
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatTime(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-')
}

function buildRows(listing) {
  const rows = listing?.entries || []
  if (!listing?.parentPath) {
    return rows
  }

  return [
    {
      name: '..',
      path: listing.parentPath,
      size: 0,
      modTime: '',
      type: 'dir',
      isDir: true,
      parent: true,
    },
    ...rows,
  ]
}

function pickTransferableEntry(listing, selectedPath) {
  if (!selectedPath) {
    return null
  }

  return (listing?.entries || []).find((entry) => entry.path === selectedPath && !entry.isDir) || null
}

function FilePane({
  className = '',
  sourceLabel,
  sourceIcon: SourceIcon,
  listing,
  loading,
  hostLabel,
  onNavigate,
  onRefresh,
  breadcrumbItems,
  selectedPath,
  onSelectPath,
  transferLabel,
  transferBusy,
  transferDisabled,
  onTransfer,
}) {
  const rows = buildRows(listing)
  const selectedEntry = pickTransferableEntry(listing, selectedPath)
  const paneClassName = ['sftp-pane', className].filter(Boolean).join(' ')

  return (
    <section className={paneClassName}>
      <header className="sftp-pane-topbar">
        <button type="button" className="sftp-source-tab active">
          <SourceIcon size={14} />
          <span>{sourceLabel}</span>
        </button>

        {hostLabel ? <span className="sftp-pane-host">{hostLabel}</span> : null}

        <button
          type="button"
          className="sftp-add-tab"
          aria-label={`刷新 ${sourceLabel}`}
          title={`刷新 ${sourceLabel}`}
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
        </button>
      </header>

      <div className="sftp-local-toolbar">
        <div className="sftp-breadcrumb">
          {breadcrumbItems.map((item, index) => (
            <button
              key={`${item.path}-${index}`}
              type="button"
              className={`sftp-breadcrumb-link${index === breadcrumbItems.length - 1 ? ' active' : ''}`}
              onClick={() => onNavigate(item.path)}
            >
              {index === 0 && item.label === '/' ? <Home size={14} /> : item.label}
              {index < breadcrumbItems.length - 1 ? <ChevronRight size={14} /> : null}
            </button>
          ))}
        </div>

        <div className="sftp-toolbar-actions">
          {loading ? (
            <span className="pill subtle">
              <LoaderCircle size={13} className="spin" />
              加载中
            </span>
          ) : null}
          {selectedEntry ? (
            <span className="pill subtle">已选 {selectedEntry.name}</span>
          ) : null}
          {transferLabel ? (
            <button
              type="button"
              className="ghost-button"
              disabled={transferDisabled}
              onClick={onTransfer}
            >
              {transferBusy ? <LoaderCircle size={14} className="spin" /> : null}
              {transferLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="sftp-file-table">
        <div className="sftp-file-head">
          <span>名称</span>
          <span>修改时间</span>
          <span>大小</span>
          <span>类型</span>
        </div>

        <div className="sftp-file-body">
          {rows.map((entry) => (
            <button
              key={`${entry.path}-${entry.name}`}
              type="button"
              className={`sftp-file-row${entry.parent ? ' is-parent' : ''}${selectedPath === entry.path ? ' selected' : ''}`}
              onClick={() => {
                if (entry.isDir) {
                  onNavigate(entry.path)
                  return
                }

                onSelectPath((current) => current === entry.path ? null : entry.path)
              }}
            >
              <div className="sftp-file-name">
                <span className="sftp-file-icon">
                  {entry.parent ? <FolderOpen size={16} /> : <Folder size={16} />}
                </span>
                <strong>{entry.name}</strong>
              </div>
              <span>{formatTime(entry.modTime)}</span>
              <span>{formatSize(entry.size, entry.isDir)}</span>
              <span>{entry.isDir ? 'Folder' : 'File'}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className="sftp-pane-footer">
        <span>{listing?.entries?.length || 0} 个项目</span>
        <span>{listing?.path || '--'}</span>
      </footer>
    </section>
  )
}

export default function SftpWorkspace({
  hosts,
  selectedHost,
  vaultUnlocked,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
  onError,
}) {
  const [localListing, setLocalListing] = useState(null)
  const [remoteListing, setRemoteListing] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [selectedLocalPath, setSelectedLocalPath] = useState(null)
  const [selectedRemotePath, setSelectedRemotePath] = useState(null)
  const [transferBusy, setTransferBusy] = useState(null)
  const [transferMessage, setTransferMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setLocalLoading(true)

    listLocalFiles('')
      .then((listing) => {
        if (!cancelled) {
          setLocalListing(listing)
          setSelectedLocalPath(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onError(error?.message || String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLocalLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [onError])

  useEffect(() => {
    let cancelled = false

    if (!selectedHost || !vaultUnlocked) {
      setRemoteListing(null)
      setRemoteLoading(false)
      setSelectedRemotePath(null)
      return () => {
        cancelled = true
      }
    }

    setRemoteLoading(true)
    listRemoteFiles(selectedHost.id, '')
      .then((listing) => {
        if (!cancelled) {
          setRemoteListing(listing)
          setSelectedRemotePath(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onError(error?.message || String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRemoteLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [onError, selectedHost, vaultUnlocked])

  async function handleLocalNavigate(path) {
    setLocalLoading(true)
    try {
      const listing = await listLocalFiles(path)
      setLocalListing(listing)
      setSelectedLocalPath(null)
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setLocalLoading(false)
    }
  }

  async function handleRemoteNavigate(path) {
    if (!selectedHost) {
      return
    }

    setRemoteLoading(true)
    try {
      const listing = await listRemoteFiles(selectedHost.id, path)
      setRemoteListing(listing)
      setSelectedRemotePath(null)
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setRemoteLoading(false)
    }
  }

  async function handleUpload() {
    if (!selectedHost || !selectedLocalPath || !remoteListing?.path) {
      return
    }

    setTransferBusy('upload')
    setTransferMessage('')
    try {
      const result = await uploadFile(selectedHost.id, selectedLocalPath, remoteListing.path)
      setTransferMessage(`已上传 ${result.sourcePath.split('/').at(-1)} -> ${result.targetPath}`)
      await handleRemoteNavigate(remoteListing.path)
      setSelectedLocalPath(null)
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setTransferBusy(null)
    }
  }

  async function handleDownload() {
    if (!selectedHost || !selectedRemotePath || !localListing?.path) {
      return
    }

    setTransferBusy('download')
    setTransferMessage('')
    try {
      const result = await downloadFile(selectedHost.id, selectedRemotePath, localListing.path)
      setTransferMessage(`已下载 ${result.sourcePath.split('/').at(-1)} -> ${result.targetPath}`)
      await handleLocalNavigate(localListing.path)
      setSelectedRemotePath(null)
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setTransferBusy(null)
    }
  }

  const selectedLocalEntry = pickTransferableEntry(localListing, selectedLocalPath)
  const selectedRemoteEntry = pickTransferableEntry(remoteListing, selectedRemotePath)

  return (
    <section className="sftp-shell" aria-label="SFTP 工作区">
      {transferMessage ? (
        <div className="sftp-transfer-banner">
          <span className="pill success">{transferMessage}</span>
        </div>
      ) : null}
      <div className="sftp-browser">
        <FilePane
          className="sftp-pane-local"
          sourceLabel="Local"
          sourceIcon={MonitorSmartphone}
          listing={localListing}
          loading={localLoading}
          onNavigate={handleLocalNavigate}
          onRefresh={() => handleLocalNavigate(localListing?.path || '')}
          breadcrumbItems={splitLocalPath(localListing?.path || '')}
          selectedPath={selectedLocalPath}
          onSelectPath={setSelectedLocalPath}
          transferLabel={selectedHost ? '上传到远端' : null}
          transferBusy={transferBusy === 'upload'}
          transferDisabled={!selectedLocalEntry || !selectedHost || !vaultUnlocked || transferBusy !== null}
          onTransfer={handleUpload}
        />

        {selectedHost ? (
          vaultUnlocked ? (
            <FilePane
              className="sftp-pane-remote"
              sourceLabel="Remote"
              sourceIcon={Server}
              listing={remoteListing}
              loading={remoteLoading}
              hostLabel={selectedHost.name || selectedHost.id}
              onNavigate={handleRemoteNavigate}
              onRefresh={() => handleRemoteNavigate(remoteListing?.path || '')}
              breadcrumbItems={splitRemotePath(remoteListing?.path || '/')}
              selectedPath={selectedRemotePath}
              onSelectPath={setSelectedRemotePath}
              transferLabel="下载到本地"
              transferBusy={transferBusy === 'download'}
              transferDisabled={!selectedRemoteEntry || !localListing?.path || transferBusy !== null}
              onTransfer={handleDownload}
            />
          ) : (
            <section className="sftp-pane sftp-pane-remote">
              <div className="sftp-empty-state">
                <div className="sftp-empty-icon">
                  <HardDrive size={24} />
                </div>
                <div className="sftp-empty-copy">
                  <strong>需要主密码</strong>
                  <p>远端文件需要先完成一次主密码验证，才能使用已保存凭据建立 SFTP 连接。</p>
                </div>
              </div>
            </section>
          )
        ) : (
          <section className="sftp-pane sftp-pane-remote">
            <div className="sftp-empty-state">
              <div className="sftp-empty-icon">
                <HardDrive size={24} />
              </div>
              <div className="sftp-empty-copy">
                <strong>先选择一个主机</strong>
                <p>选择要浏览的远端文件系统</p>
              </div>

              <div className="sftp-empty-actions">
                {hosts.length > 0 ? (
                  <button type="button" className="primary-button" onClick={() => onChooseHost()}>
                    选择主机
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={onCreateHost}>
                    新建主机
                  </button>
                )}
                <button type="button" className="ghost-button" onClick={onBackToVaults}>
                  返回 Vaults
                </button>
              </div>

              {hosts.length > 0 ? (
                <div className="sftp-host-picker">
                  {hosts.slice(0, 6).map((host) => (
                    <button
                      key={host.id}
                      type="button"
                      className="sftp-host-chip"
                      onClick={() => onChooseHost(host.id)}
                    >
                      <span>{host.name || host.id}</span>
                      <small>{host.username}@{host.address}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </section>
  )
}
