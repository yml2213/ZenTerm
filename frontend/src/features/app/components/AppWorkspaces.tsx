import type { FormEvent, RefObject } from 'react'
import HostForm from '@/features/hosts/components/HostForm'
import LogWorkspace from '@/features/sessions/components/LogWorkspace'
import NewTabWorkspace from '@/features/workspace/components/NewTabWorkspace'
import SftpWorkspacePage from '@/features/sftp/SftpWorkspacePage'
import SshWorkspace from '@/features/sessions/components/SshWorkspace'
import VaultWorkspace from '@/features/vault/components/VaultWorkspace'
import { navigationItems } from '@/features/app/appShellConfig'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import type { ChangeMasterForm, HostFormModel, SessionTab, WorkspaceTab, WorkspaceType } from '@/types'

interface WorkspaceSession {
  sessionId: string
  title: string
  hostID?: string
  remoteAddr?: string
  connectedAt?: string
}

export interface AppWorkspaceActions {
  onError: (message: string) => void
  onSendInput: (sessionId: string, data: string) => Promise<void>
  onResizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  onSessionClosed: (sessionId: string) => void
  onWorkspaceChange: (workspace: WorkspaceType) => void
  onCloseLogTab: (tabId: string) => void
  onSidebarPageChange: (page: string) => void
  onHostFilterChange: (filter: string) => void
  onSearchQueryChange: (query: string) => void
  onHostViewModeChange: (mode: 'grid' | 'list') => void
  onCreateHost: () => void
  onSelectHost: (id: string) => void
  onConnectHost: (id: string) => void
  onEditHost: (host: cmd.Host) => void
  onDeleteHost: (host: cmd.Host) => void
  onCopyHostAddress: (host: cmd.Host) => void
  onToggleFavorite: (host: cmd.Host) => void
  onTogglePinned: (host: cmd.Host) => void
  onReorderHosts: (orderedHostIds: string[]) => void
  onRefreshHosts: () => Promise<void> | void
  onChangeMasterField: (field: keyof ChangeMasterForm, value: string) => void
  onChangeMasterPassword: (event: FormEvent) => void
  onResetVaultConfirmedChange: (confirmed: boolean) => void
  onResetVault: () => void
  onOpenLogTab: (log: cmd.SessionLog) => void
  onNewTabSearchQueryChange: (query: string) => void
  onPickSftpHost: (hostId?: string | null) => void
  onHostFormChange: (form: HostFormModel) => void
  onSaveHost: (event: FormEvent) => void
  onCloseHostDialog: () => void
}

