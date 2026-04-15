import {
  LayoutGrid,
  Lock,
  Monitor,
  Moon,
  FolderOpen,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  TerminalSquare,
} from 'lucide-react'
import { startTransition, useEffect, useRef, useState } from 'react'
import HostList from './components/HostList.jsx'
import HostForm, { createHostFormFromHost, createInitialHostForm } from './components/HostForm.jsx'
import HostKeyModal from './components/HostKeyModal.jsx'
import UnlockModal from './components/UnlockModal.jsx'
import SessionTabs from './components/SessionTabs.jsx'
import SftpWorkspace from './components/SftpWorkspace.jsx'
import VaultSettingsPanel from './components/VaultSettingsPanel.jsx'
import { useTheme } from './contexts/ThemeProvider.jsx'
import { useLanguage } from './contexts/LanguageProvider.jsx'
import {
  changeMasterPassword,
  getVaultStatus,
  initializeVaultWithPreferences,
  listHosts,
  addHost,
  updateHost,
  deleteHost,
  resetVault,
  unlockWithPreferences,
  tryAutoUnlock,
  connect,
  disconnect,
  listSessions,
  acceptHostKey,
  rejectHostKey,
  onRuntimeEvent,
  windowToggleMaximise,
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

function createVaultSetupForm() {
  return {
    password: '',
    confirmPassword: '',
    riskAcknowledged: false,
  }
}

function createChangeMasterForm() {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  }
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()
  const [activeWorkspace, setActiveWorkspace] = useState('vaults')
  const [activeSidebarPage, setActiveSidebarPage] = useState('hosts')
  const [hosts, setHosts] = useState([])
  const [selectedHostId, setSelectedHostId] = useState(null)
  const [selectedSftpHostId, setSelectedSftpHostId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [vaultInitialized, setVaultInitialized] = useState(false)
  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [vaultReady, setVaultReady] = useState(false)
  const [vaultSetupForm, setVaultSetupForm] = useState(createVaultSetupForm)
  const [vaultSetupBusy, setVaultSetupBusy] = useState(false)
  const [accessPassword, setAccessPassword] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [changeMasterForm, setChangeMasterForm] = useState(createChangeMasterForm)
  const [changeMasterBusy, setChangeMasterBusy] = useState(false)
  const [resetVaultConfirmed, setResetVaultConfirmed] = useState(false)
  const [resetVaultBusy, setResetVaultBusy] = useState(false)
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
  const selectedSftpHost = hosts.find((host) => host.id === selectedSftpHostId) || null
  const onlineHostsCount = Object.keys(sessionCountByHost).length
  const navigationItems = [
    { id: 'hosts', label: '主机', icon: LayoutGrid },
  ]

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
          setSelectedSftpHostId((current) => {
            if (current && nextHosts.some((host) => host.id === current)) {
              return current
            }
            return null
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

      const status = await getVaultStatus()
      if (disposed) {
        return
      }

      let unlocked = Boolean(status.unlocked)
      if (status.initialized && !unlocked) {
        unlocked = await tryAutoUnlock()
        if (disposed) {
          return
        }
      }

      startTransition(() => {
        setVaultInitialized(Boolean(status.initialized))
        setVaultUnlocked(Boolean(unlocked))
        setVaultReady(true)
      })
    }

    bootstrap().catch((err) => {
      if (!disposed) {
        setError(err.message || String(err))
        setVaultReady(true)
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
      setError('请输入主密码后继续保存主机配置。')
      return
    }

    setHostForm(createInitialHostForm())
    setHostDialogMode('create')
  }

  function openEditHost(host) {
    if (!vaultUnlocked) {
      setError('请输入主密码后继续编辑主机配置。')
      return
    }

    setHostForm(createHostFormFromHost(host))
    setHostDialogMode('edit')
  }

  function handleInitializeVault(event) {
    event.preventDefault()

    if (vaultSetupForm.password !== vaultSetupForm.confirmPassword) {
      setError('两次输入的主密码不一致，请重新确认。')
      return
    }
    if (!vaultSetupForm.riskAcknowledged) {
      setError('请先确认你已了解主密码遗失后无法恢复。')
      return
    }

    setVaultSetupBusy(true)
    setError(null)

    initializeVaultWithPreferences(vaultSetupForm.password, true)
      .then(() => {
        setVaultInitialized(true)
        setVaultUnlocked(true)
        setVaultSetupForm(createVaultSetupForm())
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setVaultSetupBusy(false))
  }

  function handleAccessPassword(event) {
    event.preventDefault()
    setAccessBusy(true)
    setError(null)

    unlockWithPreferences(accessPassword, true)
      .then(() => {
        setVaultUnlocked(true)
        setAccessPassword('')
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setAccessBusy(false))
  }

  function handleSidebarPageChange(page) {
    setActiveSidebarPage(page)
  }

  function handleWorkspaceStripDoubleClick(event) {
    if (event.target.closest('button, input, textarea, select, a, [role="button"]')) {
      return
    }

    windowToggleMaximise().catch((err) => setError(err.message || String(err)))
  }

  function handleWorkspaceChange(workspace) {
    setActiveWorkspace(workspace)
  }

  function handleChangeMasterField(field, value) {
    setChangeMasterForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleChangeMasterPassword(event) {
    event.preventDefault()

    if (changeMasterForm.nextPassword !== changeMasterForm.confirmPassword) {
      setError('两次输入的新主密码不一致，请重新确认。')
      return
    }

    setChangeMasterBusy(true)
    setError(null)

    changeMasterPassword(
      changeMasterForm.currentPassword,
      changeMasterForm.nextPassword,
      true,
    )
      .then(() => {
        setChangeMasterForm(createChangeMasterForm())
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setChangeMasterBusy(false))
  }

  function handleResetVault() {
    if (!resetVaultConfirmed) {
      setError('请先确认要清空当前 Vault。')
      return
    }

    setResetVaultBusy(true)
    setError(null)

    resetVault()
      .then(() => {
        startTransition(() => {
          setActiveWorkspace('vaults')
          setActiveSidebarPage('hosts')
          setHosts([])
          setSelectedHostId(null)
          setSelectedSftpHostId(null)
          setSearchQuery('')
          setVaultInitialized(false)
          setVaultUnlocked(false)
          setVaultSetupForm(createVaultSetupForm())
          setAccessPassword('')
          setChangeMasterForm(createChangeMasterForm())
          setResetVaultConfirmed(false)
          setHostDialogMode(null)
          setDeleteCandidate(null)
          setHostKeyPrompt(null)
          setSessionTabs([])
          setActiveSessionId(null)
          setConnectingHostIds([])
        })
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setResetVaultBusy(false))
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
      setError('请输入主密码后继续连接 SSH。')
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

  function handlePickSftpHost(hostID) {
    const nextHostID = hostID || selectedSftpHostId || selectedHostId || hosts[0]?.id || null
    if (!nextHostID) {
      openCreateHost()
      return
    }

    setSelectedSftpHostId(nextHostID)
  }

  const ThemeIcon = theme === 'auto' ? Monitor : theme === 'light' ? Sun : Moon
  const showSetupModal = !vaultInitialized && vaultReady
  const showAccessModal = vaultInitialized && !vaultUnlocked && vaultReady

  return (
    <div className="app-shell">
      <section className="workspace-strip" onDoubleClick={handleWorkspaceStripDoubleClick}>
        <div className="workspace-modules">
          <button
            type="button"
            className={`workspace-module${activeWorkspace === 'vaults' ? ' active' : ''}`}
            onClick={() => handleWorkspaceChange('vaults')}
            aria-pressed={activeWorkspace === 'vaults'}
          >
            <Lock size={15} />
            {t('vaults')}
          </button>
          <button
            type="button"
            className={`workspace-module${activeWorkspace === 'sftp' ? ' active' : ''}`}
            onClick={() => handleWorkspaceChange('sftp')}
            aria-pressed={activeWorkspace === 'sftp'}
          >
            <FolderOpen size={15} />
            {t('sftp')}
          </button>
        </div>
        {activeWorkspace === 'vaults' ? (
          <SessionTabs
            className="workspace-tabs"
            sessions={sessionTabs}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onClose={handleCloseTab}
            emptyLabel="还没有打开的 SSH 终端标签"
            emptyDescription="连接任意主机后，打开的 SSH 会话会显示在这条顶部工作条里。"
          />
        ) : (
          <div className="workspace-strip-spacer" />
        )}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={cycleTheme}
          aria-label="切换主题"
        >
          <ThemeIcon size={16} />
        </button>
      </section>

      {activeWorkspace === 'vaults' ? (
        <div className="app-content">
          <aside className="sidebar">
            <section className="sidebar-brand-card">
              <div className="sidebar-brand-icon">
                <TerminalSquare size={18} />
              </div>
              <div className="sidebar-brand-copy">
                <strong>ZenTerm</strong>
                <span>SSH Workbench</span>
              </div>
            </section>

            <nav className="sidebar-nav" aria-label="工作台导航">
              {navigationItems.map((item) => {
                const Icon = item.icon

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`sidebar-nav-item${activeSidebarPage === item.id ? ' active' : ''}`}
                    aria-current={activeSidebarPage === item.id ? 'page' : undefined}
                    onClick={() => handleSidebarPageChange(item.id)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>

            <div className="sidebar-spacer" />

            <div className="sidebar-footer">
              <button
                type="button"
                className={`sidebar-nav-item${activeSidebarPage === 'settings' ? ' active' : ''}`}
                aria-current={activeSidebarPage === 'settings' ? 'page' : undefined}
                onClick={() => handleSidebarPageChange('settings')}
              >
                <Settings2 size={16} />
                <span>设置</span>
              </button>
            </div>
          </aside>

          <section className="page-shell">
            <header className="page-toolbar">
              {activeSidebarPage === 'hosts' ? (
                <div className="page-toolbar-main">
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
              ) : (
                <div className="page-toolbar-copy">
                  <span className="panel-kicker">Security</span>
                  <h2>保险箱与主密码</h2>
                  <p>在这里管理主密码与整个 Vault 的重置操作。日常进入默认由系统钥匙串接管。</p>
                </div>
              )}

              <div className="page-toolbar-actions">
                <span className={`pill ${vaultUnlocked ? 'success' : 'subtle'}`}>
                  <ShieldCheck size={14} />
                  {vaultInitialized ? (vaultUnlocked ? '主密码已就绪' : '需要主密码') : '等待初始化'}
                </span>
                {activeSidebarPage === 'hosts' && (
                  <button
                    type="button"
                    className="toolbar-btn primary"
                    onClick={openCreateHost}
                  >
                    <Plus size={16} />
                    {t('newHost')}
                  </button>
                )}
              </div>
            </header>

            <main className="content-area">
              {activeSidebarPage === 'hosts' ? (
                <section className="hosts-stage panel">
                  <div className="section-head hosts-stage-head">
                    <div>
                      <span className="panel-kicker">Vaults</span>
                      <h1>全部主机</h1>
                    </div>
                    <div className="section-head-meta">
                      <span>{filteredHosts.length} 条</span>
                      <span className="pill subtle">{onlineHostsCount} 台在线</span>
                    </div>
                  </div>

                  <HostList
                    hosts={filteredHosts}
                    hasAnyHosts={hosts.length > 0}
                    searchQuery={searchQuery}
                    selectedHostId={selectedHostId}
                    sessionCountByHost={sessionCountByHost}
                    connectingHostIds={connectingHostIds}
                    onSelect={setSelectedHostId}
                    onConnect={handleConnect}
                    onEdit={openEditHost}
                    onDelete={setDeleteCandidate}
                    disabled={!vaultUnlocked}
                  />
                </section>
              ) : (
                <VaultSettingsPanel
                  vaultUnlocked={vaultUnlocked}
                  changeForm={changeMasterForm}
                  changeBusy={changeMasterBusy}
                  resetConfirmed={resetVaultConfirmed}
                  resetBusy={resetVaultBusy}
                  onChangeField={handleChangeMasterField}
                  onChangePassword={handleChangeMasterPassword}
                  onResetConfirmedChange={setResetVaultConfirmed}
                  onResetVault={handleResetVault}
                />
              )}
            </main>
          </section>
        </div>
      ) : (
        <SftpWorkspace
          hosts={hosts}
          selectedHost={selectedSftpHost}
          vaultUnlocked={vaultUnlocked}
          onChooseHost={handlePickSftpHost}
          onCreateHost={openCreateHost}
          onBackToVaults={() => handleWorkspaceChange('vaults')}
          onError={(message) => setError(message)}
        />
      )}

      <UnlockModal
        open={showSetupModal}
        mode="setup"
        password={vaultSetupForm.password}
        confirmPassword={vaultSetupForm.confirmPassword}
        busy={vaultSetupBusy}
        riskAcknowledged={vaultSetupForm.riskAcknowledged}
        onPasswordChange={(value) => setVaultSetupForm((current) => ({ ...current, password: value }))}
        onConfirmPasswordChange={(value) => setVaultSetupForm((current) => ({ ...current, confirmPassword: value }))}
        onRiskAcknowledgedChange={(value) => setVaultSetupForm((current) => ({ ...current, riskAcknowledged: value }))}
        onSubmit={handleInitializeVault}
      />

      <UnlockModal
        open={showAccessModal}
        mode="continue"
        password={accessPassword}
        busy={accessBusy}
        onPasswordChange={setAccessPassword}
        onSubmit={handleAccessPassword}
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
