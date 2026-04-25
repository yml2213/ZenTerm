import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, ExternalLink, FileText, History, PlugZap, RefreshCw, Search, Star, UserRound, X } from 'lucide-react'
import { getSessionTranscript, listSessionLogs, onRuntimeEvent, toggleSessionLogFavorite } from '../lib/backend.js'

const statusFilters = [
  { id: 'all', label: '全部' },
  { id: 'closed', label: '成功' },
  { id: 'failed', label: '失败' },
  { id: 'active', label: '进行中' },
  { id: 'favorite', label: '收藏' },
]

const statusLabels = {
  connecting: '连接中',
  active: '进行中',
  closed: '已关闭',
  failed: '失败',
  rejected: '已拒绝',
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(durationMillis) {
  if (!durationMillis) return ''
  const totalMinutes = Math.max(1, Math.round(durationMillis / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) {
    return `${hours}小时${minutes > 0 ? `${minutes}分` : ''}`
  }
  return `${minutes}分钟`
}

function matchesLog(log, query) {
  const value = query.trim().toLowerCase()
  if (!value) return true

  return [
    log.host_name,
    log.host_id,
    log.host_address,
    log.ssh_username,
    log.local_username,
    log.remote_addr,
  ].some((field) => String(field || '').toLowerCase().includes(value))
}

function filterLog(log, filterKey) {
  if (filterKey === 'favorite') return Boolean(log.favorite)
  if (filterKey === 'all') return true
  if (filterKey === 'closed') return log.status === 'closed'
  if (filterKey === 'failed') return log.status === 'failed' || log.status === 'rejected'
  return log.status === filterKey
}

export default function SessionLogPanel({
  vaultUnlocked,
  onReconnect,
  onOpenLogTab,
}) {
  const [toolbarTarget, setToolbarTarget] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [filterKey, setFilterKey] = useState('all')
  const [selectedLog, setSelectedLog] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState(null)
  const reloadLogs = useEffectEvent(() => {
    void loadLogs()
  })

  useEffect(() => {
    setToolbarTarget(document.getElementById('session-log-toolbar-slot'))
  }, [])

  useEffect(() => {
    void loadLogs()
  }, [vaultUnlocked])

  useEffect(() => {
    if (!vaultUnlocked) {
      return undefined
    }

    const activeSessionIDs = Array.from(new Set(logs
      .filter((log) => log.status === 'active' && log.session_id)
      .map((log) => log.session_id)))

    if (activeSessionIDs.length === 0) {
      return undefined
    }

    const unsubscribes = activeSessionIDs.map((sessionID) => (
      onRuntimeEvent(`term:closed:${sessionID}`, reloadLogs)
    ))
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [logs, reloadLogs, vaultUnlocked])

  async function loadLogs() {
    if (!vaultUnlocked) {
      setLogs([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      setLogs(await listSessionLogs(200))
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleFavorite(log) {
    const nextFavorite = !log.favorite
    setLogs((current) => current.map((item) => (
      item.id === log.id ? { ...item, favorite: nextFavorite } : item
    )))

    try {
      await toggleSessionLogFavorite(log.id, nextFavorite)
    } catch (err) {
      setLogs((current) => current.map((item) => (
        item.id === log.id ? { ...item, favorite: log.favorite } : item
      )))
      setError(err.message || String(err))
    }
  }

  async function handleSelectLog(log) {
    setSelectedLog(log)
    setTranscript(null)
    setTranscriptError(null)
    setTranscriptLoading(true)

    try {
      setTranscript(await getSessionTranscript(log.id))
    } catch (err) {
      setTranscriptError('暂无终端内容')
    } finally {
      setTranscriptLoading(false)
    }
  }

  function handleCloseDetail() {
    setSelectedLog(null)
    setTranscript(null)
    setTranscriptError(null)
  }

  function handleOpenFullLog(log = selectedLog) {
    if (!log) return
    onOpenLogTab?.(log)
  }

  function handleReconnect(log) {
    if (!vaultUnlocked || !log.host_id) return
    onReconnect(log.host_id)
  }

  const visibleLogs = useMemo(
    () => logs.filter((log) => filterLog(log, filterKey) && matchesLog(log, query)),
    [filterKey, logs, query],
  )

  useEffect(() => {
    if (selectedLog && !visibleLogs.some((log) => log.id === selectedLog.id)) {
      handleCloseDetail()
    }
  }, [selectedLog, visibleLogs])

  const toolbar = (
    <div className="session-log-toolbar">
      <label className="search-bar search-bar-compact session-log-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索日志..."
          aria-label="搜索日志"
        />
      </label>
      <div className="session-log-filter" aria-label="日志筛选">
        {statusFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={filterKey === filter.id ? 'active' : ''}
            aria-pressed={filterKey === filter.id}
            onClick={() => setFilterKey(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="ghost-button compact session-log-refresh"
        onClick={() => loadLogs()}
        disabled={loading || !vaultUnlocked}
      >
        <RefreshCw size={14} className={loading ? 'spin' : undefined} />
        刷新
      </button>
    </div>
  )

  return (
    <section className="session-log-stage">
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
      {error ? <div className="error-message">{error}</div> : null}

      {!vaultUnlocked ? (
        <div className="session-log-empty">
          <History size={26} />
          <strong>解锁后查看连接日志</strong>
        </div>
      ) : visibleLogs.length === 0 ? (
        <div className="session-log-empty">
          <History size={26} />
          <strong>{logs.length === 0 ? '连接后会在这里生成历史记录' : '没有匹配的日志'}</strong>
        </div>
      ) : (
        <div className={`session-log-workbench${selectedLog ? ' has-detail' : ''}`}>
          <div className="session-log-table" role="table" aria-label="连接历史日志">
            <div className="session-log-head" role="row">
              <span role="columnheader">日期</span>
              <span role="columnheader">用户</span>
              <span role="columnheader">主机</span>
              <span role="columnheader">状态</span>
              <span role="columnheader">收藏</span>
            </div>
            <div className="session-log-body">
              {visibleLogs.map((log) => {
                const hostTitle = log.host_name || log.host_id || log.host_address
                const status = statusLabels[log.status] || log.status || '未知'
                const duration = formatDuration(log.duration_millis)

                return (
                  <div
                    key={log.id}
                    className={`session-log-row${selectedLog?.id === log.id ? ' selected' : ''}`}
                    role="row"
                    tabIndex={0}
                    onClick={() => void handleSelectLog(log)}
                    onDoubleClick={() => handleReconnect(log)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleSelectLog(log)
                      }
                    }}
                  >
                    <div className="session-log-time" role="cell">
                      <strong>{formatDateTime(log.started_at)}</strong>
                      <span>
                        {formatTime(log.started_at)}
                        {log.ended_at ? ` - ${formatTime(log.ended_at)}` : ''}
                        {duration ? ` · ${duration}` : ''}
                      </span>
                    </div>
                    <div className="session-log-user" role="cell">
                      <span className="session-log-icon"><UserRound size={15} /></span>
                      <div>
                        <strong>{log.ssh_username || '未知用户'}</strong>
                        <span>{log.local_username || '本机用户未知'}</span>
                      </div>
                    </div>
                    <div className="session-log-host" role="cell">
                      <span className="session-log-icon"><PlugZap size={15} /></span>
                      <div>
                        <strong>{hostTitle}</strong>
                        <span>{log.remote_addr || `${log.host_address}:${log.host_port || 22}`} · {log.protocol || 'ssh'}</span>
                      </div>
                    </div>
                    <div className="session-log-status" role="cell">
                      <span className={`session-log-state ${log.status || 'unknown'}`}>
                        <Clock3 size={13} />
                        {status}
                      </span>
                      {log.error_message ? <small>{log.error_message}</small> : null}
                    </div>
                    <div className="session-log-favorite" role="cell">
                      <button
                        type="button"
                        className={`host-favorite-btn${log.favorite ? ' active' : ''}`}
                        aria-label={`${log.favorite ? '取消收藏' : '收藏'} ${hostTitle}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleToggleFavorite(log)
                        }}
                      >
                        <Star size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {selectedLog ? (
            <aside className="session-log-detail" aria-label="终端日志详情">
              <div className="session-log-detail-head">
                <span className="session-log-detail-icon"><FileText size={15} /></span>
                <div>
                  <strong>{selectedLog.host_name || selectedLog.host_address}</strong>
                  <span>{formatTime(selectedLog.started_at)}{selectedLog.ended_at ? ` - ${formatTime(selectedLog.ended_at)}` : ''}</span>
                </div>
                <button type="button" className="icon-button" aria-label="新标签页打开终端日志" onClick={() => handleOpenFullLog()}>
                  <ExternalLink size={15} />
                </button>
                <button type="button" className="icon-button" aria-label="关闭终端日志详情" onClick={handleCloseDetail}>
                  <X size={15} />
                </button>
              </div>
              <pre className="session-log-transcript">
                {transcriptLoading ? '正在读取终端日志...' : transcriptError || transcript?.content || '暂无终端内容'}
              </pre>
            </aside>
          ) : null}
        </div>
      )}
    </section>
  )
}