interface AppWorkspacesProps {
  workspace: {
    activeWorkspace: WorkspaceType
    sessionTabs: SessionTab[]
    activeSessionId: string | null
    activeLogTabId: string | null
    activeSession: SessionTab | null
    activeLogTab: WorkspaceTab | null
  }
  hosts: {
    activeSidebarPage: string
    hosts: cmd.Host[]
    selectedHostId: string | null
    searchQuery: string
    newTabSearchQuery: string
    hostViewMode: 'grid' | 'list'
    hostFilterKey: string
    hostDialogMode: 'create' | 'edit' | null
    hostForm: HostFormModel
    isSavingHost: boolean
    filteredHosts: cmd.Host[]
    hostGroups: string[]
    hostTags: string[]
    favoriteHostCount: number
    recentHostCount: number
    sessionCountByHost: Record<string, number>
    selectedSftpHost: cmd.Host | null
    isHostsPage: boolean
    isSettingsPage: boolean
    isKnownHostsPage: boolean
    isKeychainPage: boolean
    isLogsPage: boolean
  }
  vault: {
    vaultUnlocked: boolean
    changeMasterForm: ChangeMasterForm
    changeMasterBusy: boolean
    resetVaultConfirmed: boolean
    resetVaultBusy: boolean
  }
  sessions: {
    connectingHostIds: string[]
  }
  page: {
    resolvedPageHeader: {
      kicker: string
      title: string
      description?: string
    }
  }
  refs: {
    hostSearchInputRef: RefObject<HTMLInputElement>
    newTabSearchInputRef: RefObject<HTMLInputElement>
  }
  labels: {
    searchPlaceholder: string
    newHostLabel: string
  }
  actions: AppWorkspaceActions
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toWorkspaceSession(tab: SessionTab | null): WorkspaceSession | null {
  if (!tab?.sessionId) {
    return null
  }

  return {
    sessionId: tab.sessionId,
    title: tab.title,
    hostID: tab.hostID,
    remoteAddr: tab.remoteAddr,
    connectedAt: tab.connectedAt,
  }
}

export default function AppWorkspaces({
  workspace,
  hosts: hostView,
  vault,
  sessions,
  page,
  refs,
  labels,
  actions,
}: AppWorkspacesProps) {
  const {
    activeWorkspace,
    sessionTabs,
    activeSessionId,
    activeLogTabId,
    activeSession,
    activeLogTab,
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
    changeMasterForm,
    changeMasterBusy,
    resetVaultConfirmed,
    resetVaultBusy,
  } = vault
  const { connectingHostIds } = sessions
  const { resolvedPageHeader } = page
  const { hostSearchInputRef, newTabSearchInputRef } = refs
  const sshSessions = sessionTabs
    .map((tab) => toWorkspaceSession(tab))
    .filter((tab): tab is WorkspaceSession => Boolean(tab))
  const activeSshSession = toWorkspaceSession(activeSession)
  const isSshWorkspaceVisible = activeWorkspace === 'ssh'
  const shouldMountSshWorkspace = isSshWorkspaceVisible || sshSessions.length > 0
  const hostDrawer = hostDialogMode ? (
    <HostForm
      mode={hostDialogMode}
      value={hostForm}
      onChange={actions.onHostFormChange}
      onSubmit={actions.onSaveHost}
      disabled={!vaultUnlocked}
      busy={isSavingHost}
      onClose={actions.onCloseHostDialog}
    />
  ) : null

  return (
    <>
      {shouldMountSshWorkspace ? (
        <div className="workspace-keepalive" hidden={!isSshWorkspaceVisible}>
          <SshWorkspace
            sessionTabs={sshSessions}
            activeSessionId={activeSessionId}
            activeSession={activeSshSession}
            visible={isSshWorkspaceVisible}
            onSendInput={actions.onSendInput}
            onResize={actions.onResizeTerminal}
            onSessionClosed={actions.onSessionClosed}
            onError={(err: unknown) => actions.onError(normalizeError(err))}
          />
        </div>
      ) : null}

      {activeWorkspace === 'vaults' ? (
        <VaultWorkspace
          navigationItems={navigationItems}
          activeSidebarPage={activeSidebarPage}
          onSidebarPageChange={actions.onSidebarPageChange}
          isHostsPage={isHostsPage}
          hostFilterKey={hostFilterKey}
          onHostFilterChange={actions.onHostFilterChange}
          hosts={hosts}
          favoriteHostCount={favoriteHostCount}
          recentHostCount={recentHostCount}
          hostGroups={hostGroups}
          hostTags={hostTags}
          resolvedPageHeader={resolvedPageHeader}
          hostSearchInputRef={hostSearchInputRef}
          searchQuery={searchQuery}
          onSearchQueryChange={actions.onSearchQueryChange}
          searchPlaceholder={labels.searchPlaceholder}
          hostViewMode={hostViewMode}
          onHostViewModeChange={actions.onHostViewModeChange}
          onCreateHost={actions.onCreateHost}
          newHostLabel={labels.newHostLabel}
          filteredHosts={filteredHosts}
          selectedHostId={selectedHostId}
          sessionCountByHost={sessionCountByHost}
          connectingHostIds={connectingHostIds}
          onSelectHost={actions.onSelectHost}
          onConnectHost={actions.onConnectHost}
          onEditHost={actions.onEditHost}
          onDeleteHost={actions.onDeleteHost}
          onCopyHostAddress={actions.onCopyHostAddress}
          onToggleFavorite={actions.onToggleFavorite}
          onTogglePinned={actions.onTogglePinned}
          onReorderHosts={actions.onReorderHosts}
          onRefreshHosts={actions.onRefreshHosts}
          vaultUnlocked={vaultUnlocked}
          isSettingsPage={isSettingsPage}
          changeMasterForm={changeMasterForm}
          changeMasterBusy={changeMasterBusy}
          resetVaultConfirmed={resetVaultConfirmed}
          resetVaultBusy={resetVaultBusy}
          onChangeMasterField={actions.onChangeMasterField}
          onChangeMasterPassword={actions.onChangeMasterPassword}
          onResetVaultConfirmedChange={actions.onResetVaultConfirmedChange}
          onResetVault={actions.onResetVault}
          isKnownHostsPage={isKnownHostsPage}
          isKeychainPage={isKeychainPage}
          isLogsPage={isLogsPage}
          onOpenLogTab={actions.onOpenLogTab}
          hostDrawer={hostDrawer}
        />
      ) : activeWorkspace === 'new-tab' ? (
        <NewTabWorkspace
          searchInputRef={newTabSearchInputRef}
          searchQuery={newTabSearchQuery}
          onSearchQueryChange={actions.onNewTabSearchQueryChange}
          onCreateHost={actions.onCreateHost}
          hosts={hosts}
          onConnect={actions.onConnectHost}
          connectingHostIds={connectingHostIds}
          vaultUnlocked={vaultUnlocked}
        />
      ) : activeWorkspace === 'sftp' ? (
        <SftpWorkspacePage
          hosts={hosts}
          selectedHost={selectedSftpHost}
          vaultUnlocked={vaultUnlocked}
          onChooseHost={actions.onPickSftpHost}
          onCreateHost={actions.onCreateHost}
          onBackToVaults={() => actions.onWorkspaceChange('vaults')}
          onError={actions.onError}
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
          onCloseLog={() => activeLogTabId ? actions.onCloseLogTab(activeLogTabId) : null}
          onError={(err: unknown) => actions.onError(normalizeError(err))}
        />
      ) : null}
    </>
  )
}
