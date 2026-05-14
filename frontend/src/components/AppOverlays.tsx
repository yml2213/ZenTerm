import type { FormEvent } from 'react'
import HostKeyModal from './HostKeyModal'
import UnlockModal from './UnlockModal'
import type { VaultSetupForm, HostKeyPrompt } from '../types'

interface Host {
  id: string
  name?: string
}

interface AppOverlaysProps {
  showSetupModal: boolean
  vaultSetupForm: VaultSetupForm
  vaultSetupBusy: boolean
  onVaultSetupPasswordChange: (value: string) => void
  onVaultSetupConfirmPasswordChange: (value: string) => void
  onVaultSetupRiskAcknowledgedChange: (value: boolean) => void
  onInitializeVault: (event: FormEvent) => void
  showAccessModal: boolean
  accessPassword: string
  accessBusy: boolean
  onAccessPasswordChange: (value: string) => void
  onContinueAccess: (event: FormEvent) => void
  deleteCandidate: Host | null
  onCancelDeleteHost: () => void
  onDeleteHost: () => void
  errorTitle: string
  error: string | null
  confirmLabel: string
  onClearError: () => void
  hostKeyPrompt: HostKeyPrompt | null
  isAcceptingKey: boolean
  onAcceptHostKey: () => void
  onRejectHostKey: () => void
}

export default function AppOverlays({
  showSetupModal,
  vaultSetupForm,
  vaultSetupBusy,
  onVaultSetupPasswordChange,
  onVaultSetupConfirmPasswordChange,
  onVaultSetupRiskAcknowledgedChange,
  onInitializeVault,
  showAccessModal,
  accessPassword,
  accessBusy,
  onAccessPasswordChange,
  onContinueAccess,
  deleteCandidate,
  onCancelDeleteHost,
  onDeleteHost,
  errorTitle,
  error,
  confirmLabel,
  onClearError,
  hostKeyPrompt,
  isAcceptingKey,
  onAcceptHostKey,
  onRejectHostKey,
}: AppOverlaysProps) {
  return (
    <>
      <UnlockModal
        open={showSetupModal}
        mode="setup"
        password={vaultSetupForm.password}
        confirmPassword={vaultSetupForm.confirmPassword}
        busy={vaultSetupBusy}
        riskAcknowledged={vaultSetupForm.riskAcknowledged}
        onPasswordChange={onVaultSetupPasswordChange}
        onConfirmPasswordChange={onVaultSetupConfirmPasswordChange}
        onRiskAcknowledgedChange={onVaultSetupRiskAcknowledgedChange}
        onSubmit={onInitializeVault}
      />

      <UnlockModal
        open={showAccessModal}
        mode="continue"
        password={accessPassword}
        busy={accessBusy}
        onPasswordChange={onAccessPasswordChange}
        onSubmit={onContinueAccess}
      />

      {deleteCandidate ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-content modal-narrow" role="dialog" aria-modal="true" aria-labelledby="delete-host-title">
            <h2 id="delete-host-title">确认删除主机</h2>
            <p>这会删除 {deleteCandidate.name || deleteCandidate.id} 的保存配置和加密凭据，且无法撤销。</p>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={onCancelDeleteHost}>
                取消
              </button>
              <button type="button" className="primary-button danger" onClick={onDeleteHost}>
                删除主机
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {error ? (
        <div className="modal-backdrop">
          <div className="modal-content modal-narrow">
            <h2>{errorTitle}</h2>
            <p>{error}</p>
            <button
              type="button"
              className="primary-button"
              onClick={onClearError}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : null}

      <HostKeyModal
        prompt={hostKeyPrompt}
        busy={isAcceptingKey}
        onAccept={onAcceptHostKey}
        onReject={onRejectHostKey}
      />
    </>
  )
}
