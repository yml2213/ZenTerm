export function createVaultSetupForm() {
  return {
    password: '',
    confirmPassword: '',
    riskAcknowledged: false,
  }
}

export function createChangeMasterForm() {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  }
}
