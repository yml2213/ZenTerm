import { AlertTriangle, KeyRound, RotateCcw, ShieldCheck } from 'lucide-react'
import type { FormEvent } from 'react'
import type { ChangeMasterForm } from '../../types'

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
  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <KeyRound size={18} />
          <div>
            <h3>主密码</h3>
            <p>更新后会重新加密已保存凭据，并刷新系统钥匙串中的记忆密码。</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={onChangePassword}>
          <label>
            当前主密码
            <input
              type="password"
              value={changeForm.currentPassword}
              onChange={(event) => onChangeField('currentPassword', event.target.value)}
              placeholder="请输入当前主密码"
              required
            />
          </label>

          <div className="settings-form-grid">
            <label>
              新主密码
              <input
                type="password"
                value={changeForm.nextPassword}
                onChange={(event) => onChangeField('nextPassword', event.target.value)}
                placeholder="请输入新主密码"
                required
              />
            </label>

            <label>
              确认新主密码
              <input
                type="password"
                value={changeForm.confirmPassword}
                onChange={(event) => onChangeField('confirmPassword', event.target.value)}
                placeholder="请再次输入新主密码"
                required
              />
            </label>
          </div>

          <div className="settings-note-row">
            <ShieldCheck size={16} />
            <span>系统钥匙串会同步更新，后续仍可自动进入。</span>
          </div>

          <div className="settings-actions">
            <button type="submit" className="primary-button" disabled={changeBusy}>
              {changeBusy ? '更新中...' : '更新主密码'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section-panel danger-zone">
        <div className="settings-section-title">
          <RotateCcw size={18} />
          <div>
            <h3>危险区域</h3>
            <p>清空当前 Vault 会删除主机、凭据、信任记录和本机钥匙串中的主密码记录。</p>
          </div>
        </div>

        <div className="settings-danger-copy">
          <AlertTriangle size={16} />
          <span>执行后无法撤销。只有在确实忘记主密码或要彻底清空本地数据时才建议使用。</span>
        </div>

        <label className="remember-toggle danger-toggle">
          <input
            type="checkbox"
            checked={resetConfirmed}
            onChange={(event) => onResetConfirmedChange(event.target.checked)}
          />
          <span>
            <strong>我确认要清空当前 Vault</strong>
            <small>包括主机列表、加密凭据、已知主机记录，以及系统钥匙串中的保存信息。</small>
          </span>
        </label>

        <div className="settings-actions">
          <button type="button" className="primary-button danger" onClick={onResetVault} disabled={resetBusy}>
            {resetBusy ? '重置中...' : '重置 Vault'}
          </button>
        </div>
      </section>
    </div>
  )
}
