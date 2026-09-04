import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'

interface UnlockModalProps {
  open: boolean
  mode?: 'continue' | 'setup'
  password: string
  confirmPassword?: string
  busy: boolean
  riskAcknowledged?: boolean
  onPasswordChange: (value: string) => void
  onConfirmPasswordChange?: (value: string) => void
  onRiskAcknowledgedChange?: (value: boolean) => void
  onSubmit: (event: FormEvent) => void
}

function evaluatePasswordStrength(pwd: string): {
  score: number
  label: string
  color: string
} {
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++

  if (score <= 1) return { score: 1, label: '较弱', color: '#ef4444' }
  if (score === 2) return { score: 2, label: '一般', color: '#f59e0b' }
  if (score === 3) return { score: 3, label: '良好', color: '#3b82f6' }
  return { score: 4, label: '高强极客', color: '#10b981' }
}

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
}: UnlockModalProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  if (!open) {
    return null
  }

  const isSetup = mode === 'setup'
  const title = isSetup ? '设置主密码以启用本地保险箱' : '输入主密码以继续使用'
  const description = isSetup
    ? '主密码仅用于本地衍生密钥，加密您的一切主机与凭据数据。ZenTerm 绝不会上传主密码。'
    : '当前设备没有可用的系统钥匙串记录，需要输入一次主密码后继续。'
  const submitLabel = isSetup ? (busy ? '创建中...' : '创建并进入') : (busy ? '验证中...' : '继续')

  const strength = evaluatePasswordStrength(password)
  const isMismatch = isSetup && confirmPassword.length > 0 && password !== confirmPassword
  const isMatching = isSetup && password.length > 0 && password === confirmPassword

  return (
    <div className="modal-backdrop unlock-modal-backdrop" role="presentation">
      <section
        className="modal-content unlock-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-title"
      >
        {/* 顶部品牌与安全认证徽章 */}
        <div className="unlock-hero-header">
          <div className="unlock-brand-icon-box">
            <ShieldCheck size={28} />
          </div>
          <div className="unlock-hero-titles">
            <div className="unlock-badge-row">
              <span className="unlock-badge-pill">
                <Sparkles size={11} />
                <span>端到端安全加密</span>
              </span>
            </div>
            <h2 id="unlock-title" className="unlock-title-text">{title}</h2>
            <p className="unlock-desc-text">{description}</p>
          </div>
        </div>

        <form className="modal-form-stack unlock-form-stack" onSubmit={onSubmit}>
          {/* 主密码字段 */}
          <div className="unlock-field-group">
            <label className="unlock-label-wrapper">
              <span className="unlock-label-title">主密码</span>
              <div className="unlock-input-container">
                <span className="unlock-input-icon" aria-hidden="true">
                  <KeyRound size={15} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder={isSetup ? '设置高强度主密码' : '请输入主密码'}
                  autoFocus
                  required
                  className="unlock-input-field"
                />
                <button
                  type="button"
                  className="unlock-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏明文' : '显示明文'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            {/* 密码强度指示条 (仅在新建初始化时呈现) */}
            {isSetup && password && (
              <div className="unlock-strength-bar">
                <div className="unlock-strength-track">
                  <div
                    className="unlock-strength-fill"
                    style={{
                      width: `${(strength.score / 4) * 100}%`,
                      backgroundColor: strength.color,
                    }}
                  />
                </div>
                <div className="unlock-strength-text">
                  <span>密码强度：</span>
                  <strong style={{ color: strength.color }}>{strength.label}</strong>
                </div>
              </div>
            )}
          </div>

          {/* 确认主密码字段 */}
          {isSetup && (
            <div className="unlock-field-group">
              <label className="unlock-label-wrapper">
                <span className="unlock-label-title">确认主密码</span>
                <div className="unlock-input-container">
                  <span className="unlock-input-icon" aria-hidden="true">
                    <Lock size={15} />
                  </span>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => onConfirmPasswordChange?.(event.target.value)}
                    placeholder="请再次输入主密码"
                    required
                    className={`unlock-input-field${isMismatch ? ' is-error' : isMatching ? ' is-valid' : ''}`}
                  />
                  <button
                    type="button"
                    className="unlock-eye-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? '隐藏明文' : '显示明文'}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </label>

              {isMismatch && (
                <div className="unlock-match-pill error">
                  <AlertTriangle size={12} />
                  <span>两次输入的密码不一致</span>
                </div>
              )}
              {isMatching && (
                <div className="unlock-match-pill success">
                  <CheckCircle2 size={12} />
                  <span>两次输入的主密码一致</span>
                </div>
              )}
            </div>
          )}

          {/* 风险确认警告条 (以精致的 Apple 风格警告条呈现) */}
          {isSetup && (
            <label className="unlock-risk-card danger-toggle">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(event) => onRiskAcknowledgedChange?.(event.target.checked)}
                className="unlock-risk-checkbox"
              />
              <div className="unlock-risk-copy">
                <strong className="unlock-risk-title">我已了解忘记主密码后无法恢复</strong>
                <small className="unlock-risk-sub">
                  若遗忘主密码，只能重置 Vault，已保存的主机与加密凭据都会被清空。
                </small>
              </div>
            </label>
          )}

          {/* 钥匙串静默无感提示卡片 */}
          <div className="unlock-keychain-note">
            <ShieldCheck size={16} className="unlock-keychain-icon" />
            <div className="unlock-keychain-copy">
              <strong>支持系统钥匙串联动</strong>
              <small>设置完成后，ZenTerm 会自动使用系统安全钥匙串托管，下次启动应用直接无感进入。</small>
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            type="submit"
            className="primary-button wide unlock-submit-btn"
            disabled={busy || (isSetup && (isMismatch || !password))}
          >
            <LockKeyhole size={14} />
            <span>{submitLabel}</span>
          </button>
        </form>
      </section>
    </div>
  )
}
