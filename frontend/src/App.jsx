import {
  FolderLock,
  KeyRound,
  LayoutGrid,
  Monitor,
  Moon,
  FolderOpen,
  Plus,
  Search,
  Settings2,
  Shield,
  Sun,
  TerminalSquare,
} from 'lucide-react'
import { Suspense, lazy, startTransition, useEffect, useRef, useState } from 'react'
import HostList from './components/HostList.jsx'
import HostForm, { createHostFormFromHost, createInitialHostForm } from './components/HostForm.jsx'
import HostKeyModal from './components/HostKeyModal.jsx'
import UnlockModal from './components/UnlockModal.jsx'
import SessionTabs from './components/SessionTabs.jsx'
import { useTheme } from './contexts/ThemeProvider.jsx'
import { useLanguage } from './contexts/LanguageProvider.jsx'
import {
  changeMasterPassword,
  getKeychainStatus,
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
  sendInput,
  acceptHostKey,
  rejectHostKey,
  onRuntimeEvent,
  persistWindowState,
  resizeTerminal,
  windowToggleMaximise,
} from './lib/backend.js'

const SftpWorkspace = lazy(() => import('./components/SftpWorkspace.jsx'))
const TerminalPane = lazy(() => import('./components/TerminalPane.jsx'))
const VaultSettingsPanel = lazy(() => import('./components/VaultSettingsPanel.jsx'))
const KnownHostsPanel = lazy(() => import('./components/KnownHostsPanel.jsx'))
const KeychainPanel = lazy(() => import('./components/KeychainPanel.jsx'))

function buildHostPayload(form) {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    address: form.address.trim(),
    port: Number.parseInt(form.port, 10) || 22,
    username: form.username.trim(),
    credential_id: form.credentialId || undefined,
  }
}

