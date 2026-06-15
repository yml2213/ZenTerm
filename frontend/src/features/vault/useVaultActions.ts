import { createChangeMasterForm, createVaultSetupForm } from '../../lib/appVaultUtils'
import {
  changeMasterPassword,
  initializeVaultWithPreferences,
  resetVault,
  unlockWithPreferences,
} from '../../lib/backend'
import { VaultSetupForm, ChangeMasterForm } from '../../types'

interface VaultActionHandlersProps {
  state: {
    vaultSetupForm: VaultSetupForm
    accessPassword: string
    changeMasterForm: ChangeMasterForm
    resetVaultConfirmed: boolean
  }
  setters: {
    app: {
      setError: (error: string | null) => void
    }
    vault: {
      setVaultSetupBusy: (busy: boolean) => void
      setVaultInitialized: (initialized: boolean) => void
      setVaultUnlocked: (unlocked: boolean) => void
      setVaultSetupForm: (form: VaultSetupForm) => void
      setAccessBusy: (busy: boolean) => void
      setAccessPassword: (password: string) => void
      setChangeMasterBusy: (busy: boolean) => void
      setChangeMasterForm: (form: ChangeMasterForm | ((current: ChangeMasterForm) => ChangeMasterForm)) => void
      setResetVaultBusy: (busy: boolean) => void
    }
  }
  helpers: {
    resetAppStateAfterVaultReset: () => void
  }
}

export function useVaultActions({
  state,
  setters,
  helpers,
}: VaultActionHandlersProps) {
  const {
    vaultSetupForm,
    accessPassword,
    changeMasterForm,
    resetVaultConfirmed,
  } = state
  const {
    setError,
  } = setters.app
  const {
    setVaultSetupBusy,
    setVaultInitialized,
    setVaultUnlocked,
    setVaultSetupForm,
    setAccessBusy,
    setAccessPassword,
    setChangeMasterBusy,
    setChangeMasterForm,
    setResetVaultBusy,
  } = setters.vault
  const { resetAppStateAfterVaultReset } = helpers

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
        resetAppStateAfterVaultReset()
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setResetVaultBusy(false))
  }

  return {
    handleInitializeVault,
    handleAccessPassword,
    handleChangeMasterField,
    handleChangeMasterPassword,
    handleResetVault,
  }
}
