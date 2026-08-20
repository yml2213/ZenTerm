import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, Lock, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface SecretModalProps {
  isOpen: boolean
  title: string
  label: string
  secret: string
  secretType?: 'password' | 'private_key' | 'text'
  onClose: () => void
}

export default function SecretModal({
  isOpen,
  title,
  label,
  secret,
  secretType = 'text',
  onClose,
}: SecretModalProps) {
  const [revealed, setRevealed] = useState(secretType === 'private_key')
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const isMultiline = secret.includes('\n') || secretType === 'private_key'

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content secret-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <div className="modal-icon-badge">
              <Lock size={18} />
            </div>
            <div>
              <h3>{title}</h3>
              <p className="modal-subtitle">{label}</p>
            </div>
          </div>
          <button type="button" className="icon-button modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="secret-display-card">
            <div className="secret-card-header">
              <span className="secret-type-badge">
                {secretType === 'private_key' ? 'OpenSSH 私钥' : secretType === 'password' ? '主机密码' : '敏感信息'}
              </span>
              <div className="secret-actions">
                <button
                  type="button"
                  className="ghost-button compact"
                  onClick={() => setRevealed(!revealed)}
                  title={revealed ? '隐藏明文' : '查看明文'}
                >
                  {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{revealed ? '隐藏' : '显示'}</span>
                </button>
                <button
                  type="button"
                  className="primary-button compact"
                  onClick={handleCopy}
                  title="复制到剪贴板"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
              </div>
            </div>

            <div className="secret-content-container">
              {isMultiline ? (
                <pre className={`secret-pre ${!revealed ? 'masked' : ''}`}>
                  {revealed ? secret : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                </pre>
              ) : (
                <div className="secret-single-line">
                  <span className={`secret-text ${!revealed ? 'masked' : ''}`}>
                    {revealed ? secret || '(未保存密码)' : '••••••••••••••••'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <p className="secret-security-hint">
            🔒 此敏感信息已通过 AES-256-GCM 安全加密存储，仅在保险箱解锁后临时加载于内存。请妥善保管。
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
