import { startTransition } from 'react'
import { useHostActions } from '../features/hosts/useHostActions'
import { useSessionActions } from '../features/sessions/useSessionActions'
import { useVaultActions } from '../features/vault/useVaultActions'
import { withDemoHosts } from '../lib/appHostUtils'
import { importLocalSSHConfigHosts, listHosts } from '../lib/backend'
import { cmd } from '../wailsjs/wailsjs/go/models'
import {
  ChangeMasterForm,
  HostFormModel,
  HostKeyPrompt,
  SessionTab,
  SSHConfigImportPrompt,
  VaultSetupForm,
  WorkspaceType,
} from '../types'
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
    openCreateHost: () => void
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
    helpers,
  })

  const sessionActions = useSessionActions({
    state: sessionState,
    setters,
    refs,
    helpers,
  })

  function dismissSSHConfigImportPrompt() {
    const { sshConfigImportPrompt } = sshConfigImportState
    if (sshConfigImportPrompt) {
      window.sessionStorage.setItem(sshConfigImportPrompt.promptKey, 'dismissed')
    }
    setters.app.setSSHConfigImportPrompt(null)
  }

  function dismissSSHConfigImportPermanently() {
    window.localStorage.setItem('zenterm:ssh-config-import:never-prompt', 'true')
    setters.app.setSSHConfigImportPrompt(null)
  }

  async function handleConfirmSSHConfigImport() {
    const { sshConfigImportPrompt, sshConfigImportBusy } = sshConfigImportState
    if (!sshConfigImportPrompt || sshConfigImportBusy) {
      return
    }

    setters.app.setSSHConfigImportBusy(true)
    try {
      await importLocalSSHConfigHosts(sshConfigImportPrompt.hostIds)
      const nextHosts = withDemoHosts(await listHosts())
      startTransition(() => {
        setters.hosts.setHosts(nextHosts)
        setters.hosts.setSelectedHostId(nextHosts[0]?.id || null)
        setters.app.setSSHConfigImportPrompt(null)
      })
    } catch (err) {
      setters.app.setError(err instanceof Error ? err.message : String(err))
    } finally {
      setters.app.setSSHConfigImportBusy(false)
    }
  }

  function handleSidebarPageChange(page: string) {
    setters.hosts.setActiveSidebarPage(page)
  }

  return {
    ...vaultActions,
    ...hostActions,
    ...sessionActions,
    handleSidebarPageChange,
    dismissSSHConfigImportPrompt,
    dismissSSHConfigImportPermanently,
    handleConfirmSSHConfigImport,
  }
}
