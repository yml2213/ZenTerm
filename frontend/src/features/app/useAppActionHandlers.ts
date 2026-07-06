import { useHostActions } from '@/features/hosts/useHostActions'
import { useSessionActions } from '@/features/sessions/useSessionActions'
import { useSSHConfigImportActions } from '@/features/hosts/useSSHConfigImportActions'
import { useVaultActions } from '@/features/vault/useVaultActions'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import type {
  ChangeMasterForm,
  HostFormModel,
  HostKeyPrompt,
  SessionTab,
  SSHConfigImportPrompt,
  VaultSetupForm,
  WorkspaceType,
} from '@/types'
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
  sshConfigImportState: {
    sshConfigImportPrompt: SSHConfigImportPrompt | null
    sshConfigImportBusy: boolean
  }
  setters: AppStateSetters
  refs: AppStateRefs
  helpers: {
    removeSessionTab: (sessionID: string) => void
    resetAppStateAfterVaultReset: () => void
  }
}

export function useAppActionHandlers({
  vaultState,
  hostState,
  sessionState,
  sshConfigImportState,
  setters,
  refs,
  helpers,
}: AppActionHandlersProps) {
  const vaultActions = useVaultActions({
    state: vaultState,
    setters,
    helpers: {
      resetAppStateAfterVaultReset: helpers.resetAppStateAfterVaultReset,
    },
  })

  const hostActions = useHostActions({
    state: hostState,
    setters,
  })

  const sessionActions = useSessionActions({
    state: sessionState,
    setters,
    refs,
    helpers,
  })
  const sshConfigImportActions = useSSHConfigImportActions({
    state: sshConfigImportState,
    setters,
  })

  function handleSidebarPageChange(page: string) {
    setters.hosts.setActiveSidebarPage(page)
  }

  return {
    ...vaultActions,
    ...hostActions,
    ...sessionActions,
    ...sshConfigImportActions,
    handleSidebarPageChange,
  }
}

export type AppActionHandlers = ReturnType<typeof useAppActionHandlers>
