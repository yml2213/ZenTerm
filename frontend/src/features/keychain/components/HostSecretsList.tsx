import { useState, useMemo, useEffect } from 'react'
import { Check, Copy, Eye, EyeOff, FileKey2, KeyRound, Lock, Search, Server, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cmd } from '@/lib/backendModels'
import { getHostSecret } from '@/lib/backend'
import SecretModal from './SecretModal'

type Host = cmd.Host

interface HostSecretsListProps {
  hosts: Host[]
  vaultUnlocked: boolean
  credentials: cmd.Credential[]
}

interface LoadedSecret {
  password?: string
  privateKey?: string
  credentialId?: string
  loading?: boolean
  revealed?: boolean
  error?: string
}

export default function HostSecretsList({
  hosts,
  vaultUnlocked,
  credentials,
}: HostSecretsListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [secrets, setSecrets] = useState<Record<string, LoadedSecret>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [modalSecret, setModalSecret] = useState<{
    isOpen: boolean
    title: string
    label: string
    secret: string
    type: 'password' | 'private_key'
  } | null>(null)

  // 当进入页面且已解锁时，自动异步预加载各主机的凭据类型信息
  useEffect(() => {
    if (!vaultUnlocked) return

    let cancelled = false
    hosts.forEach((host) => {
      if (secrets[host.id]) return

      getHostSecret(host.id)
        .then((sec) => {
          if (cancelled) return
          setSecrets((prev) => ({
            ...prev,
            [host.id]: {
              password: sec.password,
              privateKey: sec.private_key,
              credentialId: sec.credential_id || host.credential_id,
              loading: false,
              revealed: false,
            },
          }))
        })
        .catch((err) => {
          if (cancelled) return
          setSecrets((prev) => ({
            ...prev,
            [host.id]: {
              error: String(err),
              loading: false,
            },
          }))
        })
    })

    return () => {
      cancelled = true
    }
  }, [hosts, vaultUnlocked, secrets])

  const filteredHosts = useMemo(() => {
    if (!searchTerm.trim()) return hosts
    const term = searchTerm.toLowerCase()
    return hosts.filter(
      (h) =>
        h.name?.toLowerCase().includes(term) ||
        h.address?.toLowerCase().includes(term) ||
        h.username?.toLowerCase().includes(term) ||
        h.group?.toLowerCase().includes(term)
    )
  }, [hosts, searchTerm])

  const handleToggleReveal = (hostId: string) => {
    setSecrets((prev) => ({
      ...prev,
      [hostId]: {
        ...prev[hostId],
        revealed: !prev[hostId]?.revealed,
      },
    }))
  }

  const handleCopyPassword = async (hostId: string, password?: string) => {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
      setCopiedId(hostId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // ignore
    }
  }

  const handleViewPrivateKey = (host: Host, privateKey?: string) => {
    if (!privateKey) return
    setModalSecret({
      isOpen: true,
      title: `主机私钥 - ${host.name || host.address}`,
      label: `${host.username}@${host.address}:${host.port}`,
      secret: privateKey,
      type: 'private_key',
    })
  }

  return (
    <div className="host-secrets-container">
      <div className="host-secrets-header">
        <div className="host-secrets-title-area">
          <div className="host-secrets-badge-icon">
            <Lock size={18} />
          </div>
          <div>
            <h3>主机密码与私钥</h3>
            <p className="host-secrets-desc">查看和管理已保存于安全金库中的主机登录密码与认证私钥</p>
          </div>
        </div>

        <div className="host-secrets-search-bar">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="搜索主机名称、IP、用户名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {!vaultUnlocked ? (
        <div className="keychain-locked-banner">
          <ShieldAlert size={20} />
          <span>保险箱已锁定，请先解锁保险箱以查看主机密码与密钥。</span>
        </div>
      ) : filteredHosts.length === 0 ? (
        <div className="keychain-empty-state">
          <Server size={32} />
          <p>{searchTerm ? '未找到匹配的主机' : '暂无已配置的主机'}</p>
        </div>
      ) : (
        <div className="host-secrets-grid">
          {filteredHosts.map((host) => {
            const sec = secrets[host.id]
            const boundCred = credentials.find((c) => c.id === (sec?.credentialId || host.credential_id))
            const hasPassword = Boolean(sec?.password)
            const hasPrivateKey = Boolean(sec?.privateKey)
            const hasCred = Boolean(boundCred)

            return (
              <div key={host.id} className="host-secret-card">
                <div className="host-secret-card-top">
                  <div className="host-secret-info">
                    <div className="host-secret-name">
                      <Server size={16} className="host-icon" />
                      <strong>{host.name || host.address}</strong>
                      {host.group && <span className="host-group-tag">{host.group}</span>}
                    </div>
                    <div className="host-secret-meta">
                      <code>{host.username}@{host.address}:{host.port}</code>
                    </div>
                  </div>

                  <div className="host-auth-type-pill">
                    {hasCred ? (
                      <span className="auth-pill cred" title="关联凭据中心">
                        <KeyRound size={12} />
                        {boundCred?.label}
                      </span>
                    ) : hasPrivateKey ? (
                      <span className="auth-pill key" title="独立 OpenSSH 私钥">
                        <FileKey2 size={12} />
                        私钥认证
                      </span>
                    ) : hasPassword ? (
                      <span className="auth-pill pass" title="密码认证">
                        <ShieldCheck size={12} />
                        密码认证
                      </span>
                    ) : (
                      <span className="auth-pill none">
                        未保存认证
                      </span>
                    )}
                  </div>
                </div>

                <div className="host-secret-card-body">
                  {hasPassword && (
                    <div className="secret-row">
                      <span className="secret-label">主机密码：</span>
                      <div className="secret-value-box">
                        <span className={`secret-val ${sec?.revealed ? 'visible' : 'masked'}`}>
                          {sec?.revealed ? sec.password : '••••••••••••'}
                        </span>
                        <button
                          type="button"
                          className="icon-button compact"
                          onClick={() => handleToggleReveal(host.id)}
                          title={sec?.revealed ? '隐藏密码' : '显示明文'}
                        >
                          {sec?.revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          type="button"
                          className="icon-button compact"
                          onClick={() => handleCopyPassword(host.id, sec?.password)}
                          title="复制密码"
                        >
                          {copiedId === host.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {hasPrivateKey && (
                    <div className="secret-row">
                      <span className="secret-label">独立私钥：</span>
                      <div className="secret-value-box">
                        <span className="secret-val note">已加密保存 (PEM 格式)</span>
                        <button
                          type="button"
                          className="ghost-button compact"
                          onClick={() => handleViewPrivateKey(host, sec?.privateKey)}
                          title="查看并复制完整私钥"
                        >
                          <FileKey2 size={14} />
                          <span>查看私钥</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {hasCred && (
                    <div className="secret-row">
                      <span className="secret-label">关联凭据：</span>
                      <div className="secret-value-box">
                        <span className="secret-val note">
                          {boundCred?.label} ({boundCred?.algorithm})
                        </span>
                      </div>
                    </div>
                  )}

                  {!hasPassword && !hasPrivateKey && !hasCred && (
                    <div className="secret-row">
                      <span className="secret-val empty">连接时将交互式提示输入认证</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalSecret && (
        <SecretModal
          isOpen={modalSecret.isOpen}
          title={modalSecret.title}
          label={modalSecret.label}
          secret={modalSecret.secret}
          secretType={modalSecret.type}
          onClose={() => setModalSecret(null)}
        />
      )}
    </div>
  )
}