function buildIdentityPayload(form) {
  if (form.credentialId) {
    return {}
  }
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

function PanelFallback({
  className = 'panel',
  kicker = 'Loading',
  title = '正在加载面板',
  description = 'ZenTerm 正在准备当前工作区内容，请稍候。',
}) {
  return (
    <section className={className}>
      <div className="terminal-toolbar">
        <div className="terminal-toolbar-main">
          <span className="panel-kicker">{kicker}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
    </section>
  )
}

const sidebarPages = {
  hosts: {
    label: '主机',
    icon: LayoutGrid,
    title: '全部主机',
    kicker: 'Vaults',
    description: '集中管理保险箱中的 SSH 主机与连接入口，后续的终端、SFTP 和身份能力都会从这里展开。',
  },
  keychain: {
    label: '钥匙串',
    icon: KeyRound,
    title: '钥匙串',
    kicker: 'Keychain',
    description: '集中管理密码、私钥与凭据来源，让主机配置、SFTP 与未来扩展模块共享同一套安全入口。',
    highlights: [
      { title: '凭据条目', description: '后续会把已保存密码、私钥引用和凭据来源整理成独立列表。' },
      { title: '来源标记', description: '区分系统钥匙串、本地导入、临时输入等不同凭据来源。' },
      { title: '安全操作', description: '为替换、清除、重新同步系统钥匙串预留清晰操作入口。' },
    ],
  },
  knownHosts: {
    label: '已知主机',
    icon: Shield,
    title: '已知主机',
    kicker: 'Known Hosts',
    description: '把当前保存的可信指纹集中展示，后续可在这里审查、比对和清理主机信任关系。',
    highlights: [
      { title: '指纹审查', description: '展示 SHA256、来源主机和最近使用时间，方便排查变更。' },
      { title: '信任同步', description: '为未来的导入、导出和批量清理 known_hosts 预留位置。' },
      { title: '风险提醒', description: '后续可补主机指纹变化、冲突记录和人工确认轨迹。' },
    ],
  },
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
  const [keychainStatus, setKeychainStatus] = useState(null)
  const [keychainLoading, setKeychainLoading] = useState(false)

  const rejectedHostIdsRef = useRef(new Set())

  const filteredHosts = hosts.filter((host) => matchesHost(host, searchQuery))
  const sessionCountByHost = sessionTabs.reduce((acc, session) => {
    acc[session.hostID] = (acc[session.hostID] || 0) + 1
    return acc
  }, {})
  const selectedSftpHost = hosts.find((host) => host.id === selectedSftpHostId) || null
  const activeSession = sessionTabs.find((session) => session.sessionId === activeSessionId) || null
  const navigationItems = [
    { id: 'hosts', label: '主机', icon: LayoutGrid },
    { id: 'keychain', label: '钥匙串', icon: KeyRound },
    { id: 'knownHosts', label: '已知主机', icon: Shield },
  ]

  function removeSessionTab(sessionID) {
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

  function closeHostDialog() {
    setHostDialogMode(null)
    setHostForm(createInitialHostForm())
  }

  function refreshKeychainStatus() {
    setKeychainLoading(true)

    return getKeychainStatus()
      .then((status) => {
        setKeychainStatus(status)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setKeychainLoading(false))
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

      refreshKeychainStatus()
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

  useEffect(() => {
    let timerId = null

    function scheduleWindowStatePersist() {
      if (timerId) {
        window.clearTimeout(timerId)
      }

      // 使用防抖避免连续拖拽窗口时频繁写盘 / debounce resize bursts to avoid excessive writes while dragging.
      timerId = window.setTimeout(() => {
        persistWindowState().catch((err) => setError(err.message || String(err)))
      }, 200)
    }

    window.addEventListener('resize', scheduleWindowStatePersist)

    return () => {
      window.removeEventListener('resize', scheduleWindowStatePersist)
      if (timerId) {
        window.clearTimeout(timerId)
      }
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
        refreshKeychainStatus()
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
        refreshKeychainStatus()
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

    windowToggleMaximise()
      .then(() => persistWindowState())
      .catch((err) => setError(err.message || String(err)))
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
        refreshKeychainStatus()
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
          setKeychainStatus(null)
        })
        refreshKeychainStatus()
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
        removeSessionTab(sessionID)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleSessionClosed(sessionID) {
    removeSessionTab(sessionID)
  }

  function handleSendInput(sessionID, data) {
    return sendInput(sessionID, data)
  }

  function handleResizeTerminal(sessionID, cols, rows) {
    return resizeTerminal(sessionID, cols, rows)
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
  const currentSidebarPage = sidebarPages[activeSidebarPage] || sidebarPages.hosts
  const isHostsPage = activeSidebarPage === 'hosts'
  const isSettingsPage = activeSidebarPage === 'settings'
  const isKnownHostsPage = activeSidebarPage === 'knownHosts'
  const isKeychainPage = activeSidebarPage === 'keychain'
  const pageHeader = isSettingsPage
    ? {
        kicker: 'Security',
        title: '保险箱设置',
        description: '主密码用于保护本地保存的 SSH 凭据。ZenTerm 会默认交给系统钥匙串保管，日常不再需要手动进入。',
      }
    : currentSidebarPage

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
            <FolderLock size={15} />
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
              <div className="page-toolbar-main">
                <div className="page-intro-copy page-toolbar-copy">
                  <span className="panel-kicker">{pageHeader.kicker}</span>
                  <h1>{pageHeader.title}</h1>
                  {pageHeader.description ? <p>{pageHeader.description}</p> : null}
                </div>
              </div>

              <div className={`page-toolbar-actions${isHostsPage ? ' hosts' : ''}`}>
                {isHostsPage ? (
                  <div className="page-toolbar-search-slot">
                    <label className="search-bar search-bar-compact">
                      <Search size={15} />
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('searchPlaceholder')}
                        aria-label="搜索主机"
                      />
                    </label>
                  </div>
                ) : null}
                <div className={`page-toolbar-meta${isHostsPage ? ' hosts' : ''}`}>
                  {isHostsPage && (
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
              </div>
            </header>

            <main className="content-area">
              {isHostsPage ? (
                <section className="hosts-stage">
                  <div className="hosts-stage-grid">
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
                    <Suspense
                      fallback={(
                        <PanelFallback
                          className="panel terminal-panel"
                          kicker="Console"
                          title="正在加载终端工作区"
                          description="终端组件会在进入主机页后按需加载，减少应用初始体积。"
                        />
                      )}
                    >
                      <TerminalPane
                        sessions={sessionTabs}
                        activeSessionId={activeSessionId}
                        activeSessionTitle={activeSession?.title || 'Zen Console'}
                        activeSessionMeta={activeSession}
                        onSendInput={handleSendInput}
                        onResize={handleResizeTerminal}
                        onSessionClosed={handleSessionClosed}
                        onError={(err) => setError(err?.message || String(err))}
                      />
                    </Suspense>
                  </div>
                </section>
              ) : isSettingsPage ? (
                <Suspense
                  fallback={(
                    <PanelFallback
                      title="正在加载保险箱设置"
                      description="设置页会在真正访问时加载，避免主流程跟着一起进入首屏包。"
                    />
                  )}
                >
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
                </Suspense>
              ) : isKnownHostsPage ? (
                <Suspense
                  fallback={(
                    <PanelFallback
                      title="正在加载已知主机"
                      description="可信指纹面板会在切换到该页面后再按需加载。"
                    />
                  )}
                >
                  <KnownHostsPanel hosts={hosts} />
                </Suspense>
              ) : isKeychainPage ? (
                <Suspense
                  fallback={(
                    <PanelFallback
                      title="正在加载钥匙串"
                      description="凭据中心会在进入对应页面后再拉起，减少主机页初始负担。"
                    />
                  )}
                >
                  <KeychainPanel
                    status={keychainStatus}
                    loading={keychainLoading}
                    vaultInitialized={vaultInitialized}
                    vaultUnlocked={vaultUnlocked}
                    hostCount={hosts.length}
                    onRefresh={refreshKeychainStatus}
                  />
                </Suspense>
              ) : null}
            </main>
          </section>
        </div>
      ) : (
        <Suspense
          fallback={(
            <PanelFallback
              className="panel"
              kicker="SFTP"
              title="正在加载文件工作区"
              description="SFTP 仅在切换到文件工作区时加载，避免首屏携带文件浏览逻辑。"
            />
          )}
        >
          <SftpWorkspace
            hosts={hosts}
            selectedHost={selectedSftpHost}
            vaultUnlocked={vaultUnlocked}
            onChooseHost={handlePickSftpHost}
            onCreateHost={openCreateHost}
            onBackToVaults={() => handleWorkspaceChange('vaults')}
            onError={(message) => setError(message)}
          />
        </Suspense>
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
