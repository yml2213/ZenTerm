import type { FormEvent } from 'react'
import AppOverlays from './AppOverlays'
import type { HostKeyPrompt, SSHConfigImportPrompt, VaultSetupForm } from '@/types'
import { cmd } from '@/wailsjs/wailsjs/go/models'

export interface AppOverlayActions {
  onVaultSetupPasswordChange: (value: string) => void
  onVaultSetupConfirmPasswordChange: (value: string) => void
  onVaultSetupRiskAcknowledgedChange: (value: boolean) => void
  onInitializeVault: (event: FormEvent) => void
  onAccessPasswordChange: (value: string) => void
  onContinueAccess: (event: FormEvent) => void
  onCancelDeleteHost: () => void
  onDeleteHost: () => void
  onCancelSSHConfigImport: () => void
  onDismissSSHConfigImportPermanently: () => void
  onConfirmSSHConfigImport: () => void
  onClearError: () => void
  onAcceptHostKey: () => void
  onRejectHostKey: () => void
}

interface AppOverlayLayerProps {
  app: {
    error: string | null
    sshConfigImportPrompt: SSHConfigImportPrompt | null
    sshConfigImportBusy: boolean
  }
  vault: {
    showSetupModal: boolean
    vaultSetupForm: VaultSetupForm
    vaultSetupBusy: boolean
    showAccessModal: boolean
    accessPassword: string
    accessBusy: boolean
  }
  hosts: {
    deleteCandidate: cmd.Host | null
  }
  sessions: {
    hostKeyPrompt: HostKeyPrompt | null
    isAcceptingKey: boolean
  }
  labels: {
    errorTitle: string
    confirmLabel: string
  }
  actions: AppOverlayActions
}

export default function AppOverlayLayer({
  app,
  vault,
  hosts,
  sessions,
  labels,
  actions,
}: AppOverlayLayerProps) {
  return (
    <AppOverlays
      showSetupModal={vault.showSetupModal}
      vaultSetupForm={vault.vaultSetupForm}
      vaultSetupBusy={vault.vaultSetupBusy}
      onVaultSetupPasswordChange={actions.onVaultSetupPasswordChange}
      onVaultSetupConfirmPasswordChange={actions.onVaultSetupConfirmPasswordChange}
      onVaultSetupRiskAcknowledgedChange={actions.onVaultSetupRiskAcknowledgedChange}
      onInitializeVault={actions.onInitializeVault}
      showAccessModal={vault.showAccessModal}
      accessPassword={vault.accessPassword}
      accessBusy={vault.accessBusy}
      onAccessPasswordChange={actions.onAccessPasswordChange}
      onContinueAccess={actions.onContinueAccess}
      deleteCandidate={hosts.deleteCandidate}
      onCancelDeleteHost={actions.onCancelDeleteHost}
      onDeleteHost={actions.onDeleteHost}
      sshConfigImportPrompt={app.sshConfigImportPrompt}
      sshConfigImportBusy={app.sshConfigImportBusy}
      onCancelSSHConfigImport={actions.onCancelSSHConfigImport}
      onDismissSSHConfigImportPermanently={actions.onDismissSSHConfigImportPermanently}
      onConfirmSSHConfigImport={actions.onConfirmSSHConfigImport}
      errorTitle={labels.errorTitle}
      error={app.error}
      confirmLabel={labels.confirmLabel}
      onClearError={actions.onClearError}
      hostKeyPrompt={sessions.hostKeyPrompt}
      isAcceptingKey={sessions.isAcceptingKey}
      onAcceptHostKey={actions.onAcceptHostKey}
      onRejectHostKey={actions.onRejectHostKey}
    />
  )
}
