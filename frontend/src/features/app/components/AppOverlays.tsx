import type { FormEvent } from 'react'
import HostKeyModal from '@/features/hosts/components/HostKeyModal'
import UnlockModal from '@/features/vault/components/UnlockModal'
import type { VaultSetupForm, HostKeyPrompt, SSHConfigImportPrompt } from '@/types'

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
  sshConfigImportPrompt: SSHConfigImportPrompt | null
  sshConfigImportBusy: boolean
  onCancelSSHConfigImport: () => void
  onDismissSSHConfigImportPermanently: () => void
  onConfirmSSHConfigImport: () => void
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
  sshConfigImportPrompt,
  sshConfigImportBusy,
  onCancelSSHConfigImport,
  onDismissSSHConfigImportPermanently,
  onConfirmSSHConfigImport,
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

      {sshConfigImportPrompt ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-content modal-narrow" role="dialog" aria-modal="true" aria-labelledby="ssh-config-import-title">
            <h2 id="ssh-config-import-title">导入 SSH 配置</h2>
            <p>发现 {sshConfigImportPrompt.total} 个可导入的本机 SSH 配置。</p>
            <div className="hostkey-meta">
              {sshConfigImportPrompt.previewLines.map((line) => (
                <small key={line}>{line}</small>
              ))}
              {sshConfigImportPrompt.total > sshConfigImportPrompt.previewLines.length ? (
                <small>还有 {sshConfigImportPrompt.total - sshConfigImportPrompt.previewLines.length} 个配置会一起导入。</small>
              ) : null}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={onDismissSSHConfigImportPermanently} disabled={sshConfigImportBusy}>
                不再提示
              </button>
              <button type="button" className="ghost-button" onClick={onCancelSSHConfigImport} disabled={sshConfigImportBusy}>
                暂不导入
              </button>
              <button type="button" className="primary-button" onClick={onConfirmSSHConfigImport} disabled={sshConfigImportBusy}>
                {sshConfigImportBusy ? '导入中...' : '导入配置'}
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
