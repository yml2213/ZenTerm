import { useRef, useState } from 'react'
import { createInitialHostForm } from '../components/HostForm.jsx'
import {
  getHostFilterLabel,
  matchesHost,
  matchesHostFilter,
  parseHostTags,
  sortHosts,
} from '../lib/appHostUtils.js'
import { sidebarPages } from '../lib/appShellConfig.jsx'
import { createChangeMasterForm, createVaultSetupForm } from '../lib/appVaultUtils.js'

export function useAppState() {
  const newTabCounterRef = useRef(0)
  const hostSearchInputRef = useRef(null)
  const newTabSearchInputRef = useRef(null)
  const rejectedHostIdsRef = useRef(new Set())

  const [activeWorkspace, setActiveWorkspace] = useState('vaults')
  const [activeSidebarPage, setActiveSidebarPage] = useState('hosts')
  const [hosts, setHosts] = useState([])
  const [selectedHostId, setSelectedHostId] = useState(null)
  const [selectedSftpHostId, setSelectedSftpHostId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newTabSearchQuery, setNewTabSearchQuery] = useState('')
  const [hostViewMode, setHostViewMode] = useState('grid')
  const [hostFilterKey, setHostFilterKey] = useState('all')
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
  const [newTabs, setNewTabs] = useState([])
  const [activeNewTabId, setActiveNewTabId] = useState(null)
  const [logTabs, setLogTabs] = useState([])
  const [activeLogTabId, setActiveLogTabId] = useState(null)
  const [connectingHostIds, setConnectingHostIds] = useState([])
  const [keychainStatus, setKeychainStatus] = useState(null)
  const [keychainLoading, setKeychainLoading] = useState(false)

  const filteredHosts = sortHosts(hosts.filter((host) => (
    matchesHost(host, searchQuery) && matchesHostFilter(host, hostFilterKey)
  )))
  const hostGroups = Array.from(new Set(hosts.map((host) => host.group?.trim()).filter(Boolean))).sort()
  const hostTags = Array.from(new Set(hosts.flatMap((host) => parseHostTags(host.tags)))).sort()
  const favoriteHostCount = hosts.filter((host) => host.favorite).length
  const recentHostCount = hosts.filter((host) => Date.parse(host.last_connected_at || '')).length
  const activeHostFilterLabel = getHostFilterLabel(hostFilterKey)
  const sessionCountByHost = sessionTabs.reduce((acc, session) => {
    acc[session.hostID] = (acc[session.hostID] || 0) + 1
    return acc
  }, {})
  const selectedSftpHost = hosts.find((host) => host.id === selectedSftpHostId) || null
  const activeSession = sessionTabs.find((session) => session.sessionId === activeSessionId) || null
  const workspaceTabs = newTabs
    .concat(sessionTabs.map((session) => ({
      ...session,
      tabId: session.sessionId,
      type: 'ssh',
    })))
    .concat(logTabs)
  const activeLogTab = logTabs.find((tab) => tab.tabId === activeLogTabId) || null
  const activeWorkspaceTabId = activeWorkspace === 'new-tab'
    ? activeNewTabId
    : activeWorkspace === 'log'
    ? activeLogTabId
    : activeSessionId
  const showSetupModal = !vaultInitialized && vaultReady
  const showAccessModal = vaultInitialized && !vaultUnlocked && vaultReady
  const currentSidebarPage = sidebarPages[activeSidebarPage] || sidebarPages.hosts
  const isHostsPage = activeSidebarPage === 'hosts'
  const isSettingsPage = activeSidebarPage === 'settings'
  const isKnownHostsPage = activeSidebarPage === 'knownHosts'
  const isKeychainPage = activeSidebarPage === 'keychain'
  const isLogsPage = activeSidebarPage === 'logs'
  const shellClassName = [
    'app-shell',
    activeWorkspace === 'ssh' || activeWorkspace === 'log' ? 'app-shell-tabbed' : '',
    activeWorkspace === 'ssh' ? 'app-shell-ssh' : '',
    activeWorkspace === 'log' ? 'app-shell-log' : '',
    activeWorkspace === 'sftp' ? 'app-shell-sftp' : '',
  ].filter(Boolean).join(' ')
  const pageHeader = activeWorkspace === 'ssh'
    ? {
        kicker: 'SSH',
        title: activeSession?.title || '终端工作区',
        description: activeSession?.remoteAddr || '当前活跃 SSH 会话会在这里独立展示。',
      }
    : activeWorkspace === 'sftp'
    ? {
        kicker: 'SFTP',
        title: '文件工作区',
        description: selectedSftpHost
          ? `当前主机：${selectedSftpHost.name || selectedSftpHost.id} · ${selectedSftpHost.address}:${selectedSftpHost.port || 22}`
          : 'SFTP 是独立工作区，用来浏览本地与远端目录并执行上传下载。',
      }
    : isSettingsPage
    ? {
        kicker: 'Security',
        title: '保险箱设置',
        description: '主密码用于保护本地保存的 SSH 凭据。ZenTerm 会默认交给系统钥匙串保管，日常不再需要手动进入。',
      }
    : currentSidebarPage
  const resolvedPageHeader = isHostsPage && hostFilterKey !== 'all'
    ? {
        ...pageHeader,
        title: activeHostFilterLabel,
        description: `当前筛选出 ${filteredHosts.length} / ${hosts.length} 台主机，可继续搜索缩小范围。`,
      }
    : pageHeader

  const vaultState = {
    vaultSetupForm,
    accessPassword,
    changeMasterForm,
    resetVaultConfirmed,
  }
  const hostState = {
    hosts,
    hostDialogMode,
    hostForm,
    vaultUnlocked,
    deleteCandidate,
    selectedHostId,
    selectedSftpHostId,
    sessionTabs,
  }
  const sessionState = {
    hosts,
    activeWorkspace,
    activeNewTabId,
    sessionTabs,
    hostKeyPrompt,
  }
  const workspaceState = {
    newTabs,
    activeNewTabId,
    sessionTabs,
    logTabs,
    activeLogTabId,
  }
  const setters = {
    setError,
    setHostForm,
    setHostDialogMode,
    setKeychainLoading,
    setKeychainStatus,
    setHosts,
    setSelectedHostId,
    setSelectedSftpHostId,
    setSessionTabs,
    setActiveSessionId,
    setHostViewMode,
    setHostFilterKey,
    setVaultSetupBusy,
    setVaultInitialized,
    setVaultUnlocked,
    setVaultReady,
    setVaultSetupForm,
    setAccessBusy,
    setAccessPassword,
    setActiveWorkspace,
    setActiveSidebarPage,
    setSearchQuery,
    setNewTabSearchQuery,
    setChangeMasterBusy,
    setChangeMasterForm,
    setResetVaultBusy,
    setResetVaultConfirmed,
    setDeleteCandidate,
    setHostKeyPrompt,
    setNewTabs,
    setActiveNewTabId,
    setLogTabs,
    setActiveLogTabId,
    setConnectingHostIds,
    setIsSavingHost,
    setIsAcceptingKey,
  }
  const refs = {
    newTabCounterRef,
    hostSearchInputRef,
    newTabSearchInputRef,
    rejectedHostIdsRef,
  }

  return {
    activeWorkspace,
    activeSidebarPage,
    hosts,
    selectedHostId,
    selectedSftpHostId,
    searchQuery,
    newTabSearchQuery,
    hostViewMode,
    hostFilterKey,
    vaultInitialized,
    vaultUnlocked,
    vaultReady,
    vaultSetupForm,
    vaultSetupBusy,
    accessPassword,
    accessBusy,
    changeMasterForm,
    changeMasterBusy,
    resetVaultConfirmed,
    resetVaultBusy,
    hostDialogMode,
    hostForm,
    isSavingHost,
    error,
    deleteCandidate,
    hostKeyPrompt,
    isAcceptingKey,
    sessionTabs,
    activeSessionId,
    newTabs,
    activeNewTabId,
    logTabs,
    activeLogTabId,
    connectingHostIds,
    keychainStatus,
    keychainLoading,
    filteredHosts,
    hostGroups,
    hostTags,
    favoriteHostCount,
    recentHostCount,
    sessionCountByHost,
    selectedSftpHost,
    activeSession,
    activeLogTab,
    workspaceTabs,
    activeWorkspaceTabId,
    showSetupModal,
    showAccessModal,
    isHostsPage,
    isSettingsPage,
    isKnownHostsPage,
    isKeychainPage,
    isLogsPage,
    shellClassName,
    resolvedPageHeader,
    vaultState,
    hostState,
    sessionState,
    workspaceState,
    setters,
    refs,
  }
}
