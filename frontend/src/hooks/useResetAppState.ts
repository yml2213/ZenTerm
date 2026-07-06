import { startTransition } from 'react'
import { createChangeMasterForm, createVaultSetupForm } from '@/features/vault/appVaultUtils'
import type { AppStateRefs, AppStateSetters } from './useAppState'

interface ResetAppStateProps {
  setters: AppStateSetters
  refs: AppStateRefs
}

export function useResetAppState({ setters, refs }: ResetAppStateProps) {
  function resetAppStateAfterVaultReset() {
    startTransition(() => {
      setters.workspace.setActiveWorkspace('vaults')
      setters.hosts.setActiveSidebarPage('hosts')
      setters.hosts.setHosts([])
      setters.hosts.setSelectedHostId(null)
      setters.hosts.setSelectedSftpHostId(null)
      setters.hosts.setSearchQuery('')
      setters.hosts.setNewTabSearchQuery('')
      setters.vault.setVaultInitialized(false)
      setters.vault.setVaultUnlocked(false)
      setters.vault.setVaultSetupForm(createVaultSetupForm())
      setters.vault.setAccessPassword('')
      setters.vault.setChangeMasterForm(createChangeMasterForm())
      setters.vault.setResetVaultConfirmed(false)
      setters.hosts.setHostDialogMode(null)
      setters.hosts.setDeleteCandidate(null)
      setters.sessions.setHostKeyPrompt(null)
      setters.workspace.setSessionTabs([])
      setters.workspace.setActiveSessionId(null)
      refs.newTabCounterRef.current = 0
      setters.workspace.setNewTabs([])
      setters.workspace.setActiveNewTabId(null)
      setters.sessions.setConnectingHostIds([])
    })
  }

  return resetAppStateAfterVaultReset
}
