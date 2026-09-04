import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { ChangeMasterForm } from '../vaultTypes'
import { SettingsGroup } from '../components/SettingsComponents'

interface SecuritySectionProps {
  changeForm: ChangeMasterForm
  changeBusy: boolean
  resetConfirmed: boolean
  resetBusy: boolean
  onChangeField: (field: keyof ChangeMasterForm, value: string) => void
  onChangePassword: (event: FormEvent) => void
  onResetConfirmedChange: (value: boolean) => void
  onResetVault: () => void
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

  if (score <= 1) return { score: 1, label: '弱 (建议增加长度与字符多样性)', color: '#ef4444' }
  if (score === 2) return { score: 2, label: '一般 (良好但可更复杂)', color: '#f59e0b' }
  if (score === 3) return { score: 3, label: '强 (高强度密码)', color: '#3b82f6' }
  return { score: 4, label: '极佳 (抵御穷举攻击)', color: '#10b981' }
}

export default function SecuritySection({
  changeForm,
  changeBusy,
  resetConfirmed,
  resetBusy,
  onChangeField,
  onChangePassword,
  onResetConfirmedChange,
  onResetVault,
}: SecuritySectionProps) {
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const strength = evaluatePasswordStrength(changeForm.nextPassword)

  const isPasswordMatching =
    Boolean(changeForm.nextPassword) &&
    changeForm.nextPassword === changeForm.confirmPassword
  const isMismatch =
    Boolean(changeForm.confirmPassword) &&
    changeForm.nextPassword !== changeForm.confirmPassword

  return (
    <div className="settings-section-stack">
      {/* 顶部安全防护架构概览 */}
      <div className="security-hero-panel">
        <div className="security-hero-top">
          <div className="security-hero-shield-box">
            <ShieldCheck size={28} />
          </div>
          <div className="security-hero-title-group">
            <div className="security-hero-badge-line">
              <span className="security-status-pill">
                <span className="security-status-dot-pulse" />
                保险箱加密已启用
              </span>
              <span className="security-type-tag">Argon2id + AES-256-GCM</span>
            </div>
            <h3>本地安全防护中心</h3>
            <p>
              所有主机凭据、Known Hosts 记录与会话配置均在本地经 Argon2id 推导派生密钥，并以 AES-256-GCM 硬件加速加密，密码绝不上云。
            </p>
          </div>
        </div>

        <div className="security-specs-grid">
          <div className="security-spec-card">
            <div className="security-spec-icon-box cyan">
              <Cpu size={15} />
            </div>
            <div>
              <span className="spec-label">密钥派生算法</span>
              <strong className="spec-val">Argon2id</strong>
              <small className="spec-sub">抗 GPU/ASIC 碰撞穷举</small>
            </div>
          </div>

          <div className="security-spec-card">
            <div className="security-spec-icon-box emerald">
              <Lock size={15} />
            </div>
            <div>
              <span className="spec-label">对称加密标准</span>
              <strong className="spec-val">AES-256-GCM</strong>
              <small className="spec-sub">带认证防篡改校验</small>
            </div>
          </div>

          <div className="security-spec-card">
            <div className="security-spec-icon-box purple">
              <KeyRound size={15} />
            </div>
            <div>
              <span className="spec-label">操作系统集成</span>
              <strong className="spec-val">macOS Keychain</strong>
              <small className="spec-sub">系统钥匙串安全隔离</small>
            </div>
          </div>
        </div>
      </div>

      {/* 修改主密码 */}
      <SettingsGroup
        title="修改主密码 (Master Password)"
        description="更新后系统将使用新密码派生出的新主密钥重新加密本地全部凭据，并同步更新本机钥匙串。"
      >
        <form className="settings-form security-form-refined" onSubmit={onChangePassword}>
          {/* 当前主密码 */}
          <div className="settings-form-field">
            <label className="settings-field-label">
              当前主密码
              <div className="security-input-container">
                <span className="security-input-prefix-icon" aria-hidden="true">
                  <KeyRound size={15} />
                </span>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={changeForm.currentPassword}
                  onChange={(event) => onChangeField('currentPassword', event.target.value)}
                  placeholder="请输入当前正在使用的主密码"
                  className="settings-input security-input-padded"
                  required
                />
                <button
                  type="button"
                  className="security-input-suffix-btn"
                  onClick={() => setShowCurrent(!showCurrent)}
                  aria-label={showCurrent ? '隐藏密码' : '显示密码'}
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
          </div>

          {/* 新主密码与确认新主密码 */}
          <div className="settings-form-grid">
            <div className="settings-form-field">
              <label className="settings-field-label">
                新主密码
                <div className="security-input-container">
                  <span className="security-input-prefix-icon" aria-hidden="true">
                    <Lock size={15} />
                  </span>
                  <input
                    type={showNext ? 'text' : 'password'}
                    value={changeForm.nextPassword}
                    onChange={(event) => onChangeField('nextPassword', event.target.value)}
                    placeholder="请输入新的主密码（建议 8 位以上）"
                    className="settings-input security-input-padded"
                    required
                  />
                  <button
                    type="button"
                    className="security-input-suffix-btn"
                    onClick={() => setShowNext(!showNext)}
                    aria-label={showNext ? '隐藏密码' : '显示密码'}
                    tabIndex={-1}
                  >
                    {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              {/* 密码强度指示器 */}
              {changeForm.nextPassword && (
                <div className="pwd-strength-container">
                  <div className="pwd-strength-bar-track">
                    <div
                      className="pwd-strength-bar-fill"
                      style={{
                        width: `${(strength.score / 4) * 100}%`,
                        backgroundColor: strength.color,
                      }}
                    />
                  </div>
                  <div className="pwd-strength-meta">
                    <span className="pwd-strength-label">密码强度：</span>
                    <strong style={{ color: strength.color }}>{strength.label}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="settings-form-field">
              <label className="settings-field-label">
                确认新主密码
                <div className="security-input-container">
                  <span className="security-input-prefix-icon" aria-hidden="true">
                    <ShieldCheck size={15} />
                  </span>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={changeForm.confirmPassword}
                    onChange={(event) => onChangeField('confirmPassword', event.target.value)}
                    placeholder="请再次输入新主密码"
                    className={`settings-input security-input-padded${
                      isMismatch ? ' is-error' : isPasswordMatching ? ' is-valid' : ''
                    }`}
                    required
                  />
                  <button
                    type="button"
                    className="security-input-suffix-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? '隐藏密码' : '显示密码'}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              {/* 匹配提示反馈 */}
              {isMismatch && (
                <div className="pwd-match-pill error">
                  <AlertTriangle size={13} />
                  <span>两次输入的新密码不一致</span>
                </div>
              )}
              {isPasswordMatching && (
                <div className="pwd-match-pill success">
                  <CheckCircle2 size={13} />
                  <span>两次新密码一致</span>
                </div>
              )}
            </div>
          </div>

          {/* 钥匙串同步机制提示卡片 */}
          <div className="security-keychain-tip-card">
            <div className="security-keychain-icon-wrap">
              <ShieldCheck size={16} />
            </div>
            <div className="security-keychain-copy">
              <strong>系统级安全钥匙串已联动</strong>
              <span>macOS 钥匙串（Keychain）会自动同步保存更新后的密码，下次启动可自动无感解锁。</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="settings-form-submit-row">
            <button
              type="submit"
              className="primary-button security-submit-btn"
              disabled={changeBusy || isMismatch || !changeForm.nextPassword}
            >
              <Lock size={14} />
              <span>{changeBusy ? '正在更新加密凭据…' : '更新主密码'}</span>
            </button>
          </div>
        </form>
      </SettingsGroup>

      {/* 危险重置区 (Danger Zone - 极简高警示 Apple/GitHub 设计) */}
      <div className="security-danger-zone-card">
        <div className="security-danger-zone-header">
          <div className="security-danger-badge-icon">
            <ShieldAlert size={18} />
          </div>
          <div className="security-danger-zone-titles">
            <div className="security-danger-title-row">
              <h3>危险区域 (Danger Zone)</h3>
              <span className="danger-tag-pill">不可逆操作</span>
            </div>
            <p>清空当前 Vault 会彻底删除本地存储的所有主机配置、加密凭据、Known Hosts 信任记录以及系统钥匙串项。</p>
          </div>
        </div>

        <div className="security-danger-zone-body">
          <div className="security-danger-bullet-box">
            <div className="danger-bullet-item">
              <span className="bullet-dot red" />
              <span>清空本地全部已保存的 SSH 主机配置列表及自定义分组</span>
            </div>
            <div className="danger-bullet-item">
              <span className="bullet-dot red" />
              <span>清除本地所有已加密的私钥密钥对与密码凭据</span>
            </div>
            <div className="danger-bullet-item">
              <span className="bullet-dot red" />
              <span>移除本地 Known Hosts 指纹记录与系统钥匙串无感免密记录</span>
            </div>
          </div>

          <label className="security-danger-agreement-row">
            <input
              type="checkbox"
              checked={resetConfirmed}
              onChange={(event) => onResetConfirmedChange(event.target.checked)}
              className="security-danger-checkbox"
            />
            <div className="security-danger-agreement-copy">
              <strong className="danger-agreement-headline">我确认要清空当前 Vault</strong>
              <span className="danger-agreement-sub">
                包括主机列表、加密凭据、已知主机记录，以及系统钥匙串中的保存信息。操作后不可撤销，请确保已事先导出备份。
              </span>
            </div>
          </label>

          <div className="security-danger-footer-row">
            <button
              type="button"
              className="primary-button danger security-danger-btn"
              onClick={onResetVault}
              disabled={resetBusy || !resetConfirmed}
            >
              <RotateCcw size={14} className={resetBusy ? 'spin' : ''} />
              <span>{resetBusy ? '正在清空重置 Vault…' : '重置 Vault'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

