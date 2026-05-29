import { Plus, Upload, type LucideIcon } from 'lucide-react'

interface KeychainEmptyStateProps {
  activeType: string
  label: string
  icon: LucideIcon
  loading: boolean
  vaultUnlocked: boolean
  onGenerate: () => void
  onImport: () => void
}

function getEmptyDescription(activeType: string): string {
  if (activeType === 'ssh_key') {
    return '导入或生成 SSH 密钥用于安全认证'
  }

  if (activeType === 'password') {
    return '添加密码凭据用于快速登录'
  }

  return '管理 SSH 证书和 CA 签发记录'
}

export default function KeychainEmptyState({
  activeType,
  label,
  icon: TypeIcon,
  loading,
  vaultUnlocked,
  onGenerate,
  onImport,
}: KeychainEmptyStateProps) {
  if (loading) {
    return (
      <div className="keychain-empty-state">
        <div className="keychain-empty-icon">
          <TypeIcon size={28} />
        </div>
        <div className="keychain-empty-copy">
          <strong>正在读取{label}</strong>
          <p>ZenTerm 正在从保险箱中同步凭据列表。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="keychain-empty-state">
      <div className="keychain-empty-icon">
        <TypeIcon size={28} />
      </div>
      <div className="keychain-empty-copy">
        <strong>暂无{label}</strong>
        <p>{getEmptyDescription(activeType)}</p>
      </div>

      {activeType === 'ssh_key' && vaultUnlocked && (
        <div className="keychain-empty-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={onImport}
          >
            <Upload size={15} />
            导入
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onGenerate}
          >
            <Plus size={15} />
            生成
          </button>
        </div>
      )}

      {activeType === 'ssh_key' && !vaultUnlocked && (
        <div className="keychain-empty-actions">
          <p style={{ color: 'var(--error-text)', fontSize: '0.9rem' }}>
            请先解锁保险箱
          </p>
        </div>
      )}
    </div>
  )
}
