import { Fingerprint, ShieldAlert } from 'lucide-react'

export default function HostKeyModal({
  prompt,
  busy,
  onAccept,
  onReject,
}) {
  if (!prompt) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="hostkey-modal" role="dialog" aria-modal="true" aria-labelledby="hostkey-modal-title">
        <div className="hostkey-modal-head">
          <span className="pill subtle">
            <Fingerprint size={14} />
            指纹确认
          </span>
          <ShieldAlert size={18} />
        </div>

        <h2 id="hostkey-modal-title">首次连接需要确认远端主机指纹</h2>
        <p>
          ZenTerm 检测到这台服务器尚未建立信任关系。请核对远端系统提供的指纹，
          确认无误后再继续连接。
        </p>

        <div className="hostkey-meta">
          <div>
            <span className="panel-kicker">Host</span>
            <strong>{prompt.hostID}</strong>
            <small>{prompt.remoteAddr}</small>
          </div>
        </div>

        <div className="hostkey-fingerprint">
          <label>
            <span>SHA256</span>
            <code>{prompt.sha256}</code>
          </label>
          <label>
            <span>MD5</span>
            <code>{prompt.md5}</code>
          </label>
        </div>

        <div className="hostkey-actions">
          <button type="button" className="ghost-button" onClick={onReject} disabled={busy}>
            取消连接
          </button>
          <button type="button" className="primary-button" onClick={onAccept} disabled={busy}>
            {busy ? '写入信任中...' : '信任并连接'}
          </button>
        </div>
      </section>
    </div>
  )
}
