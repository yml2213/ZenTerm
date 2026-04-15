import { Plus, Sun, Moon, Monitor, Terminal, Server } from 'lucide-react'
import { useState } from 'react'
import HostList from './components/HostList.jsx'
import HostForm, { createInitialHostForm } from './components/HostForm.jsx'
import TerminalPane from './components/TerminalPane.jsx'
import HostKeyModal from './components/HostKeyModal.jsx'
import { useTheme } from './contexts/ThemeProvider.jsx'
import {
  listHosts,
  addHost,
  unlock,
  connect,
  sendInput,
  resizeTerminal,
  acceptHostKey,
  rejectHostKey,
  onRuntimeEvent,
} from './lib/backend.js'

const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
}

export default function App() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [hosts, setHosts] = useState([])
  const [selectedHostId, setSelectedHostId] = useState(null)
  const [connectedHostId, setConnectedHostId] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState(STATUS.IDLE)
  const [sessionId, setSessionId] = useState(null)
  const [hostForm, setHostForm] = useState(createInitialHostForm)
  const [showAddHost, setShowAddHost] = useState(false)
  const [isAddingHost, setIsAddingHost] = useState(false)
  const [error, setError] = useState(null)
  const [hostKeyPrompt, setHostKeyPrompt] = useState(null)
  const [isAcceptingKey, setIsAcceptingKey] = useState(false)

  const connectedHost = hosts.find((h) => h.id === connectedHostId)
  const selectedHost = hosts.find((h) => h.id === selectedHostId)
  const vaultUnlocked = connectionStatus !== STATUS.IDLE || sessionId !== null

  function refreshHosts() {
    listHosts().then(setHosts, (err) => setError(err.message || String(err)))
  }

  function handleUnlock() {
    setError(null)
    unlock()
      .then(() => {
        setConnectionStatus(STATUS.IDLE)
        refreshHosts()
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleAddHost(event) {
    event.preventDefault()
    setIsAddingHost(true)
    addHost(hostForm)
      .then(() => {
        setHostForm(createInitialHostForm())
        setShowAddHost(false)
        refreshHosts()
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setIsAddingHost(false))
  }

  function handleSelectHost(id) {
    setSelectedHostId(id)
  }

  function handleConnect(id) {
    const host = hosts.find((h) => h.id === id)
    if (!host) return

    setError(null)
    setConnectionStatus(STATUS.CONNECTING)

    connect(id)
      .then((sid) => {
        setSessionId(sid)
        setConnectedHostId(id)
        setConnectionStatus(STATUS.CONNECTED)
      })
      .catch((err) => {
        const msg = err.message || String(err)
        if (msg.includes('host key') || msg.includes('fingerprint')) {
          setHostKeyPrompt({
            hostID: id,
            remoteAddr: `${host.address}:${host.port || 22}`,
            sha256: 'SHA256:xxx (pending)',
            md5: 'MD5:xxx (pending)',
          })
        } else {
          setError(msg)
        }
        setConnectionStatus(STATUS.IDLE)
      })
  }

  function handleAcceptHostKey() {
    if (!hostKeyPrompt) return
    setIsAcceptingKey(true)
    acceptHostKey(hostKeyPrompt.hostID)
      .then(() => {
        setHostKeyPrompt(null)
        handleConnect(hostKeyPrompt.hostID)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setIsAcceptingKey(false))
  }

  function handleRejectHostKey() {
    if (!hostKeyPrompt) return
    rejectHostKey(hostKeyPrompt.hostID)
      .then(() => {
        setHostKeyPrompt(null)
        setConnectionStatus(STATUS.IDLE)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleSessionClosed() {
    setSessionId(null)
    setConnectedHostId(null)
    setConnectionStatus(STATUS.IDLE)
  }

  function cycleTheme() {
    // Cycle: auto -> light -> dark -> auto
    if (theme === 'auto') {
      setTheme('light')
    } else if (theme === 'light') {
      setTheme('dark')
    } else {
      setTheme('auto')
    }
  }

  // Show icon based on current theme mode
  const getThemeIcon = () => {
    if (theme === 'auto') return Monitor
    if (theme === 'light') return Sun
    return Moon
  }
  const ThemeIcon = getThemeIcon()

  return (
    <div className="app-shell">
      {/* Top Toolbar */}
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="toolbar-logo">
            <Terminal size={18} />
          </div>
          <button
            type="button"
            className="toolbar-btn active"
          >
            <Server size={16} />
            主机
          </button>
        </div>

        <div className="toolbar-center">
          <div className="search-bar">
            <span className="search-icon">⌘</span>
            <span className="search-placeholder">搜索主机...</span>
          </div>
        </div>

        <div className="toolbar-right">
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
            onClick={() => setShowAddHost(true)}
          >
            <Plus size={16} />
            新建主机
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="app-content">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button type="button" className="sidebar-item active">
              <Server size={18} />
              <span>主机</span>
            </button>
          </nav>
          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-item"
              onClick={() => {}}
            >
              <Monitor size={18} />
              <span>设置</span>
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="content-area">
          {!vaultUnlocked && (
            <div className="unlock-banner">
              <span>首次使用需要解锁本地加密存储的密码保险箱</span>
              <button
                type="button"
                className="btn-unlock"
                onClick={handleUnlock}
              >
                解锁保险箱
              </button>
            </div>
          )}

          <HostList
            hosts={hosts}
            selectedHostId={selectedHostId}
            connectedHostId={connectedHostId}
            onSelect={handleSelectHost}
            onConnect={handleConnect}
            disabled={!vaultUnlocked}
          />

          {sessionId && (
            <div className="terminal-wrapper">
              <TerminalPane
                sessionId={sessionId}
                hostLabel={connectedHost?.name || connectedHost?.id || 'Session'}
                onSendInput={sendInput}
                onResize={resizeTerminal}
                onSessionClosed={handleSessionClosed}
                onError={(err) => setError(err.message || String(err))}
              />
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {error && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2>发生错误</h2>
            <p>{error}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setError(null)}
            >
              确定
            </button>
          </div>
        </div>
      )}

      {showAddHost && (
        <div className="modal-backdrop" onClick={() => setShowAddHost(false)}>
          <div className="modal-form" onClick={(e) => e.stopPropagation()}>
            <HostForm
              value={hostForm}
              onChange={setHostForm}
              onSubmit={handleAddHost}
              disabled={!vaultUnlocked}
              busy={isAddingHost}
              expanded={showAddHost}
              onToggle={() => setShowAddHost(false)}
            />
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
