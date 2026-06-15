import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import HostForm from './components/HostForm'
import AppOverlays from './components/AppOverlays'
import LogWorkspace from './components/LogWorkspace'
import NewTabWorkspace from './components/NewTabWorkspace'
import SftpWorkspacePage from './components/SftpWorkspacePage'
import SshWorkspace from './components/SshWorkspace'
import VaultWorkspace from './components/VaultWorkspace'
import WorkspaceStrip from './components/WorkspaceStrip'
import { UpdateNotification } from './components/UpdateNotification'
import { useTheme } from './contexts/ThemeProvider'
import { useLanguage } from './contexts/LanguageProvider'
import { navigationItems } from './lib/appShellConfig'
import { createInitialHostForm } from './features/hosts/hostFormModel'
import { useWorkspaceActions } from './features/workspace/useWorkspaceActions'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useAppActionHandlers } from './hooks/useAppActionHandlers'
import { useAppState } from './hooks/useAppState'
import { useGlobalHostSearchHotkey } from './hooks/useGlobalHostSearchHotkey'
import { useResetAppState } from './hooks/useResetAppState'
import { useSSHConfigImportPrompt } from './hooks/useSSHConfigImportPrompt'
import { useWindowStatePersistence } from './hooks/useWindowStatePersistence'
import { useWorkspaceAutoFallback } from './hooks/useWorkspaceAutoFallback'
import { HostFormModel, WorkspaceTab } from './types'

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
    error,
    sshConfigImportPrompt,
    sshConfigImportBusy,
  } = app
  const {
    activeWorkspace,
    sessionTabs,
    activeSessionId,
    activeLogTabId,
    activeSession,
    activeLogTab,
    workspaceTabs,
    activeWorkspaceTabId,
    shellClassName,
  } = workspace
  const {
    activeSidebarPage,
    hosts,
    selectedHostId,
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
  } = hostView
  const {
    vaultUnlocked,
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
  } = vault
  const {
    hostKeyPrompt,
    isAcceptingKey,
    connectingHostIds,
  } = sessions
  const {
    resolvedPageHeader,
  } = page
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

  function openCreateHost() {
    if (!vaultUnlocked) {
      appSetters.setError('请输入主密码后继续保存主机配置。')
      return
    }

    hostSetters.setHostForm(createInitialHostForm() as HostFormModel)
    workspaceSetters.setActiveWorkspace('vaults')
    hostSetters.setActiveSidebarPage('hosts')
    hostSetters.setHostDialogMode('create')
  }

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
    handleInitializeVault,
    handleAccessPassword,
    handleSidebarPageChange,
    handleChangeMasterField,
    handleChangeMasterPassword,
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
      openCreateHost,
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
  const hostDrawer = hostDialogMode ? (
    <HostForm
      mode={hostDialogMode}
      value={hostForm}
      onChange={hostSetters.setHostForm}
      onSubmit={handleSaveHost}
      disabled={!vaultUnlocked}
      busy={isSavingHost}
      onClose={closeHostDialog}
    />
  ) : null
  const sshSessions = sessionTabs.filter(tab => tab.sessionId).map(tab => ({
    sessionId: tab.sessionId!,
    title: tab.title,
    hostID: tab.hostID,
    remoteAddr: tab.remoteAddr,
    connectedAt: tab.connectedAt,
  }))
  const activeSshSession = activeSession && activeSession.sessionId ? {
    sessionId: activeSession.sessionId,
    title: activeSession.title,
    hostID: activeSession.hostID,
    remoteAddr: activeSession.remoteAddr,
    connectedAt: activeSession.connectedAt,
  } : null
  const isSshWorkspaceVisible = activeWorkspace === 'ssh'
  const shouldMountSshWorkspace = isSshWorkspaceVisible || sshSessions.length > 0

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

      {shouldMountSshWorkspace ? (
        <div className="workspace-keepalive" hidden={!isSshWorkspaceVisible}>
          <SshWorkspace
            sessionTabs={sshSessions}
            activeSessionId={activeSessionId}
            activeSession={activeSshSession}
            visible={isSshWorkspaceVisible}
            onSendInput={handleSendInput}
            onResize={handleResizeTerminal}
            onSessionClosed={handleSessionClosed}
            onError={(err: unknown) => appSetters.setError(err instanceof Error ? err.message : String(err))}
          />
        </div>
      ) : null}

      {activeWorkspace === 'vaults' ? (
        <VaultWorkspace
          navigationItems={navigationItems}
          activeSidebarPage={activeSidebarPage}
          onSidebarPageChange={handleSidebarPageChange}
          isHostsPage={isHostsPage}
          hostFilterKey={hostFilterKey}
          onHostFilterChange={hostSetters.setHostFilterKey}
          hosts={hosts}
          favoriteHostCount={favoriteHostCount}
          recentHostCount={recentHostCount}
          hostGroups={hostGroups}
          hostTags={hostTags}
          resolvedPageHeader={resolvedPageHeader}
          hostSearchInputRef={hostSearchInputRef}
          searchQuery={searchQuery}
          onSearchQueryChange={hostSetters.setSearchQuery}
          searchPlaceholder={t('searchPlaceholder')}
          hostViewMode={hostViewMode}
          onHostViewModeChange={hostSetters.setHostViewMode}
          onCreateHost={openCreateHost}
          newHostLabel={t('newHost')}
          filteredHosts={filteredHosts}
          selectedHostId={selectedHostId}
          sessionCountByHost={sessionCountByHost}
          connectingHostIds={connectingHostIds}
          onSelectHost={hostSetters.setSelectedHostId}
          onConnectHost={handleConnect}
          onEditHost={openEditHost}
          onDeleteHost={hostSetters.setDeleteCandidate}
          onCopyHostAddress={handleCopyHostAddress}
          onToggleFavorite={handleToggleFavorite}
          onTogglePinned={handleTogglePinned}
          onReorderHosts={handleReorderHosts}
          onRefreshHosts={refreshHosts}
          vaultUnlocked={vaultUnlocked}
          isSettingsPage={isSettingsPage}
          changeMasterForm={changeMasterForm}
          changeMasterBusy={changeMasterBusy}
          resetVaultConfirmed={resetVaultConfirmed}
          resetVaultBusy={resetVaultBusy}
          onChangeMasterField={handleChangeMasterField}
          onChangeMasterPassword={handleChangeMasterPassword}
          onResetVaultConfirmedChange={vaultSetters.setResetVaultConfirmed}
          onResetVault={handleResetVault}
          isKnownHostsPage={isKnownHostsPage}
          isKeychainPage={isKeychainPage}
          isLogsPage={isLogsPage}
          onOpenLogTab={openLogTab}
          hostDrawer={hostDrawer}
        />
      ) : activeWorkspace === 'new-tab' ? (
        <NewTabWorkspace
          searchInputRef={newTabSearchInputRef}
          searchQuery={newTabSearchQuery}
          onSearchQueryChange={hostSetters.setNewTabSearchQuery}
          onCreateHost={openCreateHost}
          hosts={hosts}
          onConnect={handleConnect}
          connectingHostIds={connectingHostIds}
          vaultUnlocked={vaultUnlocked}
        />
      ) : activeWorkspace === 'sftp' ? (
        <SftpWorkspacePage
          hosts={hosts}
          selectedHost={selectedSftpHost}
          vaultUnlocked={vaultUnlocked}
          onChooseHost={handlePickSftpHost}
          onCreateHost={openCreateHost}
          onBackToVaults={() => handleWorkspaceChange('vaults')}
          onError={appSetters.setError}
        />
      ) : activeWorkspace === 'log' ? (
        <LogWorkspace
          activeLogTab={activeLogTab && activeLogTab.logId ? {
            logId: activeLogTab.logId,
            title: activeLogTab.title,
            hostTitle: activeLogTab.hostTitle,
            startedAt: activeLogTab.startedAt,
            endedAt: activeLogTab.endedAt,
            sshUsername: activeLogTab.sshUsername,
            localUsername: activeLogTab.localUsername,
            remoteAddr: activeLogTab.remoteAddr,
          } : null}
          onCloseLog={() => activeLogTabId ? closeLogTab(activeLogTabId) : null}
          onError={(err: unknown) => appSetters.setError(err instanceof Error ? err.message : String(err))}
        />
      ) : null}

      <AppOverlays
        showSetupModal={showSetupModal}
        vaultSetupForm={vaultSetupForm}
        vaultSetupBusy={vaultSetupBusy}
        onVaultSetupPasswordChange={(value: string) => vaultSetters.setVaultSetupForm((current) => ({ ...current, password: value }))}
        onVaultSetupConfirmPasswordChange={(value: string) => vaultSetters.setVaultSetupForm((current) => ({ ...current, confirmPassword: value }))}
        onVaultSetupRiskAcknowledgedChange={(value: boolean) => vaultSetters.setVaultSetupForm((current) => ({ ...current, riskAcknowledged: value }))}
        onInitializeVault={handleInitializeVault}
        showAccessModal={showAccessModal}
        accessPassword={accessPassword}
        accessBusy={accessBusy}
        onAccessPasswordChange={vaultSetters.setAccessPassword}
        onContinueAccess={handleAccessPassword}
        deleteCandidate={deleteCandidate}
        onCancelDeleteHost={() => hostSetters.setDeleteCandidate(null)}
        onDeleteHost={handleDeleteHost}
        sshConfigImportPrompt={sshConfigImportPrompt}
        sshConfigImportBusy={sshConfigImportBusy}
        onCancelSSHConfigImport={dismissSSHConfigImportPrompt}
        onConfirmSSHConfigImport={handleConfirmSSHConfigImport}
        errorTitle={t('errorTitle')}
        error={error}
        confirmLabel={t('confirm')}
        onClearError={() => appSetters.setError(null)}
        hostKeyPrompt={hostKeyPrompt}
        isAcceptingKey={isAcceptingKey}
        onAcceptHostKey={handleAcceptHostKey}
        onRejectHostKey={handleRejectHostKey}
      />

      <UpdateNotification />
    </div>
  )
}
