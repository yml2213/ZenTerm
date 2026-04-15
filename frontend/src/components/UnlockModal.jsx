import { LockKeyhole, ShieldEllipsis } from 'lucide-react'

export default function UnlockModal({
  open,
  password,
  busy,
  onPasswordChange,
  onSubmit,
}) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-content modal-narrow" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
        <div className="modal-eyebrow">
          <span className="pill subtle">
            <ShieldEllipsis size={14} />
            本地保险箱
          </span>
        </div>
        <h2 id="unlock-title">输入主密码以解锁本地保险箱</h2>
        <p>主机列表可以直接查看，但保存、编辑和连接都需要先解锁加密凭据。</p>

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

          <button type="submit" className="primary-button wide" disabled={busy}>
            <LockKeyhole size={14} />
            {busy ? '解锁中...' : '解锁并继续'}
          </button>
        </form>
      </section>
    </div>
  )
}
