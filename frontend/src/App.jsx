import { lazy, Suspense, useEffect, useMemo, useState, startTransition } from 'react'
import { KeyRound, LaptopMinimal, Lock, RefreshCcw, TriangleAlert } from 'lucide-react'

import HostForm, { createInitialHostForm } from './components/HostForm'
import HostList from './components/HostList'
import {
  addHost,
  connect,
  disconnect,
  isBackendAvailable,
  listHosts,
  resizeTerminal,
  sendInput,
  unlock,
} from './lib/backend'

const TerminalPane = lazy(() => import('./components/TerminalPane'))

function toHostPayload(form) {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    address: form.address.trim(),
    port: Number.parseInt(form.port, 10) || 22,
    username: form.username.trim(),
  }
}

function toIdentityPayload(form) {
  return {
    password: form.password,
    private_key: form.privateKey,
  }
}

export default function App() {
  const [hosts, setHosts] = useState([])
  const [selectedHostId, setSelectedHostId] = useState('')
  const [connectedHostId, setConnectedHostId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [masterPassword, setMasterPassword] = useState('')
  const [hostForm, setHostForm] = useState(createInitialHostForm)
  const [status, setStatus] = useState(isBackendAvailable() ? '保险箱待解锁。' : '当前为浏览器预览模式，真实连接需通过 Wails 运行。')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingHost, setSavingHost] = useState(false)

  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedHostId) ?? null,
    [hosts, selectedHostId],
  )

  async function refreshHosts() {
    try {
      const nextHosts = await listHosts()

      startTransition(() => {
        setHosts(nextHosts)
        if (!selectedHostId && nextHosts[0]) {
          setSelectedHostId(nextHosts[0].id)
        }
      })
    } catch (error) {
      setErrorMessage(String(error))
    }
  }

  useEffect(() => {
    void refreshHosts()
  }, [])

  async function handleUnlock(event) {
    event.preventDefault()
    setBusy(true)
    setErrorMessage('')

    try {
      await unlock(masterPassword)
      setStatus('保险箱已解锁，可以保存主机并发起连接。')
      await refreshHosts()
    } catch (error) {
      setErrorMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddHost(event) {
    event.preventDefault()
    setSavingHost(true)
    setErrorMessage('')

    try {
      await addHost(toHostPayload(hostForm), toIdentityPayload(hostForm))
      setHostForm(createInitialHostForm())
      setStatus('主机已安全保存。')
      await refreshHosts()
    } catch (error) {
      setErrorMessage(String(error))
    } finally {
      setSavingHost(false)
    }
  }

  async function handleConnect(hostID) {
    setBusy(true)
    setErrorMessage('')

    try {
      if (sessionId) {
        await disconnect(sessionId)
      }

      const nextSessionId = await connect(hostID)
      setSelectedHostId(hostID)
      setConnectedHostId(hostID)
      setSessionId(nextSessionId)
      setStatus(`已连接到 ${hostID}。`)
    } catch (error) {
      setErrorMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!sessionId) {
      return
    }

    try {
      await disconnect(sessionId)
    } catch (error) {
      setErrorMessage(String(error))
    } finally {
      setSessionId('')
      setConnectedHostId('')
      setStatus('会话已断开。')
    }
  }

  return (
    <div className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <main className="app-shell">
        <header className="hero">
          <div>
            <span className="hero-kicker">ZenTerm Control Deck</span>
            <h1>把 SSH 连接交给更轻、更安静的终端。</h1>
            <p>
              保险箱解锁、主机加密存储、实时事件订阅与终端尺寸同步都已经接通。
              现在前端只需要专注于把每一次输入和回显做得更顺手。
            </p>
          </div>

          <div className="hero-actions">
            <form className="unlock-panel" onSubmit={handleUnlock}>
              <label>
                <KeyRound size={16} />
                <span>Master Password</span>
              </label>
              <div className="unlock-row">
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(event) => setMasterPassword(event.target.value)}
                  placeholder="输入主密码解锁保险箱"
                />
                <button type="submit" className="primary-button" disabled={busy}>
                  <Lock size={16} />
                  <span>{busy ? '处理中...' : '解锁'}</span>
                </button>
              </div>
            </form>

            <button type="button" className="ghost-button" onClick={() => void refreshHosts()}>
              <RefreshCcw size={16} />
              <span>刷新主机列表</span>
            </button>
          </div>
        </header>

        <div className="status-bar">
          <span className="pill success">状态</span>
          <span>{status}</span>
        </div>

        {errorMessage ? (
          <div className="error-banner">
            <TriangleAlert size={18} />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <section className="workspace">
          <aside className="sidebar">
            <section className="panel sidebar-panel">
              <div className="panel-title">
                <LaptopMinimal size={18} />
                <span>Host Registry</span>
              </div>
              <HostList
                hosts={hosts}
                selectedHostId={selectedHostId}
                connectedHostId={connectedHostId}
                onSelect={setSelectedHostId}
                onConnect={(hostID) => void handleConnect(hostID)}
                disabled={busy}
              />
            </section>

            <HostForm
              value={hostForm}
              onChange={setHostForm}
              onSubmit={(event) => void handleAddHost(event)}
              disabled={busy}
              busy={savingHost}
            />
          </aside>

          <div className="terminal-column">
            <Suspense
              fallback={
                <section className="panel terminal-panel terminal-loading">
                  <span className="panel-kicker">Preparing Terminal</span>
                  <strong>正在加载终端渲染器...</strong>
                </section>
              }
            >
              <TerminalPane
                sessionId={sessionId}
                hostLabel={selectedHost ? `${selectedHost.username}@${selectedHost.address}` : 'Zen Console'}
                onSendInput={sendInput}
                onResize={resizeTerminal}
                onSessionClosed={() => {
                  setSessionId('')
                  setConnectedHostId('')
                  setStatus('远端会话已结束。')
                }}
                onError={(error) => {
                  setErrorMessage(String(error))
                }}
              />
            </Suspense>

            <div className="terminal-footer">
              <div>
                <span className="panel-kicker">Session</span>
                <strong>{sessionId || '未连接'}</strong>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void handleDisconnect()}
                disabled={!sessionId}
              >
                断开连接
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
