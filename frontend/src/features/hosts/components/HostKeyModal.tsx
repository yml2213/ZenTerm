import { Fingerprint, ShieldAlert } from 'lucide-react'
import type { HostKeyPrompt } from '@/features/sessions/sessionTypes'

interface HostKeyModalProps {
  prompt: HostKeyPrompt | null
  busy: boolean
  onAccept: () => void
  onReject: () => void
}

export default function HostKeyModal({
  prompt,
  busy,
  onAccept,
  onReject,
}: HostKeyModalProps) {
  if (!prompt) {
    return null
  }

  const isChanged = prompt.reason === 'changed'
  const title = isChanged ? '远端主机指纹已变化' : '首次连接需要确认远端主机指纹'
  const description = isChanged
    ? 'ZenTerm 检测到这台服务器返回了新的主机指纹。请确认这是你预期的服务器变更，避免连接到被冒充的远端。'
    : 'ZenTerm 检测到这台服务器尚未建立信任关系。请核对远端系统提供的指纹，确认无误后再继续连接。'

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

        <h2 id="hostkey-modal-title">{title}</h2>
        <p>{description}</p>

        <div className="hostkey-meta">
          <div>
            <span className="panel-kicker">Host</span>
            <strong>{prompt.hostID}</strong>
            <small>{prompt.remoteAddr}</small>
          </div>
        </div>

        <div className="hostkey-fingerprint">
          {isChanged && prompt.previousSHA256 ? (
            <label>
              <span>旧 SHA256</span>
              <code>{prompt.previousSHA256}</code>
            </label>
          ) : null}
          <label>
            <span>{isChanged ? '新 SHA256' : 'SHA256'}</span>
            <code>{prompt.sha256}</code>
          </label>
          {isChanged && prompt.previousMD5 ? (
            <label>
              <span>旧 MD5</span>
              <code>{prompt.previousMD5}</code>
            </label>
          ) : null}
          <label>
            <span>{isChanged ? '新 MD5' : 'MD5'}</span>
            <code>{prompt.md5}</code>
          </label>
        </div>

        <div className="hostkey-actions">
          <button type="button" className="ghost-button" onClick={onReject} disabled={busy}>
            取消连接
          </button>
          <button type="button" className="primary-button" onClick={onAccept} disabled={busy}>
            {busy ? '写入信任中...' : isChanged ? '替换信任并连接' : '信任并连接'}
          </button>
        </div>
      </section>
    </div>
  )
}
