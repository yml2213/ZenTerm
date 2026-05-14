import type { VaultSetupForm, ChangeMasterForm } from '../types'

export function createVaultSetupForm(): VaultSetupForm {
  return {
    password: '',
    confirmPassword: '',
    riskAcknowledged: false,
  }
}

export function createChangeMasterForm(): ChangeMasterForm {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  }
}
