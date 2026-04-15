import { AlertTriangle, KeyRound, RotateCcw, ShieldCheck } from 'lucide-react'

export default function VaultSettingsPanel({
  vaultUnlocked,
  changeForm,
  changeBusy,
  resetConfirmed,
  resetBusy,
  onChangeField,
  onChangePassword,
  onResetConfirmedChange,
  onResetVault,
}) {
  return (
    <section className="settings-stage panel">
      <div className="settings-hero">
        <div>
          <span className="panel-kicker">Security</span>
          <h1>保险箱设置</h1>
          <p>主密码用于保护本地保存的 SSH 凭据。ZenTerm 会默认交给系统钥匙串保管，日常不再需要手动进入。</p>
        </div>
        <span className={`pill ${vaultUnlocked ? 'success' : 'subtle'}`}>
          <ShieldCheck size={14} />
          {vaultUnlocked ? '主密码已就绪' : '等待主密码'}
        </span>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon success">
              <KeyRound size={18} />
            </div>
            <div>
              <h2>修改主密码</h2>
              <p>更新后会重新加密所有已保存凭据，并可同步刷新系统钥匙串中的记忆密码。</p>
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

            <div className="remember-toggle info-toggle">
              <span>
                <strong>系统钥匙串会同步更新</strong>
                <small>修改主密码后，ZenTerm 会同时刷新系统钥匙串中的保存内容，后续继续自动进入。</small>
              </span>
            </div>

            <div className="settings-actions">
              <button type="submit" className="primary-button" disabled={changeBusy}>
                {changeBusy ? '更新中...' : '更新主密码'}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card danger">
          <div className="settings-card-head">
            <div className="settings-card-icon danger">
              <RotateCcw size={18} />
            </div>
            <div>
              <h2>重置 Vault</h2>
              <p>这会删除所有已保存主机、凭据和信任记录，并清除本机钥匙串中的主密码记录。</p>
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
    </section>
  )
}
