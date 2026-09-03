import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import AppOverlayLayer from '@/features/app/components/AppOverlayLayer'
import AppWorkspaces from '@/features/app/components/AppWorkspaces'
import WorkspaceStrip from '@/features/app/components/WorkspaceStrip'
import { UpdateNotification } from '@/features/app/components/UpdateNotification'
import { useTheme } from './contexts/ThemeProvider'
import { createAppViewActions } from '@/features/app/appViewActions'
import { useAppBootstrap } from '@/features/app/useAppBootstrap'
import { useAppActionHandlers } from '@/features/app/useAppActionHandlers'
import { useAppState } from '@/features/app/useAppState'
import { useResetAppState } from '@/features/app/useResetAppState'
import { useGlobalHostSearchHotkey } from '@/features/hosts/useGlobalHostSearchHotkey'
import { useWorkspaceActions } from '@/features/workspace/useWorkspaceActions'
import { useSSHConfigImportPrompt } from '@/features/hosts/useSSHConfigImportPrompt'
import { useWindowStatePersistence } from '@/features/workspace/useWindowStatePersistence'
import { useWorkspaceAutoFallback } from '@/features/workspace/useWorkspaceAutoFallback'
import type { WorkspaceTab } from '@/features/workspace/workspaceTypes'

export default function App() {
  const { theme, setTheme } = useTheme()
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

  const workspaceActions = useWorkspaceActions({
    state: workspaceState,
    setters,
    refs,
  })
  const resetAppStateAfterVaultReset = useResetAppState({ setters, refs })

  const appActions = useAppActionHandlers({
    vaultState,
    hostState,
    sessionState,
    sshConfigImportState,
    setters,
    refs,
    helpers: {
      removeSessionTab: workspaceActions.removeSessionTab,
      resetAppStateAfterVaultReset,
    },
  })
  const viewActions = createAppViewActions({
    appActions,
    setters,
    workspaceActions,
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
      workspaceActions.closeNewTab(tab.tabId)
      return
    }

    if (tab.type === 'log') {
      workspaceActions.closeLogTab(tab.tabId)
      return
    }

    if (tab.sessionId) {
      appActions.handleCloseTab(tab.sessionId)
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
        onWorkspaceChange={workspaceActions.handleWorkspaceChange}
        onWorkspaceStripDoubleClick={workspaceActions.handleWorkspaceStripDoubleClick}
        onWorkspaceTabSelect={workspaceActions.handleWorkspaceTabSelect}
        onWorkspaceTabClose={handleWorkspaceTabClose}
        onOpenNewTab={workspaceActions.openNewTab}
        onCycleTheme={cycleTheme}
        themeIcon={ThemeIcon}
        vaultsLabel="保险箱"
        sftpLabel="SFTP"
      />

      <AppWorkspaces
        workspace={workspace}
        hosts={hostView}
        vault={vault}
        sessions={sessions}
        page={page}
        refs={refs}
        labels={{
          searchPlaceholder: '搜索主机...',
          newHostLabel: '新建主机',
        }}
        actions={viewActions.workspace}
      />

      <AppOverlayLayer
        app={app}
        vault={vault}
        hosts={hostView}
        sessions={sessions}
        labels={{
          errorTitle: '发生错误',
          confirmLabel: '确定',
        }}
        actions={viewActions.overlay}
      />

      <UpdateNotification />
    </div>
  )
}
