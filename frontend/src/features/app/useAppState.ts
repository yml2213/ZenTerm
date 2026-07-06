import { useRef, useState } from 'react'
import { useHostState } from '@/features/hosts/useHostState'
import { useSessionWorkspaceState } from '@/features/sessions/useSessionWorkspaceState'
import { useVaultState } from '@/features/vault/useVaultState'
import { usePageHeaderState } from './usePageHeaderState'
import type { SSHConfigImportPrompt } from '@/types'

export function useAppState() {
  const newTabCounterRef = useRef(0)
  const hostSearchInputRef = useRef<HTMLInputElement>(null!)
  const newTabSearchInputRef = useRef<HTMLInputElement>(null!)
  const rejectedHostIdsRef = useRef<Set<string>>(new Set())
  const sessionWorkspace = useSessionWorkspaceState()
  const host = useHostState(sessionWorkspace.sessionTabs)
  const vault = useVaultState()

  const [error, setError] = useState<string | null>(null)
  const [sshConfigImportPrompt, setSSHConfigImportPrompt] = useState<SSHConfigImportPrompt | null>(null)
  const [sshConfigImportBusy, setSSHConfigImportBusy] = useState(false)
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
  const resolvedPageHeader = usePageHeaderState({
    activeWorkspace,
    activeSession,
    selectedSftpHost,
    isSettingsPage,
    isHostsPage,
    hostFilterKey,
    activeHostFilterLabel,
    filteredHostCount: filteredHosts.length,
    hostCount: hosts.length,
    currentSidebarPage,
  })

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
  const sshConfigImportState = {
    sshConfigImportPrompt,
    sshConfigImportBusy,
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
    app: {
      setError,
      setSSHConfigImportPrompt,
      setSSHConfigImportBusy,
    },
    hosts: {
      setHostForm,
      setHostDialogMode,
      setHosts,
      setSelectedHostId,
      setSelectedSftpHostId,
      setHostViewMode,
      setHostFilterKey,
      setActiveSidebarPage,
      setSearchQuery,
      setNewTabSearchQuery,
      setDeleteCandidate,
      setIsSavingHost,
    },
    vault: {
      setVaultSetupBusy,
      setVaultInitialized,
      setVaultUnlocked,
      setVaultReady,
      setVaultSetupForm,
      setAccessBusy,
      setAccessPassword,
      setChangeMasterBusy,
      setChangeMasterForm,
      setResetVaultBusy,
      setResetVaultConfirmed,
    },
    workspace: {
      setActiveWorkspace,
      setSessionTabs,
      setActiveSessionId,
      setNewTabs,
      setActiveNewTabId,
      setLogTabs,
      setActiveLogTabId,
    },
    sessions: {
      setHostKeyPrompt,
      setConnectingHostIds,
      setIsAcceptingKey,
    },
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

  const appState = {
    error,
    sshConfigImportPrompt,
    sshConfigImportBusy,
  }
  const hostViewState = {
    activeSidebarPage,
    hosts,
    selectedHostId,
    selectedSftpHostId,
    searchQuery,
    newTabSearchQuery,
    hostViewMode,
    hostFilterKey,
    hostDialogMode,
    hostForm,
    isSavingHost,
    deleteCandidate,
    filteredHosts,
    hostGroups,
    hostTags,
    favoriteHostCount,
    recentHostCount,
    sessionCountByHost,
    selectedSftpHost,
    isHostsPage,
    isSettingsPage,
    isKnownHostsPage,
    isKeychainPage,
    isLogsPage,
  }
  const vaultViewState = {
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
    showSetupModal,
    showAccessModal,
  }
  const workspaceViewState = {
    activeWorkspace,
    sessionTabs,
    activeSessionId,
    newTabs,
    activeNewTabId,
    logTabs,
    activeLogTabId,
    activeSession,
    activeLogTab,
    workspaceTabs,
    activeWorkspaceTabId,
    shellClassName,
  }
  const sessionViewState = {
    hostKeyPrompt,
    isAcceptingKey,
    connectingHostIds,
  }
  const pageState = {
    resolvedPageHeader,
  }
  const actionStates = {
    vaultState,
    hostState,
    sessionState,
    sshConfigImportState,
    workspaceState,
  }

  return {
    app: appState,
    hosts: hostViewState,
    vault: vaultViewState,
    workspace: workspaceViewState,
    sessions: sessionViewState,
    page: pageState,
    actionStates,
    setters,
    refs,
  }
}

export type AppStateSetters = ReturnType<typeof useAppState>['setters']
export type AppStateRefs = ReturnType<typeof useAppState>['refs']
