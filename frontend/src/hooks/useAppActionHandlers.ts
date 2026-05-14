import { useHostActionHandlers } from './useHostActionHandlers'
import { useSessionActionHandlers } from './useSessionActionHandlers'
import { useVaultActionHandlers } from './useVaultActionHandlers'
import { main } from '../wailsjs/wailsjs/go/models'
import { HostFormModel, SessionTab, WorkspaceTab, WorkspaceType, HostKeyPrompt, VaultSetupForm, ChangeMasterForm } from '../types'

interface AppActionHandlersProps {
  vaultState: {
    vaultSetupForm: VaultSetupForm
    accessPassword: string
    changeMasterForm: ChangeMasterForm
    resetVaultConfirmed: boolean
  }
  hostState: {
    hosts: main.Host[]
    hostDialogMode: 'create' | 'edit' | null
    hostForm: HostFormModel
    vaultUnlocked: boolean
    deleteCandidate: main.Host | null
    selectedHostId: string | null
    selectedSftpHostId: string | null
    sessionTabs: SessionTab[]
  }
  sessionState: {
    hosts: main.Host[]
    activeWorkspace: WorkspaceType
    activeNewTabId: string | null
    sessionTabs: SessionTab[]
    hostKeyPrompt: HostKeyPrompt | null
    connectingHostIds: string[]
    isAcceptingKey: boolean
  }
  setters: any // Setters are many, can keep as any or define a large interface
  refs: any
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
