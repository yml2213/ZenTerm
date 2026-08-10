import type { AppOverlayActions } from '@/features/app/components/AppOverlayLayer'
import type { AppWorkspaceActions } from '@/features/app/components/AppWorkspaces'
import type { WorkspaceActionHandlers } from '@/features/workspace/useWorkspaceActions'
import type { AppActionHandlers } from './useAppActionHandlers'
import type { AppStateSetters } from './useAppState'

interface AppViewActionProps {
  appActions: AppActionHandlers
  setters: AppStateSetters
  workspaceActions: WorkspaceActionHandlers
}

export function createAppViewActions({
  appActions,
  setters,
  workspaceActions,
}: AppViewActionProps): {
  overlay: AppOverlayActions
  workspace: AppWorkspaceActions
} {
  return {
    workspace: {
      onError: setters.app.setError,
      onSendInput: appActions.handleSendInput,
      onResizeTerminal: appActions.handleResizeTerminal,
      onSessionClosed: appActions.handleSessionClosed,
      onWorkspaceChange: workspaceActions.handleWorkspaceChange,
      onCloseLogTab: workspaceActions.closeLogTab,
      onSidebarPageChange: appActions.handleSidebarPageChange,
      onHostFilterChange: setters.hosts.setHostFilterKey,
      onSearchQueryChange: setters.hosts.setSearchQuery,
      onHostViewModeChange: setters.hosts.setHostViewMode,
      onCreateHost: appActions.openCreateHost,
      onSelectHost: setters.hosts.setSelectedHostId,
      onConnectHost: appActions.handleConnect,
      onCancelConnectHost: appActions.handleCancelConnect,
      onEditHost: appActions.openEditHost,
      onDeleteHost: setters.hosts.setDeleteCandidate,
      onCopyHostAddress: appActions.handleCopyHostAddress,
      onToggleFavorite: appActions.handleToggleFavorite,
      onTogglePinned: appActions.handleTogglePinned,
      onReorderHosts: appActions.handleReorderHosts,
      onRefreshHosts: appActions.refreshHosts,
      onChangeMasterField: appActions.handleChangeMasterField,
      onChangeMasterPassword: appActions.handleChangeMasterPassword,
      onResetVaultConfirmedChange: appActions.handleResetVaultConfirmedChange,
      onResetVault: appActions.handleResetVault,
      onOpenLogTab: workspaceActions.openLogTab,
      onNewTabSearchQueryChange: setters.hosts.setNewTabSearchQuery,
      onPickSftpHost: appActions.handlePickSftpHost,
      onHostFormChange: setters.hosts.setHostForm,
      onSaveHost: appActions.handleSaveHost,
      onCloseHostDialog: appActions.closeHostDialog,
    },
    overlay: {
      onVaultSetupPasswordChange: appActions.handleVaultSetupPasswordChange,
      onVaultSetupConfirmPasswordChange: appActions.handleVaultSetupConfirmPasswordChange,
      onVaultSetupRiskAcknowledgedChange: appActions.handleVaultSetupRiskAcknowledgedChange,
      onInitializeVault: appActions.handleInitializeVault,
      onAccessPasswordChange: appActions.handleAccessPasswordChange,
      onContinueAccess: appActions.handleAccessPassword,
      onCancelDeleteHost: () => setters.hosts.setDeleteCandidate(null),
      onDeleteHost: appActions.handleDeleteHost,
      onCancelSSHConfigImport: appActions.dismissSSHConfigImportPrompt,
      onDismissSSHConfigImportPermanently: appActions.dismissSSHConfigImportPermanently,
      onConfirmSSHConfigImport: appActions.handleConfirmSSHConfigImport,
      onClearError: () => setters.app.setError(null),
      onAcceptHostKey: appActions.handleAcceptHostKey,
      onRejectHostKey: appActions.handleRejectHostKey,
    },
  }
}
