import { Plus, Sun, Moon, Monitor, Search, ShieldCheck, Server, TerminalSquare } from 'lucide-react'
import { startTransition, useEffect, useRef, useState } from 'react'
import HostList from './components/HostList.jsx'
import HostForm, { createHostFormFromHost, createInitialHostForm } from './components/HostForm.jsx'
import TerminalPane from './components/TerminalPane.jsx'
import HostKeyModal from './components/HostKeyModal.jsx'
import UnlockModal from './components/UnlockModal.jsx'
import SessionTabs from './components/SessionTabs.jsx'
import { useTheme } from './contexts/ThemeProvider.jsx'
import { useLanguage } from './contexts/LanguageProvider.jsx'
import {
  listHosts,
  addHost,
  updateHost,
  deleteHost,
  unlock,
  connect,
  disconnect,
  listSessions,
  acceptHostKey,
  rejectHostKey,
  sendInput,
  resizeTerminal,
  onRuntimeEvent,
} from './lib/backend.js'

function buildHostPayload(form) {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    address: form.address.trim(),
    port: Number.parseInt(form.port, 10) || 22,
    username: form.username.trim(),
  }
}

function buildIdentityPayload(form) {
  return {
    password: form.password,
    private_key: form.privateKey,
  }
}

function buildSessionTabs(snapshot, hosts, previousTabs) {
  const normalizedSnapshot = snapshot.map((session) => ({
    id: session.id || session.ID,
    hostID: session.hostID || session.HostID,
    connectedAt: session.connectedAt || session.ConnectedAt,
    remoteAddr: session.remoteAddr || session.RemoteAddr,
  }))
  const previousMap = new Map(previousTabs.map((tab) => [tab.sessionId, tab]))
  const hostMap = new Map(hosts.map((host) => [host.id, host]))
  const nextTabs = []

  for (const previous of previousTabs) {
    const session = normalizedSnapshot.find((item) => item.id === previous.sessionId)
    if (!session) {
      continue
    }

    const host = hostMap.get(session.hostID)
    nextTabs.push({
      sessionId: session.id,
      hostID: session.hostID,
      title: host?.name || host?.id || previous.title || session.hostID,
      connectedAt: session.connectedAt,
      remoteAddr: session.remoteAddr,
    })
  }

  for (const session of normalizedSnapshot) {
    if (previousMap.has(session.id)) {
      continue
    }

    const host = hostMap.get(session.hostID)
    nextTabs.push({
      sessionId: session.id,
      hostID: session.hostID,
      title: host?.name || host?.id || session.hostID,
      connectedAt: session.connectedAt,
      remoteAddr: session.remoteAddr,
    })
  }

  return nextTabs
}

function normalizeHostKeyPrompt(prompt) {
  if (!prompt) {
    return null
  }

  return {
    hostID: String(prompt.hostID || ''),
    remoteAddr: String(prompt.remoteAddr || ''),
    key: String(prompt.key || ''),
    sha256: String(prompt.sha256 || ''),
    md5: String(prompt.md5 || ''),
  }
}

