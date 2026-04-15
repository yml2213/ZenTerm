import { useMemo, useState } from 'react'
import {
  FolderLock,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldQuestion,
  Upload,
  UserRound,
  X,
} from 'lucide-react'

const sections = [
  { id: 'keys', label: '密钥', count: 0, icon: KeyRound },
  { id: 'certificates', label: '证书', count: 0, icon: ShieldCheck },
  { id: 'identities', label: '登录身份', count: 0, icon: UserRound },
]

const keyAlgorithms = [
  { id: 'ed25519', label: 'ED25519' },
  { id: 'ecdsa', label: 'ECDSA' },
  { id: 'rsa', label: 'RSA' },
]

function buildStatusPill(status, loading) {
  if (loading) {
    return {
      tone: 'subtle',
      icon: RefreshCw,
      label: '检测中',
    }
  }

  if (!status) {
    return {
      tone: 'subtle',
      icon: ShieldQuestion,
      label: '等待检测',
    }
  }

  if (!status.supported) {
    return {
      tone: 'subtle',
      icon: ShieldQuestion,
      label: '当前不可用',
    }
  }

  if (status.saved) {
    return {
      tone: 'success',
      icon: ShieldCheck,
      label: '已保存主密码',
    }
  }

  return {
    tone: 'subtle',
    icon: KeyRound,
    label: '未保存主密码',
  }
}

function createGenerateKeyForm() {
  return {
    label: '',
    algorithm: 'ed25519',
    passphrase: '',
    rememberPassphrase: false,
  }
}

function buildSectionCopy(sectionID) {
  switch (sectionID) {
    case 'certificates':
      return {
        title: '整理 SSH 证书',
        description: '这里会承接 OpenSSH 证书、CA 签发记录和后续的证书分发能力。',
        primaryLabel: '导入证书',
      }
    case 'identities':
      return {
        title: '创建登录身份',
        description: '把用户名、密钥、证书和后续认证参数组合成一套可复用的登录身份。',
        primaryLabel: '新建身份',
      }
    default:
      return {
        title: '设置密钥',
        description: '导入或生成 SSH 密钥用于安全认证。',
        primaryLabel: '生成',
      }
  }
}

