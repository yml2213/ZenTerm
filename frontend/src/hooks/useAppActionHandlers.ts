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
    refs,
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
    setters.setSSHConfigImportPrompt(null)
  }

  async function handleConfirmSSHConfigImport() {
    const { sshConfigImportPrompt, sshConfigImportBusy } = sshConfigImportState
    if (!sshConfigImportPrompt || sshConfigImportBusy) {
      return
    }

    setters.setSSHConfigImportBusy(true)
    try {
      await importLocalSSHConfigHosts(sshConfigImportPrompt.hostIds)
      const nextHosts = withDemoHosts(await listHosts())
      startTransition(() => {
        setters.setHosts(nextHosts)
        setters.setSelectedHostId(nextHosts[0]?.id || null)
        setters.setSSHConfigImportPrompt(null)
      })
    } catch (err) {
      setters.setError(err instanceof Error ? err.message : String(err))
    } finally {
      setters.setSSHConfigImportBusy(false)
    }
  }

  function handleSidebarPageChange(page: string) {
    setters.setActiveSidebarPage(page)
  }

  return {
    ...vaultActions,
    ...hostActions,
    ...sessionActions,
    handleSidebarPageChange,
    dismissSSHConfigImportPrompt,
    handleConfirmSSHConfigImport,
  }
}
