import { AlertTriangle, Database, KeyRound, RotateCcw, Settings2, ShieldCheck } from 'lucide-react'

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

        <section className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon info">
              <Settings2 size={18} />
            </div>
            <div>
              <h2>应用偏好</h2>
              <p>这里开始承接 ZenTerm 的通用设置，后续可继续补主题、终端、启动行为等偏好项。</p>
            </div>
          </div>

          <div className="settings-list">
            <div className="settings-list-row">
              <div>
                <strong>主题与外观</strong>
                <p>当前仍在顶部切换，后续会把默认主题、强调色和界面密度收进这里。</p>
              </div>
              <span className="pill subtle">占位</span>
            </div>
            <div className="settings-list-row">
              <div>
                <strong>终端偏好</strong>
                <p>后续可配置默认字体、光标样式、复制行为和启动 Shell 选项。</p>
              </div>
              <span className="pill subtle">占位</span>
            </div>
            <div className="settings-list-row">
              <div>
                <strong>启动行为</strong>
                <p>预留启动工作区、恢复标签页与窗口策略等基础行为开关。</p>
              </div>
              <span className="pill subtle">占位</span>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon info">
              <Database size={18} />
            </div>
            <div>
              <h2>数据状态</h2>
              <p>把本地配置、凭据存储与同步状态聚合在这里，方便后面继续补导入导出和诊断工具。</p>
            </div>
          </div>

          <div className="settings-list">
            <div className="settings-list-row">
              <div>
                <strong>本地配置</strong>
                <p>后续会补充数据文件位置、配置导出与备份恢复入口。</p>
              </div>
              <span className="pill subtle">计划中</span>
            </div>
            <div className="settings-list-row">
              <div>
                <strong>系统钥匙串</strong>
                <p>预留检测当前平台可用性、重新同步与清理凭据缓存的状态面板。</p>
              </div>
              <span className="pill subtle">计划中</span>
            </div>
          </div>
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
