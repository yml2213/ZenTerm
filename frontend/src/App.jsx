import { Plus, Sun, Moon, Monitor } from 'lucide-react'
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
  const { theme, setTheme } = useTheme()
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
    const themes = ['light', 'dark', 'auto']
    const current = themes.indexOf(theme)
    const next = themes[(current + 1) % themes.length]
    setTheme(next)
  }

  const themeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const ThemeIcon = themeIcon

  return (
    <div className="shell">
      <div className="workspace-shell">
        <header className="panel topbar">
          <div className="desktop-lights">
            <div className="traffic-lights">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="topbar-tabs">
            <button type="button" className="topbar-tab active">
              主机
            </button>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button"
              onClick={cycleTheme}
              aria-label="切换主题"
            >
              <ThemeIcon size={16} />
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowAddHost(true)}
            >
              <Plus size={16} />
              新建主机
            </button>
          </div>
        </header>

        <div className="workspace-body">
          <nav className="panel app-nav">
            <div className="app-nav-header">
              <span className="panel-kicker">Navigation</span>
              <strong>ZenTerm</strong>
            </div>
            <div className="nav-list">
              <button type="button" className="nav-item active">
                主机列表
              </button>
            </div>
            <div className="nav-footer">
              <p>安全终端 · 本地加密存储</p>
            </div>
          </nav>

          <main className="main-stage panel">
            <section className="hosts-board">
              <div className="section-header">
                <span className="panel-title">
                  主机列表
                </span>
                {!vaultUnlocked && (
                  <div className="section-header-actions">
                    <button
                      type="button"
                      className="section-action"
                      onClick={handleUnlock}
                    >
                      解锁保险箱
                    </button>
                  </div>
                )}
              </div>

              <HostList
                hosts={hosts}
                selectedHostId={selectedHostId}
                connectedHostId={connectedHostId}
                onSelect={handleSelectHost}
                onConnect={handleConnect}
                disabled={!vaultUnlocked}
              />
            </section>

            <section className="session-stage panel">
              {sessionId ? (
                <TerminalPane
                  sessionId={sessionId}
                  hostLabel={connectedHost?.name || connectedHost?.id || 'Session'}
                  onSendInput={sendInput}
                  onResize={resizeTerminal}
                  onSessionClosed={handleSessionClosed}
                  onError={(err) => setError(err.message || String(err))}
                />
              ) : (
                <div className="session-empty">
                  <div className="session-empty-copy">
                    <h2>终端会话</h2>
                    <p>选择一个主机并点击「连接」来启动 SSH 会话。</p>
                  </div>
                  <div className="session-empty-grid">
                    <div className="session-empty-card">
                      <span className="panel-kicker">01</span>
                      <div>
                        <strong>解锁保险箱</strong>
                        <p>首次使用需要解锁本地加密存储的密码保险箱。</p>
                      </div>
                    </div>
                    <div className="session-empty-card">
                      <span className="panel-kicker">02</span>
                      <div>
                        <strong>选择主机</strong>
                        <p>从左侧列表选择一个已配置的 SSH 主机。</p>
                      </div>
                    </div>
                    <div className="session-empty-card accent">
                      <span className="panel-kicker">03</span>
                      <div>
                        <strong>开始连接</strong>
                        <p>点击连接按钮，终端将自动建立安全连接。</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>

        {error && (
          <div className="modal-backdrop">
            <div className="hostkey-modal">
              <h2>发生错误</h2>
              <p>{error}</p>
              <div className="hostkey-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setError(null)}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddHost && (
          <div className="modal-backdrop">
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
        )}

        <HostKeyModal
          prompt={hostKeyPrompt}
          busy={isAcceptingKey}
          onAccept={handleAcceptHostKey}
          onReject={handleRejectHostKey}
        />
      </div>
    </div>
  )
}
