import { startTransition, useCallback } from 'react'
import { createChangeMasterForm, createVaultSetupForm } from '../lib/appVaultUtils'
import {
  changeMasterPassword,
  getKeychainStatus,
  initializeVaultWithPreferences,
  resetVault,
  unlockWithPreferences,
} from '../lib/backend'
import { main, model } from '../wailsjs/wailsjs/go/models'
import { VaultSetupForm, ChangeMasterForm, HostFormModel, SessionTab, WorkspaceTab, WorkspaceType, HostKeyPrompt } from '../types'

interface VaultActionHandlersProps {
  state: {
    vaultSetupForm: VaultSetupForm
    accessPassword: string
    changeMasterForm: ChangeMasterForm
    resetVaultConfirmed: boolean
  }
  setters: {
    setError: (error: string | null) => void
    setKeychainLoading: (loading: boolean) => void
    setKeychainStatus: (status: model.KeychainStatus | null) => void
    setVaultSetupBusy: (busy: boolean) => void
    setVaultInitialized: (initialized: boolean) => void
    setVaultUnlocked: (unlocked: boolean) => void
    setVaultSetupForm: (form: VaultSetupForm) => void
    setAccessBusy: (busy: boolean) => void
    setAccessPassword: (password: string) => void
    setActiveWorkspace: (workspace: WorkspaceType) => void
    setActiveSidebarPage: (page: string) => void
    setHosts: (hosts: main.Host[]) => void
    setSelectedHostId: (id: string | null) => void
    setSelectedSftpHostId: (id: string | null) => void
    setSearchQuery: (query: string) => void
    setNewTabSearchQuery: (query: string) => void
    setChangeMasterBusy: (busy: boolean) => void
    setChangeMasterForm: (form: ChangeMasterForm | ((current: ChangeMasterForm) => ChangeMasterForm)) => void
    setResetVaultBusy: (busy: boolean) => void
    setResetVaultConfirmed: (confirmed: boolean) => void
    setHostDialogMode: (mode: 'create' | 'edit' | null) => void
    setDeleteCandidate: (host: main.Host | null) => void
    setHostKeyPrompt: (prompt: HostKeyPrompt | null) => void
    setSessionTabs: (tabs: SessionTab[]) => void
    setActiveSessionId: (id: string | null) => void
    setNewTabs: (tabs: WorkspaceTab[]) => void
    setActiveNewTabId: (id: string | null) => void
    setConnectingHostIds: (ids: string[]) => void
  }
  refs: {
    newTabCounterRef: React.MutableRefObject<number>
  }
}

export function useVaultActionHandlers({
  state,
  setters,
  refs,
}: VaultActionHandlersProps) {
  const {
    vaultSetupForm,
    accessPassword,
    changeMasterForm,
    resetVaultConfirmed,
  } = state
  const {
    setError,
    setKeychainLoading,
    setKeychainStatus,
    setVaultSetupBusy,
    setVaultInitialized,
    setVaultUnlocked,
    setVaultSetupForm,
    setAccessBusy,
    setAccessPassword,
    setActiveWorkspace,
    setActiveSidebarPage,
    setHosts,
    setSelectedHostId,
    setSelectedSftpHostId,
    setSearchQuery,
    setNewTabSearchQuery,
    setChangeMasterBusy,
    setChangeMasterForm,
    setResetVaultBusy,
    setResetVaultConfirmed,
    setHostDialogMode,
    setDeleteCandidate,
    setHostKeyPrompt,
    setSessionTabs,
    setActiveSessionId,
    setNewTabs,
    setActiveNewTabId,
    setConnectingHostIds,
  } = setters
  const { newTabCounterRef } = refs

  const refreshKeychainStatus = useCallback(() => {
    setKeychainLoading(true)

    return getKeychainStatus()
      .then((status) => {
        setKeychainStatus(status)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setKeychainLoading(false))
  }, [setError, setKeychainLoading, setKeychainStatus])

  function handleInitializeVault(event: React.FormEvent) {
    event.preventDefault()

    if (vaultSetupForm.password !== vaultSetupForm.confirmPassword) {
      setError('两次输入的主密码不一致，请重新确认。')
      return
    }
    if (!vaultSetupForm.riskAcknowledged) {
      setError('请先确认你已了解主密码遗失后无法恢复。')
      return
    }

    setVaultSetupBusy(true)
    setError(null)

    initializeVaultWithPreferences(vaultSetupForm.password, true)
      .then(() => {
        setVaultInitialized(true)
        setVaultUnlocked(true)
        setVaultSetupForm(createVaultSetupForm())
        refreshKeychainStatus()
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setVaultSetupBusy(false))
  }

  function handleAccessPassword(event: React.FormEvent) {
    event.preventDefault()
    setAccessBusy(true)
    setError(null)

    unlockWithPreferences(accessPassword, true)
      .then(() => {
        setVaultUnlocked(true)
        setAccessPassword('')
        refreshKeychainStatus()
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setAccessBusy(false))
  }

  function handleChangeMasterField(field: keyof ChangeMasterForm, value: string) {
    setChangeMasterForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleChangeMasterPassword(event: React.FormEvent) {
    event.preventDefault()

    if (changeMasterForm.nextPassword !== changeMasterForm.confirmPassword) {
      setError('两次输入的新主密码不一致，请重新确认。')
      return
    }

    setChangeMasterBusy(true)
    setError(null)

    changeMasterPassword(
      changeMasterForm.currentPassword,
      changeMasterForm.nextPassword,
      true,
    )
      .then(() => {
        setChangeMasterForm(createChangeMasterForm())
        refreshKeychainStatus()
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setChangeMasterBusy(false))
  }

  function handleResetVault() {
    if (!resetVaultConfirmed) {
      setError('请先确认要清空当前 Vault。')
      return
    }

    setResetVaultBusy(true)
    setError(null)

    resetVault()
      .then(() => {
        startTransition(() => {
          setActiveWorkspace('vaults')
          setActiveSidebarPage('hosts')
          setHosts([])
          setSelectedHostId(null)
          setSelectedSftpHostId(null)
          setSearchQuery('')
          setNewTabSearchQuery('')
          setVaultInitialized(false)
          setVaultUnlocked(false)
          setVaultSetupForm(createVaultSetupForm())
          setAccessPassword('')
          setChangeMasterForm(createChangeMasterForm())
          setResetVaultConfirmed(false)
          setHostDialogMode(null)
          setDeleteCandidate(null)
          setHostKeyPrompt(null)
          setSessionTabs([])
          setActiveSessionId(null)
          newTabCounterRef.current = 0
          setNewTabs([])
          setActiveNewTabId(null)
          setConnectingHostIds([])
          setKeychainStatus(null)
        })
        refreshKeychainStatus()
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setResetVaultBusy(false))
  }

  return {
    refreshKeychainStatus,
    handleInitializeVault,
    handleAccessPassword,
    handleChangeMasterField,
    handleChangeMasterPassword,
    handleResetVault,
  }
}