function matchesHost(host, query) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return true
  }

  return [host.id, host.name, host.address, host.username]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(keyword))
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()
  const [hosts, setHosts] = useState([])
  const [selectedHostId, setSelectedHostId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [hostDialogMode, setHostDialogMode] = useState(null)
  const [hostForm, setHostForm] = useState(createInitialHostForm)
  const [isSavingHost, setIsSavingHost] = useState(false)
  const [error, setError] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [hostKeyPrompt, setHostKeyPrompt] = useState(null)
  const [isAcceptingKey, setIsAcceptingKey] = useState(false)
  const [sessionTabs, setSessionTabs] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [connectingHostIds, setConnectingHostIds] = useState([])

  const rejectedHostIdsRef = useRef(new Set())

  const filteredHosts = hosts.filter((host) => matchesHost(host, searchQuery))
  const sessionCountByHost = sessionTabs.reduce((acc, session) => {
    acc[session.hostID] = (acc[session.hostID] || 0) + 1
    return acc
  }, {})
  const activeSession = sessionTabs.find((session) => session.sessionId === activeSessionId) || null
  const selectedHost = hosts.find((host) => host.id === selectedHostId) || null

  function closeHostDialog() {
    setHostDialogMode(null)
    setHostForm(createInitialHostForm())
  }

  function refreshHosts() {
    return listHosts()
      .then((nextHosts) => {
        startTransition(() => {
          setHosts(nextHosts)
          setSelectedHostId((current) => {
            if (current && nextHosts.some((host) => host.id === current)) {
              return current
            }
            return nextHosts[0]?.id || null
          })
          setSessionTabs((currentTabs) => currentTabs.map((tab) => {
            const host = nextHosts.find((item) => item.id === tab.hostID)
            if (!host) {
              return tab
            }

            return {
              ...tab,
              title: host.name || host.id,
            }
          }))
        })
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function syncSessions(currentHosts = hosts) {
    return listSessions()
      .then((snapshot) => {
        setSessionTabs((currentTabs) => {
          const nextTabs = buildSessionTabs(snapshot, currentHosts, currentTabs)
          setActiveSessionId((currentActive) => {
            if (currentActive && nextTabs.some((tab) => tab.sessionId === currentActive)) {
              return currentActive
            }
            return nextTabs.at(-1)?.sessionId || null
          })
          return nextTabs
        })
      })
      .catch((err) => setError(err.message || String(err)))
  }

  useEffect(() => {
    let disposed = false

    async function bootstrap() {
      const loadedHosts = await listHosts()
      if (disposed) {
        return
      }

      startTransition(() => {
        setHosts(loadedHosts)
        setSelectedHostId(loadedHosts[0]?.id || null)
      })

      const snapshot = await listSessions()
      if (disposed) {
        return
      }

      startTransition(() => {
        const nextTabs = buildSessionTabs(snapshot, loadedHosts, [])
        setSessionTabs(nextTabs)
        setActiveSessionId(nextTabs.at(-1)?.sessionId || null)
      })
    }

    bootstrap().catch((err) => {
      if (!disposed) {
        setError(err.message || String(err))
      }
    })

    const offHostKey = onRuntimeEvent('ssh:host-key:confirm', (prompt) => {
      setHostKeyPrompt(normalizeHostKeyPrompt(prompt))
    })

    return () => {
      disposed = true
      offHostKey()
    }
  }, [])

  function openCreateHost() {
    if (!vaultUnlocked) {
      setError('请先解锁本地保险箱，再保存主机配置。')
      return
    }

    setHostForm(createInitialHostForm())
    setHostDialogMode('create')
  }

  function openEditHost(host) {
    if (!vaultUnlocked) {
      setError('请先解锁本地保险箱，再编辑主机配置。')
      return
    }

    setHostForm(createHostFormFromHost(host))
    setHostDialogMode('edit')
  }

  function handleUnlock(event) {
    event.preventDefault()
    setUnlockBusy(true)
    setError(null)

    unlock(unlockPassword)
      .then(() => {
        setVaultUnlocked(true)
        setUnlockPassword('')
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setUnlockBusy(false))
  }

  function handleSaveHost(event) {
    event.preventDefault()
    setIsSavingHost(true)
    setError(null)

    const host = buildHostPayload(hostForm)
    const identity = buildIdentityPayload(hostForm)
    const action = hostDialogMode === 'edit' ? updateHost(host, identity) : addHost(host, identity)

    action
      .then(async () => {
        closeHostDialog()
        await refreshHosts()
        setSelectedHostId(host.id)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setIsSavingHost(false))
  }

  function handleDeleteHost() {
    if (!deleteCandidate) {
      return
    }

    const hasSession = sessionTabs.some((session) => session.hostID === deleteCandidate.id)
    if (hasSession) {
      setError('该主机仍有活跃终端标签，请先关闭对应会话后再删除。')
      setDeleteCandidate(null)
      return
    }

    deleteHost(deleteCandidate.id)
      .then(async () => {
        setDeleteCandidate(null)
        if (selectedHostId === deleteCandidate.id) {
          setSelectedHostId(null)
        }
        await refreshHosts()
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleConnect(hostID) {
    if (!vaultUnlocked) {
      setError('连接 SSH 前请先解锁本地保险箱。')
      return
    }

    setConnectingHostIds((current) => current.concat(hostID))
    setError(null)

    connect(hostID)
      .then(async (sessionID) => {
        await syncSessions()
        setActiveSessionId(sessionID)
      })
      .catch((err) => {
        if (rejectedHostIdsRef.current.delete(hostID)) {
          return
        }
        setError(err.message || String(err))
      })
      .finally(() => {
        setConnectingHostIds((current) => current.filter((id) => id !== hostID))
      })
  }

  function handleCloseTab(sessionID) {
    disconnect(sessionID)
      .then(() => {
        setSessionTabs((currentTabs) => {
          const nextTabs = currentTabs.filter((session) => session.sessionId !== sessionID)
          setActiveSessionId((currentActive) => {
            if (currentActive !== sessionID) {
              return currentActive
            }
            return nextTabs.at(-1)?.sessionId || null
          })
          return nextTabs
        })
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleSessionClosed(sessionID) {
    setSessionTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((session) => session.sessionId !== sessionID)
      setActiveSessionId((currentActive) => {
        if (currentActive !== sessionID) {
          return currentActive
        }
        return nextTabs.at(-1)?.sessionId || null
      })
      return nextTabs
    })
  }

  function handleAcceptHostKey() {
    if (!hostKeyPrompt) {
      return
    }

    setIsAcceptingKey(true)
    acceptHostKey(hostKeyPrompt.hostID, hostKeyPrompt.key)
      .then(() => {
        setHostKeyPrompt(null)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setIsAcceptingKey(false))
  }

  function handleRejectHostKey() {
    if (!hostKeyPrompt) {
      return
    }

    rejectedHostIdsRef.current.add(hostKeyPrompt.hostID)
    rejectHostKey(hostKeyPrompt.hostID)
      .then(() => {
        setHostKeyPrompt(null)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function cycleTheme() {
    if (theme === 'auto') {
      setTheme('light')
    } else if (theme === 'light') {
      setTheme('dark')
    } else {
      setTheme('auto')
    }
  }

  const ThemeIcon = theme === 'auto' ? Monitor : theme === 'light' ? Sun : Moon

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="toolbar-logo">
            <TerminalSquare size={18} />
          </div>
          <div className="toolbar-brand">
            <strong>ZenTerm</strong>
            <span>SSH Workbench</span>
          </div>
        </div>

        <div className="toolbar-center">
          <label className="search-bar">
            <Search size={15} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label="搜索主机"
            />
          </label>
        </div>

        <div className="toolbar-right">
          <span className={`pill ${vaultUnlocked ? 'success' : 'subtle'}`}>
            <ShieldCheck size={14} />
            {vaultUnlocked ? '保险箱已解锁' : '保险箱未解锁'}
          </span>
          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={cycleTheme}
            aria-label="切换主题"
          >
            <ThemeIcon size={16} />
          </button>
          <button
            type="button"
            className="toolbar-btn primary"
            onClick={openCreateHost}
          >
            <Plus size={16} />
            {t('newHost')}
          </button>
        </div>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <section className="sidebar-section">
            <span className="sidebar-label">当前范围</span>
            <div className="sidebar-stat">
              <Server size={16} />
              <div>
                <strong>{hosts.length}</strong>
                <span>已保存主机</span>
              </div>
            </div>
            <div className="sidebar-stat">
              <TerminalSquare size={16} />
              <div>
                <strong>{sessionTabs.length}</strong>
                <span>活跃终端标签</span>
              </div>
            </div>
          </section>

          <section className="sidebar-section">
            <span className="sidebar-label">已选主机</span>
            {selectedHost ? (
              <div className="sidebar-host">
                <strong>{selectedHost.name || selectedHost.id}</strong>
                <span>{selectedHost.username}@{selectedHost.address}:{selectedHost.port || 22}</span>
                <small>{selectedHost.known_hosts ? '已写入可信指纹' : '首次连接需确认指纹'}</small>
              </div>
            ) : (
              <p className="sidebar-note">从右侧列表中选择一台主机，可编辑配置或打开新的终端标签。</p>
            )}
          </section>

          <section className="sidebar-section">
            <span className="sidebar-label">延期路线图</span>
            <p className="sidebar-note">SFTP、端口转发、代码片段和设置中心已从本期主流程移出，等 MVP 稳定后再继续扩展。</p>
          </section>
        </aside>

        <main className="content-area">
          <section className="content-intro panel">
            <div>
              <span className="panel-kicker">Hosts</span>
              <h1>主机管理与多标签终端</h1>
              <p>主机列表支持搜索、编辑、删除；连接后会在下方打开独立终端标签，可随时切换和关闭。</p>
            </div>
          </section>

          <HostList
            hosts={filteredHosts}
            selectedHostId={selectedHostId}
            sessionCountByHost={sessionCountByHost}
            connectingHostIds={connectingHostIds}
            onSelect={setSelectedHostId}
            onConnect={handleConnect}
            onEdit={openEditHost}
            onDelete={setDeleteCandidate}
            disabled={!vaultUnlocked}
          />

          <SessionTabs
            sessions={sessionTabs}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onClose={handleCloseTab}
          />

          <div className="terminal-wrapper">
            <TerminalPane
              sessions={sessionTabs}
              activeSessionId={activeSessionId}
              activeSessionTitle={activeSession?.title || 'Zen Console'}
              onSendInput={sendInput}
              onResize={resizeTerminal}
              onSessionClosed={handleSessionClosed}
              onError={(err) => setError(err.message || String(err))}
            />
          </div>
        </main>
      </div>

      <UnlockModal
        open={!vaultUnlocked}
        password={unlockPassword}
        busy={unlockBusy}
        onPasswordChange={setUnlockPassword}
        onSubmit={handleUnlock}
      />

      {hostDialogMode && (
        <div className="modal-backdrop" onClick={closeHostDialog}>
          <div className="modal-form" onClick={(event) => event.stopPropagation()}>
            <HostForm
              mode={hostDialogMode}
              value={hostForm}
              onChange={setHostForm}
              onSubmit={handleSaveHost}
              disabled={!vaultUnlocked}
              busy={isSavingHost}
              onClose={closeHostDialog}
            />
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-content modal-narrow" role="dialog" aria-modal="true" aria-labelledby="delete-host-title">
            <h2 id="delete-host-title">确认删除主机</h2>
            <p>这会删除 {deleteCandidate.name || deleteCandidate.id} 的保存配置和加密凭据，且无法撤销。</p>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setDeleteCandidate(null)}>
                取消
              </button>
              <button type="button" className="primary-button danger" onClick={handleDeleteHost}>
                删除主机
              </button>
            </div>
          </section>
        </div>
      )}

      {error && (
        <div className="modal-backdrop">
          <div className="modal-content modal-narrow">
            <h2>{t('errorTitle')}</h2>
            <p>{error}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => setError(null)}
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      )}

      <HostKeyModal
        prompt={hostKeyPrompt}
        busy={isAcceptingKey}
        onAccept={handleAcceptHostKey}
        onReject={handleRejectHostKey}
      />
    </div>
  )
}
