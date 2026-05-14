import { useRef, useState } from 'react'
import { useHostState } from './useHostState'
import { useSessionWorkspaceState } from './useSessionWorkspaceState'
import { useVaultState } from './useVaultState'

export function useAppState() {
  const newTabCounterRef = useRef(0)
  const hostSearchInputRef = useRef<HTMLInputElement>(null!)
  const newTabSearchInputRef = useRef<HTMLInputElement>(null!)
  const rejectedHostIdsRef = useRef<Set<string>>(new Set())
  const sessionWorkspace = useSessionWorkspaceState()
  const host = useHostState(sessionWorkspace.sessionTabs)
  const vault = useVaultState()

  const [error, setError] = useState<string | null>(null)
  const {
    activeWorkspace,
    setActiveWorkspace,
    sessionTabs,
    setSessionTabs,
    activeSessionId,
    setActiveSessionId,
    newTabs,
    setNewTabs,
    activeNewTabId,
    setActiveNewTabId,
    logTabs,
    setLogTabs,
    activeLogTabId,
    setActiveLogTabId,
    activeSession,
    activeLogTab,
    workspaceTabs,
    activeWorkspaceTabId,
    shellClassName,
    hostKeyPrompt,
    setHostKeyPrompt,
    isAcceptingKey,
    setIsAcceptingKey,
    connectingHostIds,
    setConnectingHostIds,
  } = sessionWorkspace
  const {
    activeSidebarPage,
    setActiveSidebarPage,
    hosts,
    setHosts,
    selectedHostId,
    setSelectedHostId,
    selectedSftpHostId,
    setSelectedSftpHostId,
    searchQuery,
    setSearchQuery,
    newTabSearchQuery,
    setNewTabSearchQuery,
    hostViewMode,
    setHostViewMode,
    hostFilterKey,
    setHostFilterKey,
    hostDialogMode,
    setHostDialogMode,
    hostForm,
    setHostForm,
    isSavingHost,
    setIsSavingHost,
    deleteCandidate,
    setDeleteCandidate,
    filteredHosts,
    hostGroups,
    hostTags,
    favoriteHostCount,
    recentHostCount,
    activeHostFilterLabel,
    sessionCountByHost,
    selectedSftpHost,
    currentSidebarPage,
    isHostsPage,
    isSettingsPage,
    isKnownHostsPage,
    isKeychainPage,
    isLogsPage,
  } = host
  const {
    vaultInitialized,
    setVaultInitialized,
    vaultUnlocked,
    setVaultUnlocked,
    vaultReady,
    setVaultReady,
    vaultSetupForm,
    setVaultSetupForm,
    vaultSetupBusy,
    setVaultSetupBusy,
    accessPassword,
    setAccessPassword,
    accessBusy,
    setAccessBusy,
    changeMasterForm,
    setChangeMasterForm,
    changeMasterBusy,
    setChangeMasterBusy,
    resetVaultConfirmed,
    setResetVaultConfirmed,
    resetVaultBusy,
    setResetVaultBusy,
    showSetupModal,
    showAccessModal,
  } = vault
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
    connectingHostIds,
    isAcceptingKey,
  }
  const workspaceState = {
    activeWorkspace,
    newTabs,
    activeNewTabId,
    sessionTabs,
    activeSessionId,
    logTabs,
    activeLogTabId,
  }
  const setters = {
    setError,
    setHostForm,
    setHostDialogMode,
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
  const refs: {
    newTabCounterRef: React.MutableRefObject<number>
    hostSearchInputRef: React.RefObject<HTMLInputElement>
    newTabSearchInputRef: React.RefObject<HTMLInputElement>
    rejectedHostIdsRef: React.MutableRefObject<Set<string>>
  } = {
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
