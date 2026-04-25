import { useState } from 'react'
import { createChangeMasterForm, createVaultSetupForm } from '../lib/appVaultUtils.js'

export function useVaultState() {
  const [vaultInitialized, setVaultInitialized] = useState(false)
  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [vaultReady, setVaultReady] = useState(false)
  const [vaultSetupForm, setVaultSetupForm] = useState(createVaultSetupForm)
  const [vaultSetupBusy, setVaultSetupBusy] = useState(false)
  const [accessPassword, setAccessPassword] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [changeMasterForm, setChangeMasterForm] = useState(createChangeMasterForm)
  const [changeMasterBusy, setChangeMasterBusy] = useState(false)
  const [resetVaultConfirmed, setResetVaultConfirmed] = useState(false)
  const [resetVaultBusy, setResetVaultBusy] = useState(false)

  return {
    vaultInitialized,
    setVaultInitialized,
    vaultUnlocked,
    setVaultUnlocked,
    vaultReady,
    setVaultReady,
    vaultSetupForm,
    setVaultSetupForm,
    vaultSetupBusy,
    setVaultSetupBusy,
    accessPassword,
    setAccessPassword,
    accessBusy,
    setAccessBusy,
    changeMasterForm,
    setChangeMasterForm,
    changeMasterBusy,
    setChangeMasterBusy,
    resetVaultConfirmed,
    setResetVaultConfirmed,
    resetVaultBusy,
    setResetVaultBusy,
    showSetupModal: !vaultInitialized && vaultReady,
    showAccessModal: vaultInitialized && !vaultUnlocked && vaultReady,
  }
}
