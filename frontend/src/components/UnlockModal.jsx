import { LockKeyhole, ShieldEllipsis } from 'lucide-react'

export default function UnlockModal({
  open,
  mode = 'continue',
  password,
  confirmPassword = '',
  busy,
  riskAcknowledged = false,
  onPasswordChange,
  onConfirmPasswordChange,
  onRiskAcknowledgedChange,
  onSubmit,
}) {
  if (!open) {
    return null
  }

  const isSetup = mode === 'setup'
  const title = isSetup ? '设置主密码以启用本地保险箱' : '输入主密码以继续使用'
  const description = isSetup
    ? '主密码只保存在本机，用于加密主机凭据。ZenTerm 会把它保存在系统钥匙串中，后续默认直接进入。'
    : '当前设备没有可用的系统钥匙串记录，需要输入一次主密码后继续。'
  const submitLabel = isSetup ? (busy ? '创建中...' : '创建并进入') : (busy ? '验证中...' : '继续')

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-content modal-narrow" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
        <div className="modal-eyebrow">
          <span className="pill subtle">
            <ShieldEllipsis size={14} />
            本地保险箱
          </span>
        </div>
        <h2 id="unlock-title">{title}</h2>
        <p>{description}</p>

        <form className="modal-form-stack" onSubmit={onSubmit}>
          <label>
            主密码
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="请输入主密码"
              autoFocus
              required
            />
          </label>

          {isSetup && (
            <label>
              确认主密码
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => onConfirmPasswordChange?.(event.target.value)}
                placeholder="请再次输入主密码"
                required
              />
            </label>
          )}

          {isSetup && (
            <label className="remember-toggle danger-toggle">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(event) => onRiskAcknowledgedChange?.(event.target.checked)}
              />
              <span>
                <strong>我已了解忘记主密码后无法恢复</strong>
                <small>若遗忘主密码，只能重置 Vault，已保存的主机与加密凭据都会被清空。</small>
              </span>
            </label>
          )}

          <div className="remember-toggle info-toggle">
            <span>
              <strong>系统钥匙串</strong>
              <small>设置完成后，ZenTerm 会自动使用系统钥匙串保存主密码，后续无需再手动进入。</small>
            </span>
          </div>

          <button type="submit" className="primary-button wide" disabled={busy}>
            <LockKeyhole size={14} />
            {submitLabel}
          </button>
        </form>
      </section>
    </div>
  )
}