export default function KeychainPanel({
  status,
  loading,
  vaultInitialized,
  vaultUnlocked,
  hostCount,
  onRefresh,
}) {
  const [activeSection, setActiveSection] = useState('keys')
  const [activeDrawer, setActiveDrawer] = useState(null)
  const [generateKeyForm, setGenerateKeyForm] = useState(createGenerateKeyForm)

  const section = sections.find((item) => item.id === activeSection) || sections[0]
  const sectionCopy = buildSectionCopy(activeSection)
  const pill = buildStatusPill(status, loading)
  const PillIcon = pill.icon
  const SectionIcon = useMemo(() => section.icon, [section.icon])

  function openDrawer(drawer) {
    setActiveDrawer(drawer)
  }

  function closeDrawer() {
    setActiveDrawer(null)
  }

  function handleSectionChange(nextSection) {
    setActiveSection(nextSection)
    setActiveDrawer(null)
  }

  function handleGenerateField(field, value) {
    setGenerateKeyForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  return (
    <section className="keychain-stage panel">
      <div className="keychain-toolbar">
        <div className="keychain-sections" role="tablist" aria-label="钥匙串分类">
          {sections.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeSection === item.id}
                className={`keychain-section-tab${activeSection === item.id ? ' active' : ''}`}
                onClick={() => handleSectionChange(item.id)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                <small>{item.count}</small>
              </button>
            )
          })}
        </div>

        <div className="keychain-toolbar-actions">
          <span className={`pill ${pill.tone}`}>
            <PillIcon size={14} className={loading ? 'spin' : undefined} />
            {pill.label}
          </span>
          <button type="button" className="ghost-button compact" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            刷新
          </button>
        </div>
      </div>

      <div className={`keychain-workbench${activeDrawer ? ' drawer-open' : ''}`}>
        <div className="keychain-canvas">
          <div className="keychain-canvas-head">
            <h2>{section.label}</h2>
            <span>{section.count} 项</span>
          </div>

          <div className="keychain-empty-state">
            <div className="keychain-empty-icon">
              <SectionIcon size={28} />
            </div>
            <div className="keychain-empty-copy">
              <strong>{sectionCopy.title}</strong>
              <p>{sectionCopy.description}</p>
            </div>

            <div className="keychain-empty-actions">
              {activeSection === 'keys' ? (
                <>
                  <button type="button" className="ghost-button" onClick={() => openDrawer('importKey')}>
                    <Upload size={15} />
                    导入
                  </button>
                  <button type="button" className="primary-button" onClick={() => openDrawer('generateKey')}>
                    <KeyRound size={15} />
                    生成
                  </button>
                </>
              ) : (
                <button type="button" className="ghost-button" disabled>
                  <SectionIcon size={15} />
                  {sectionCopy.primaryLabel}
                </button>
              )}
            </div>
          </div>

          <div className="keychain-status-strip">
            <div className="keychain-status-card">
              <span>系统钥匙串</span>
              <strong>{status?.provider || '检测中'}</strong>
              <small>{status?.message || '正在同步当前设备状态。'}</small>
            </div>
            <div className="keychain-status-card">
              <span>Vault 状态</span>
              <strong>{vaultInitialized ? (vaultUnlocked ? '已初始化并就绪' : '已初始化，待输入主密码') : '尚未初始化'}</strong>
              <small>{hostCount} 台主机已纳入当前保险箱。</small>
            </div>
            <div className="keychain-status-card">
              <span>当前策略</span>
              <strong>主密码只负责加密</strong>
              <small>日常进入优先交给系统钥匙串，只有缺失或不可用时才手动输入。</small>
            </div>
          </div>
        </div>

        {activeDrawer === 'generateKey' ? (
          <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="generate-key-title">
            <div className="keychain-drawer-head">
              <div>
                <h3 id="generate-key-title">生成密钥</h3>
                <p>先完成界面骨架，后续再接真实的密钥生成与保存流程。</p>
              </div>
              <button type="button" className="toolbar-icon-btn" aria-label="关闭生成密钥" onClick={closeDrawer}>
                <X size={16} />
              </button>
            </div>

            <div className="keychain-drawer-body">
              <label>
                Label
                <input
                  type="text"
                  value={generateKeyForm.label}
                  onChange={(event) => handleGenerateField('label', event.target.value)}
                  placeholder="密钥 Label"
                />
              </label>

              <div className="keychain-form-block">
                <span>密钥类型</span>
                <div className="keychain-algorithm-group">
                  {keyAlgorithms.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`keychain-algorithm-chip${generateKeyForm.algorithm === item.id ? ' active' : ''}`}
                      onClick={() => handleGenerateField('algorithm', item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                密码短语
                <input
                  type="password"
                  value={generateKeyForm.passphrase}
                  onChange={(event) => handleGenerateField('passphrase', event.target.value)}
                  placeholder="Passphrase（可选）"
                />
              </label>

              <label className="remember-toggle">
                <input
                  type="checkbox"
                  checked={generateKeyForm.rememberPassphrase}
                  onChange={(event) => handleGenerateField('rememberPassphrase', event.target.checked)}
                />
                <span>
                  <strong>保存 Passphrase</strong>
                  <small>后续会接到系统钥匙串或安全存储，当前先保留交互入口。</small>
                </span>
              </label>
            </div>

            <div className="keychain-drawer-actions">
              <button
                type="button"
                className="primary-button keychain-submit"
                disabled={!generateKeyForm.label.trim()}
              >
                生成并保存
              </button>
            </div>
          </aside>
        ) : null}

        {activeDrawer === 'importKey' ? (
          <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="import-key-title">
            <div className="keychain-drawer-head">
              <div>
                <h3 id="import-key-title">导入密钥</h3>
                <p>导入流程下一步会接入本地文件、粘贴私钥和密码短语校验。</p>
              </div>
              <button type="button" className="toolbar-icon-btn" aria-label="关闭导入密钥" onClick={closeDrawer}>
                <X size={16} />
              </button>
            </div>

            <div className="keychain-drawer-body">
              <label>
                Label
                <input type="text" placeholder="导入后的显示名称" />
              </label>

              <label>
                私钥内容
                <textarea placeholder="粘贴 OpenSSH 私钥，或后续从本地文件导入。" />
              </label>

              <label>
                密码短语
                <input type="password" placeholder="如果私钥有密码短语，可在这里输入" />
              </label>
            </div>

            <div className="keychain-drawer-actions">
              <button type="button" className="primary-button keychain-submit">
                导入并保存
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  )
}
