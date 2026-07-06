export interface VaultSetupForm {
  password: string
  confirmPassword: string
  riskAcknowledged: boolean
}

export interface ChangeMasterForm {
  currentPassword: string
  nextPassword: string
  confirmPassword: string
}
