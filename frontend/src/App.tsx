import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import AppOverlayLayer from './components/AppOverlayLayer'
import AppWorkspaces from './components/AppWorkspaces'
import WorkspaceStrip from './components/WorkspaceStrip'
import { UpdateNotification } from './components/UpdateNotification'
import { useTheme } from './contexts/ThemeProvider'
import { useLanguage } from './contexts/LanguageProvider'
import { useAppBootstrap } from '@/features/app/useAppBootstrap'
import { useAppActionHandlers } from '@/features/app/useAppActionHandlers'
import { useAppState } from '@/features/app/useAppState'
import { useResetAppState } from '@/features/app/useResetAppState'
import { useGlobalHostSearchHotkey } from '@/features/hosts/useGlobalHostSearchHotkey'
import { useWorkspaceActions } from '@/features/workspace/useWorkspaceActions'
import { useSSHConfigImportPrompt } from '@/features/hosts/useSSHConfigImportPrompt'
import { useWindowStatePersistence } from '@/features/workspace/useWindowStatePersistence'
import { useWorkspaceAutoFallback } from '@/features/workspace/useWorkspaceAutoFallback'
import type { WorkspaceTab } from '@/types'

export default function App() {
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()
  const {
    app,
    hosts: hostView,
    vault,
    workspace,
    sessions,
    page,
    actionStates,
    setters,
    refs,
  } = useAppState()
  const {
    activeWorkspace,
    sessionTabs,
    workspaceTabs,
    activeWorkspaceTabId,
    shellClassName,
  } = workspace
  const { hosts } = hostView
  const { vaultUnlocked } = vault
  const {
    vaultState,
    hostState,
    sessionState,
    sshConfigImportState,
    workspaceState,
  } = actionStates
  const { hostSearchInputRef, newTabSearchInputRef } = refs
  const {
    app: appSetters,
    hosts: hostSetters,
    vault: vaultSetters,
    workspace: workspaceSetters,
    sessions: sessionSetters,
  } = setters

  const {
    removeSessionTab,
    openLogTab,
    openNewTab,
    closeNewTab,
    closeLogTab,
    handleWorkspaceStripDoubleClick,
    handleWorkspaceChange,
    handleWorkspaceTabSelect,
  } = useWorkspaceActions({
    state: workspaceState,
    setters,
    refs,
  })
  const resetAppStateAfterVaultReset = useResetAppState({ setters, refs })

  const {
    closeHostDialog,
    refreshHosts,
    openEditHost,
    openCreateHost,
    handleVaultSetupPasswordChange,
    handleVaultSetupConfirmPasswordChange,
    handleVaultSetupRiskAcknowledgedChange,
    handleInitializeVault,
    handleAccessPasswordChange,
    handleAccessPassword,
    handleSidebarPageChange,
    handleChangeMasterField,
    handleChangeMasterPassword,
    handleResetVaultConfirmedChange,
    handleResetVault,
    handleSaveHost,
    handleDeleteHost,
    handleConnect,
    handleCopyHostAddress,
    handleToggleFavorite,
    handleTogglePinned,
    handleReorderHosts,
    handleCloseTab,
    handleSessionClosed,
    handleSendInput,
    handleResizeTerminal,
    handleAcceptHostKey,
    handleRejectHostKey,
    handlePickSftpHost,
    dismissSSHConfigImportPrompt,
    dismissSSHConfigImportPermanently,
    handleConfirmSSHConfigImport,
  } = useAppActionHandlers({
    vaultState,
    hostState,
    sessionState,
    sshConfigImportState,
    setters,
    refs,
    helpers: {
      removeSessionTab,
      resetAppStateAfterVaultReset,
    },
  })

  useAppBootstrap({
    setHosts: hostSetters.setHosts,
    setSelectedHostId: hostSetters.setSelectedHostId,
    setSessionTabs: workspaceSetters.setSessionTabs,
    setActiveSessionId: workspaceSetters.setActiveSessionId,
    setActiveWorkspace: workspaceSetters.setActiveWorkspace,
    setVaultInitialized: vaultSetters.setVaultInitialized,
    setVaultUnlocked: vaultSetters.setVaultUnlocked,
    setVaultReady: vaultSetters.setVaultReady,
    setError: appSetters.setError,
    setHostKeyPrompt: sessionSetters.setHostKeyPrompt,
  })

  useWindowStatePersistence(appSetters.setError)

  useSSHConfigImportPrompt({
    vaultUnlocked,
    hosts,
    setError: appSetters.setError,
    setSSHConfigImportPrompt: appSetters.setSSHConfigImportPrompt,
  })

  useWorkspaceAutoFallback({
    activeWorkspace,
    sessionCount: sessionTabs.length,
    setNewTabs: workspaceSetters.setNewTabs,
    setActiveNewTabId: workspaceSetters.setActiveNewTabId,
    setActiveWorkspace: workspaceSetters.setActiveWorkspace,
  })

  useGlobalHostSearchHotkey({
    activeWorkspace,
    newTabSearchInputRef,
    hostSearchInputRef,
    setActiveWorkspace: workspaceSetters.setActiveWorkspace,
    setActiveSidebarPage: hostSetters.setActiveSidebarPage,
  })

  function handleWorkspaceTabClose(tab: WorkspaceTab) {
    if (tab.type === 'new') {
      closeNewTab(tab.tabId)
      return
    }

    if (tab.type === 'log') {
      closeLogTab(tab.tabId)
      return
    }

    if (tab.sessionId) {
      handleCloseTab(tab.sessionId)
    }
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

  const ThemeIcon: LucideIcon = theme === 'auto' ? Monitor : theme === 'light' ? Sun : Moon

  return (
    <div className={shellClassName}>
      <WorkspaceStrip
        activeWorkspace={activeWorkspace}
        workspaceTabs={workspaceTabs}
        activeWorkspaceTabId={activeWorkspaceTabId}
        onWorkspaceChange={handleWorkspaceChange}
        onWorkspaceStripDoubleClick={handleWorkspaceStripDoubleClick}
        onWorkspaceTabSelect={handleWorkspaceTabSelect}
        onWorkspaceTabClose={handleWorkspaceTabClose}
        onOpenNewTab={openNewTab}
        onCycleTheme={cycleTheme}
        themeIcon={ThemeIcon}
        vaultsLabel={t('vaults')}
        sftpLabel={t('sftp')}
      />

      <AppWorkspaces
        workspace={workspace}
        hosts={hostView}
        vault={vault}
        sessions={sessions}
        page={page}
        refs={refs}
        labels={{
          searchPlaceholder: t('searchPlaceholder'),
          newHostLabel: t('newHost'),
        }}
        actions={{
          onError: appSetters.setError,
          onSendInput: handleSendInput,
          onResizeTerminal: handleResizeTerminal,
          onSessionClosed: handleSessionClosed,
          onWorkspaceChange: handleWorkspaceChange,
          onCloseLogTab: closeLogTab,
          onSidebarPageChange: handleSidebarPageChange,
          onHostFilterChange: hostSetters.setHostFilterKey,
          onSearchQueryChange: hostSetters.setSearchQuery,
          onHostViewModeChange: hostSetters.setHostViewMode,
          onCreateHost: openCreateHost,
          onSelectHost: hostSetters.setSelectedHostId,
          onConnectHost: handleConnect,
          onEditHost: openEditHost,
          onDeleteHost: hostSetters.setDeleteCandidate,
          onCopyHostAddress: handleCopyHostAddress,
          onToggleFavorite: handleToggleFavorite,
          onTogglePinned: handleTogglePinned,
          onReorderHosts: handleReorderHosts,
          onRefreshHosts: refreshHosts,
          onChangeMasterField: handleChangeMasterField,
          onChangeMasterPassword: handleChangeMasterPassword,
          onResetVaultConfirmedChange: handleResetVaultConfirmedChange,
          onResetVault: handleResetVault,
          onOpenLogTab: openLogTab,
          onNewTabSearchQueryChange: hostSetters.setNewTabSearchQuery,
          onPickSftpHost: handlePickSftpHost,
          onHostFormChange: hostSetters.setHostForm,
          onSaveHost: handleSaveHost,
          onCloseHostDialog: closeHostDialog,
        }}
      />

      <AppOverlayLayer
        app={app}
        vault={vault}
        hosts={hostView}
        sessions={sessions}
        labels={{
          errorTitle: t('errorTitle'),
          confirmLabel: t('confirm'),
        }}
        actions={{
          onVaultSetupPasswordChange: handleVaultSetupPasswordChange,
          onVaultSetupConfirmPasswordChange: handleVaultSetupConfirmPasswordChange,
          onVaultSetupRiskAcknowledgedChange: handleVaultSetupRiskAcknowledgedChange,
          onInitializeVault: handleInitializeVault,
          onAccessPasswordChange: handleAccessPasswordChange,
          onContinueAccess: handleAccessPassword,
          onCancelDeleteHost: () => hostSetters.setDeleteCandidate(null),
          onDeleteHost: handleDeleteHost,
          onCancelSSHConfigImport: dismissSSHConfigImportPrompt,
          onDismissSSHConfigImportPermanently: dismissSSHConfigImportPermanently,
          onConfirmSSHConfigImport: handleConfirmSSHConfigImport,
          onClearError: () => appSetters.setError(null),
          onAcceptHostKey: handleAcceptHostKey,
          onRejectHostKey: handleRejectHostKey,
        }}
      />

      <UpdateNotification />
    </div>
  )
}
