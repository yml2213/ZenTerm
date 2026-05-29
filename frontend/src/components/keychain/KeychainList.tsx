import { Copy, FileKey2, KeyRound, Plus, Send, Trash2, Upload } from 'lucide-react'
import type { LocalSSHKey } from '../../lib/backend'
import { main } from '../../wailsjs/wailsjs/go/models'
import { formatKeychainDate } from './keychainConfig'

type Credential = main.Credential

interface KeychainListProps {
  activeType: string
  label: string
  vaultUnlocked: boolean
  hostsCount: number
  credentials: Credential[]
  localKeys: LocalSSHKey[]
  onGenerate: () => void
  onCopyPublicKey: (credentialId: string) => void
  onUploadCredential: (credentialId: string) => void
  onDeleteCredential: (credentialId: string) => void
  onCopyLocalPublicKey: (localKey: LocalSSHKey) => void
  onImportLocalKey: (localKey: LocalSSHKey) => void
}

export default function KeychainList({
  activeType,
  label,
  vaultUnlocked,
  hostsCount,
  credentials,
  localKeys,
  onGenerate,
  onCopyPublicKey,
  onUploadCredential,
  onDeleteCredential,
  onCopyLocalPublicKey,
  onImportLocalKey,
}: KeychainListProps) {
  return (
    <div className="keychain-list">
      <div className="keychain-list-header">
        <h3>{label}列表</h3>
        {activeType === 'ssh_key' && vaultUnlocked && (
          <button
            type="button"
            className="primary-button compact"
            onClick={onGenerate}
          >
            <Plus size={15} />
            新建
          </button>
        )}
      </div>

      <div className="keychain-items">
        {credentials.length > 0 && (
          <div className="keychain-section-label">保险箱密钥</div>
        )}
        {credentials.map((credential) => (
          <div key={credential.id} className="keychain-item">
            <div className="keychain-item-info">
              <div className="keychain-item-name">
                <KeyRound size={16} />
                <span>{credential.label}</span>
              </div>
              <div className="keychain-item-meta">
                <span className="keychain-item-algorithm">{credential.algorithm}</span>
                <span className="keychain-item-date">创建于：{formatKeychainDate(credential.created_at)}</span>
                {credential.last_used_at && (
                  <span className="keychain-item-date">
                    最后使用：{formatKeychainDate(credential.last_used_at)}
                  </span>
                )}
              </div>
            </div>
            <div className="keychain-item-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => onCopyPublicKey(credential.id)}
                title="复制公钥"
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => onUploadCredential(credential.id)}
                title="上传到主机"
                disabled={!vaultUnlocked || hostsCount === 0}
              >
                <Send size={16} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => onDeleteCredential(credential.id)}
                title="删除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {localKeys.length > 0 && (
          <div className="keychain-section-label">本机 ~/.ssh</div>
        )}
        {localKeys.map((localKey) => (
          <div key={localKey.id} className="keychain-item">
            <div className="keychain-item-info">
              <div className="keychain-item-name">
                <FileKey2 size={16} />
                <span>{localKey.name}</span>
              </div>
              <div className="keychain-item-meta">
                <span className="keychain-item-algorithm">{localKey.algorithm || 'ssh-key'}</span>
                {localKey.encrypted && <span className="keychain-item-date">已加密</span>}
                {localKey.imported && <span className="keychain-item-date">已导入保险箱</span>}
                {localKey.fingerprint_sha256 && (
                  <span className="keychain-item-date">{localKey.fingerprint_sha256}</span>
                )}
                <span className="keychain-item-path">{localKey.path}</span>
              </div>
            </div>
            <div className="keychain-item-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => onCopyLocalPublicKey(localKey)}
                title="复制本机公钥"
                disabled={!localKey.public_key}
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => onImportLocalKey(localKey)}
                title={localKey.imported ? '已导入' : '导入保险箱'}
                disabled={!localKey.has_private || localKey.imported}
              >
                <Upload size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
