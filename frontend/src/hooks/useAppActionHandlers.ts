import { useHostActionHandlers } from './useHostActionHandlers'
import { useSessionActionHandlers } from './useSessionActionHandlers'
import { useVaultActionHandlers } from './useVaultActionHandlers'
import { cmd } from '../wailsjs/wailsjs/go/models'
import { HostFormModel, SessionTab, WorkspaceType, HostKeyPrompt, VaultSetupForm, ChangeMasterForm } from '../types'
import type { AppStateRefs, AppStateSetters } from './useAppState'

interface AppActionHandlersProps {
  vaultState: {
    vaultSetupForm: VaultSetupForm
    accessPassword: string
    changeMasterForm: ChangeMasterForm
    resetVaultConfirmed: boolean
  }
  hostState: {
    hosts: cmd.Host[]
    hostDialogMode: 'create' | 'edit' | null
    hostForm: HostFormModel
    vaultUnlocked: boolean
    deleteCandidate: cmd.Host | null
    selectedHostId: string | null
    selectedSftpHostId: string | null
    sessionTabs: SessionTab[]
  }
  sessionState: {
    hosts: cmd.Host[]
    activeWorkspace: WorkspaceType
    activeNewTabId: string | null
    sessionTabs: SessionTab[]
    hostKeyPrompt: HostKeyPrompt | null
    connectingHostIds: string[]
    isAcceptingKey: boolean
  }
  setters: AppStateSetters
  refs: AppStateRefs
  helpers: {
    removeSessionTab: (sessionID: string) => void
    openCreateHost: () => void
  }
}

export function useAppActionHandlers({
  vaultState,
  hostState,
  sessionState,
  setters,
  refs,
  helpers,
}: AppActionHandlersProps) {
  const vaultActions = useVaultActionHandlers({
    state: vaultState,
    setters,
    refs,
  })

  const hostActions = useHostActionHandlers({
    state: hostState,
    setters,
    helpers,
  })

  const sessionActions = useSessionActionHandlers({
    state: sessionState,
    setters,
    refs,
    helpers,
  })

  function handleSidebarPageChange(page: string) {
    setters.setActiveSidebarPage(page)
  }

  return {
    ...vaultActions,
    ...hostActions,
    ...sessionActions,
    handleSidebarPageChange,
  }
}
