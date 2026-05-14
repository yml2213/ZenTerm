import { useEffect } from 'react'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import HostForm, { createInitialHostForm } from './components/HostForm.jsx'
import AppOverlays from './components/AppOverlays.jsx'
import LogWorkspace from './components/LogWorkspace.jsx'
import NewTabWorkspace from './components/NewTabWorkspace.jsx'
import SftpWorkspacePage, { preloadSftpWorkspace } from './components/SftpWorkspacePage.jsx'
import SshWorkspace from './components/SshWorkspace.jsx'
import VaultWorkspace from './components/VaultWorkspace'
import WorkspaceStrip from './components/WorkspaceStrip'
import { useTheme } from './contexts/ThemeProvider'
import { useLanguage } from './contexts/LanguageProvider'
import { navigationItems } from './lib/appShellConfig'
import {
  useAppBootstrap,
  useGlobalHostSearchHotkey,
  useWindowStatePersistence,
  useWorkspaceAutoFallback,
} from './hooks/useAppEffects'
import { useAppActionHandlers } from './hooks/useAppActionHandlers'
import { useAppState } from './hooks/useAppState'
import { useWorkspaceActionHandlers } from './hooks/useWorkspaceActionHandlers'
import { HostFormModel, WorkspaceTab } from './types'

function PanelFallback({
  className = 'panel',
  kicker = 'Loading',
  title = '正在加载面板',
  description = 'ZenTerm 正在准备当前工作区内容，请稍候。',
}: {
  className?: string
  kicker?: string
  title?: string
  description?: string
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

export default function App() {
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()
  const {
    activeWorkspace,
    activeSidebarPage,
    hosts,
    selectedHostId,
    searchQuery,
    newTabSearchQuery,
    hostViewMode,
    hostFilterKey,
    vaultInitialized,
    vaultUnlocked,
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
  } = useAppState()
  const { hostSearchInputRef, newTabSearchInputRef } = refs

  function openCreateHost() {
    if (!vaultUnlocked) {
      setters.setError('请输入主密码后继续保存主机配置。')
      return
    }

    setters.setHostForm(createInitialHostForm() as HostFormModel)
    setters.setActiveWorkspace('vaults')
    setters.setActiveSidebarPage('hosts')
    setters.setHostDialogMode('create')
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
  } = useWorkspaceActionHandlers({
    state: workspaceState,
    setters,
    refs,
  })

  const {
    closeHostDialog,
    refreshKeychainStatus,
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
    handleCloseTab,
    handleSessionClosed,
    handleSendInput,
    handleResizeTerminal,
    handleAcceptHostKey,
    handleRejectHostKey,
    handlePickSftpHost,
  } = useAppActionHandlers({
    vaultState,
    hostState,
    sessionState,
    setters,
    refs,
    helpers: {
      removeSessionTab,
      openCreateHost,
    },
  })

  useAppBootstrap({
    setHosts: setters.setHosts,
    setSelectedHostId: setters.setSelectedHostId,
    setSessionTabs: setters.setSessionTabs,
    setActiveSessionId: setters.setActiveSessionId,
    setActiveWorkspace: setters.setActiveWorkspace,
    setVaultInitialized: setters.setVaultInitialized,
    setVaultUnlocked: setters.setVaultUnlocked,
    setVaultReady: setters.setVaultReady,
    refreshKeychainStatus,
    setError: setters.setError,
    setHostKeyPrompt: setters.setHostKeyPrompt,
  })

  useWindowStatePersistence(setters.setError)

  useWorkspaceAutoFallback({
    activeWorkspace,
    sessionCount: sessionTabs.length,
    setNewTabs: setters.setNewTabs,
    setActiveNewTabId: setters.setActiveNewTabId,
    setActiveWorkspace: setters.setActiveWorkspace,
  })

  useGlobalHostSearchHotkey({
    activeWorkspace,
    newTabSearchInputRef,
    hostSearchInputRef,
    setActiveWorkspace: setters.setActiveWorkspace,
    setActiveSidebarPage: setters.setActiveSidebarPage,
  })

  useEffect(() => {
    const runPreload = () => preloadSftpWorkspace()
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(runPreload, { timeout: 1800 })
      return () => window.cancelIdleCallback(id)
    }

    const id = window.setTimeout(runPreload, 400)
    return () => window.clearTimeout(id)
  }, [])

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
      onChange={setters.setHostForm}
      onSubmit={handleSaveHost}
      disabled={!vaultUnlocked}
      busy={isSavingHost}
      onClose={closeHostDialog}
    />
  ) : null

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
        onPreloadSftp={preloadSftpWorkspace}
        themeIcon={ThemeIcon}
        vaultsLabel={t('vaults')}
        sftpLabel={t('sftp')}
      />

      {activeWorkspace === 'vaults' ? (
        <VaultWorkspace
          navigationItems={navigationItems}
          activeSidebarPage={activeSidebarPage}
          onSidebarPageChange={handleSidebarPageChange}
          isHostsPage={isHostsPage}
          hostFilterKey={hostFilterKey}
          onHostFilterChange={setters.setHostFilterKey}
          hosts={hosts}
          favoriteHostCount={favoriteHostCount}
          recentHostCount={recentHostCount}
          hostGroups={hostGroups}
          hostTags={hostTags}
          resolvedPageHeader={resolvedPageHeader}
          hostSearchInputRef={hostSearchInputRef}
          searchQuery={searchQuery}
          onSearchQueryChange={setters.setSearchQuery}
          searchPlaceholder={t('searchPlaceholder')}
          hostViewMode={hostViewMode}
          onHostViewModeChange={setters.setHostViewMode}
          onCreateHost={openCreateHost}
          newHostLabel={t('newHost')}
          filteredHosts={filteredHosts}
          selectedHostId={selectedHostId}
          sessionCountByHost={sessionCountByHost}
          connectingHostIds={connectingHostIds}
          onSelectHost={setters.setSelectedHostId}
          onConnectHost={handleConnect}
          onEditHost={openEditHost}
          onDeleteHost={setters.setDeleteCandidate}
          onCopyHostAddress={handleCopyHostAddress}
          onToggleFavorite={handleToggleFavorite}
          vaultUnlocked={vaultUnlocked}
          isSettingsPage={isSettingsPage}
          changeMasterForm={changeMasterForm}
          changeMasterBusy={changeMasterBusy}
          resetVaultConfirmed={resetVaultConfirmed}
          resetVaultBusy={resetVaultBusy}
          onChangeMasterField={handleChangeMasterField}
          onChangeMasterPassword={handleChangeMasterPassword}
          onResetVaultConfirmedChange={setters.setResetVaultConfirmed}
          onResetVault={handleResetVault}
          PanelFallback={PanelFallback}
          isKnownHostsPage={isKnownHostsPage}
          isKeychainPage={isKeychainPage}
          isLogsPage={isLogsPage}
          keychainStatus={keychainStatus}
          keychainLoading={keychainLoading}
          vaultInitialized={vaultInitialized}
          onRefreshKeychainStatus={refreshKeychainStatus}
          onOpenLogTab={openLogTab}
          hostDrawer={hostDrawer}
        />
      ) : activeWorkspace === 'new-tab' ? (
        <NewTabWorkspace
          searchInputRef={newTabSearchInputRef}
          searchQuery={newTabSearchQuery}
          onSearchQueryChange={setters.setNewTabSearchQuery}
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
          onError={setters.setError}
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
          onError={(err: unknown) => setters.setError(err instanceof Error ? err.message : String(err))}
        />
      ) : (
        <SshWorkspace
          sessionTabs={sessionTabs.filter(tab => tab.sessionId).map(tab => ({
            sessionId: tab.sessionId!,
            title: tab.title,
          }))}
          activeSessionId={activeSessionId}
          activeSession={activeSession && activeSession.sessionId ? {
            sessionId: activeSession.sessionId,
            title: activeSession.title,
          } : null}
          onSendInput={handleSendInput}
          onResize={handleResizeTerminal}
          onSessionClosed={handleSessionClosed}
          onError={(err: unknown) => setters.setError(err instanceof Error ? err.message : String(err))}
          PanelFallback={PanelFallback}
        />
      )}

      <AppOverlays
        showSetupModal={showSetupModal}
        vaultSetupForm={vaultSetupForm}
        vaultSetupBusy={vaultSetupBusy}
        onVaultSetupPasswordChange={(value: string) => setters.setVaultSetupForm((current) => ({ ...current, password: value }))}
        onVaultSetupConfirmPasswordChange={(value: string) => setters.setVaultSetupForm((current) => ({ ...current, confirmPassword: value }))}
        onVaultSetupRiskAcknowledgedChange={(value: boolean) => setters.setVaultSetupForm((current) => ({ ...current, riskAcknowledged: value }))}
        onInitializeVault={handleInitializeVault}
        showAccessModal={showAccessModal}
        accessPassword={accessPassword}
        accessBusy={accessBusy}
        onAccessPasswordChange={setters.setAccessPassword}
        onContinueAccess={handleAccessPassword}
        deleteCandidate={deleteCandidate}
        onCancelDeleteHost={() => setters.setDeleteCandidate(null)}
        onDeleteHost={handleDeleteHost}
        errorTitle={t('errorTitle')}
        error={error}
        confirmLabel={t('confirm')}
        onClearError={() => setters.setError(null)}
        hostKeyPrompt={hostKeyPrompt}
        isAcceptingKey={isAcceptingKey}
        onAcceptHostKey={handleAcceptHostKey}
        onRejectHostKey={handleRejectHostKey}
      />
    </div>
  )
}
