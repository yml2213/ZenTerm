import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import {
  FileKey2,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  Copy,
  Upload,
  X,
} from 'lucide-react'
import {
  generateCredential,
  importCredential,
  getCredentials,
  getCredentialUsage,
  getCredentialPublicKey,
  importLocalSSHKey,
  listLocalSSHKeys,
  type LocalSSHKey,
  uploadCredentialToHost,
  deleteCredential,
} from '../lib/backend'
import { main, model } from '../wailsjs/wailsjs/go/models'

type Credential = main.Credential
type CredentialUsage = model.CredentialUsage
type Host = main.Host

interface CredentialType {
  id: string
  label: string
  icon: typeof KeyRound
}

interface KeyAlgorithm {
  id: string
  label: string
  bits: number[] | null
}

interface KeySize {
  value: number
  label: string
}

interface GenerateKeyForm {
  label: string
  algorithm: string
  keyBits: number | null
  passphrase: string
}

interface ImportKeyForm {
  label: string
  privateKeyPEM: string
  passphrase: string
}

interface UploadKeyForm {
  hostId: string
  bindAfterUpload: boolean
}

interface ImportLocalKeyForm {
  label: string
  passphrase: string
}

interface KeychainPanelProps {
  vaultUnlocked: boolean
  hosts: Host[]
  onToolbarChange: (toolbar: ReactNode | null) => void
  onHostsChanged?: () => Promise<void> | void
}

const credentialTypes: CredentialType[] = [
  { id: 'ssh_key', label: 'SSH 密钥', icon: KeyRound },
  { id: 'password', label: '密码', icon: ShieldCheck },
  { id: 'certificate', label: '证书', icon: ShieldQuestion },
]

const keyAlgorithms: KeyAlgorithm[] = [
  { id: 'ed25519', label: 'ED25519', bits: null },
  { id: 'rsa', label: 'RSA', bits: [2048, 4096] },
  { id: 'ecdsa', label: 'ECDSA', bits: [256, 384, 521] },
]

const rsaKeySizes: KeySize[] = [
  { value: 2048, label: '2048 位 (推荐)' },
  { value: 4096, label: '4096 位 (高安全)' },
]

const ecdsaCurves: KeySize[] = [
  { value: 256, label: 'P-256 (快速)' },
  { value: 384, label: 'P-384 (推荐)' },
  { value: 521, label: 'P-521 (高安全)' },
]

function createGenerateKeyForm(): GenerateKeyForm {
  return {
    label: '',
    algorithm: 'ed25519',
    keyBits: 2048,
    passphrase: '',
  }
}

function createImportKeyForm(): ImportKeyForm {
  return {
    label: '',
    privateKeyPEM: '',
    passphrase: '',
  }
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return '从未使用'
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function KeychainPanel({
  vaultUnlocked,
  hosts,
  onToolbarChange,
  onHostsChanged,
}: KeychainPanelProps) {
  const [activeType, setActiveType] = useState('ssh_key')
  const [activeDrawer, setActiveDrawer] = useState<'generateKey' | 'importKey' | 'uploadKey' | 'importLocalKey' | null>(null)
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [localKeys, setLocalKeys] = useState<LocalSSHKey[]>([])
  const [loading, setLoading] = useState(vaultUnlocked)
  const [generateForm, setGenerateForm] = useState(createGenerateKeyForm)
  const [importForm, setImportForm] = useState(createImportKeyForm)
  const [importLocalForm, setImportLocalForm] = useState<ImportLocalKeyForm>({ label: '', passphrase: '' })
  const [uploadForm, setUploadForm] = useState<UploadKeyForm>({ hostId: '', bindAfterUpload: true })
  const [selectedCredentialId, setSelectedCredentialId] = useState('')
  const [selectedLocalKey, setSelectedLocalKey] = useState<LocalSSHKey | null>(null)
  const [operationLoading, setOperationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const activeTypeConfig = useMemo(
    () => credentialTypes.find((t) => t.id === activeType) || credentialTypes[0],
    [activeType]
  )

  const filteredCredentials = useMemo(() => {
    if (activeType === 'all') return credentials
    return credentials.filter((cred) => cred.type === activeType)
  }, [credentials, activeType])

  const visibleLocalKeys = activeType === 'ssh_key' ? localKeys : []
  const hasVisibleKeys = filteredCredentials.length > 0 || visibleLocalKeys.length > 0

  const loadCredentials = useCallback(async () => {
    if (!vaultUnlocked) {
      setCredentials([])
      setLocalKeys([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [creds, discoveredKeys] = await Promise.all([
        getCredentials(),
        listLocalSSHKeys(),
      ])
      setCredentials(creds || [])
      setLocalKeys(discoveredKeys || [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [vaultUnlocked])

  useEffect(() => {
    void loadCredentials()
  }, [loadCredentials])

  function openDrawer(drawer: 'generateKey' | 'importKey') {
    setActiveDrawer(drawer)
    setNotice(null)
    if (drawer === 'generateKey') {
      setGenerateForm(createGenerateKeyForm())
    } else if (drawer === 'importKey') {
      setImportForm(createImportKeyForm())
    }
  }

  function openUploadDrawer(credentialId: string) {
    setSelectedCredentialId(credentialId)
    setUploadForm({
      hostId: hosts[0]?.id || '',
      bindAfterUpload: true,
    })
    setActiveDrawer('uploadKey')
    setError(null)
    setNotice(null)
  }

  function openImportLocalDrawer(localKey: LocalSSHKey) {
    setSelectedLocalKey(localKey)
    setImportLocalForm({
      label: localKey.name || '',
      passphrase: '',
    })
    setActiveDrawer('importLocalKey')
    setError(null)
    setNotice(null)
  }

  function closeDrawer() {
    setActiveDrawer(null)
    setError(null)
  }

  const handleTypeChange = useCallback((type: string) => {
    setActiveType(type)
    setActiveDrawer(null)
  }, [])

  function handleGenerateField<K extends keyof GenerateKeyForm>(field: K, value: GenerateKeyForm[K]) {
    setGenerateForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function handleImportField<K extends keyof ImportKeyForm>(field: K, value: ImportKeyForm[K]) {
    setImportForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleGenerateSubmit() {
    if (!generateForm.label.trim()) {
      setError('请输入密钥标签')
      return
    }

    setOperationLoading(true)
    setError(null)
    try {
      await generateCredential(
        generateForm.label,
        generateForm.algorithm,
        generateForm.keyBits || 0,
        generateForm.passphrase
      )
      closeDrawer()
      await loadCredentials()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOperationLoading(false)
    }
  }

  async function handleImportSubmit() {
    if (!importForm.label.trim()) {
      setError('请输入密钥标签')
      return
    }
    if (!importForm.privateKeyPEM.trim()) {
      setError('请输入私钥内容')
      return
    }

    setOperationLoading(true)
    setError(null)
    try {
      await importCredential(
        importForm.label,
        importForm.privateKeyPEM,
        importForm.passphrase
      )
      closeDrawer()
      await loadCredentials()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOperationLoading(false)
    }
  }

  async function handleDeleteCredential(credentialID: string) {
    if (!confirm('确定要删除此凭据吗？删除后无法恢复。')) {
      return
    }

    try {
      const usage: CredentialUsage = await getCredentialUsage(credentialID)
      if (usage.host_ids && usage.host_ids.length > 0) {
        setError('此凭据正在被以下主机使用，无法删除')
        return
      }

      await deleteCredential(credentialID)
      await loadCredentials()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleCopyPublicKey(credentialID: string) {
    try {
      const publicKey = await getCredentialPublicKey(credentialID)
      await navigator.clipboard.writeText(publicKey)
      setNotice('公钥已复制到剪贴板')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleCopyLocalPublicKey(localKey: LocalSSHKey) {
    if (!localKey.public_key) {
      setError('这个本机密钥没有可复制的公钥')
      return
    }

    try {
      await navigator.clipboard.writeText(localKey.public_key)
      setNotice('本机公钥已复制到剪贴板')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleImportLocalSubmit() {
    if (!selectedLocalKey) {
      setError('请选择本机密钥')
      return
    }
    if (!importLocalForm.label.trim()) {
      setError('请输入密钥标签')
      return
    }

    setOperationLoading(true)
    setError(null)
    setNotice(null)
    try {
      await importLocalSSHKey(
        selectedLocalKey.path,
        importLocalForm.label,
        importLocalForm.passphrase,
      )
      setNotice('本机密钥已导入保险箱')
      closeDrawer()
      await loadCredentials()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOperationLoading(false)
    }
  }

  async function handleUploadSubmit() {
    if (!selectedCredentialId) {
      setError('请选择要上传的密钥')
      return
    }
    if (!uploadForm.hostId) {
      setError('请选择目标主机')
      return
    }

    setOperationLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await uploadCredentialToHost(
        uploadForm.hostId,
        selectedCredentialId,
        uploadForm.bindAfterUpload,
      )
      setNotice(result.message || '公钥上传完成')
      closeDrawer()
      await loadCredentials()
      if (result.bound && onHostsChanged) {
        await onHostsChanged()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOperationLoading(false)
    }
  }

  const TypeIcon = activeTypeConfig.icon

  const toolbar = useMemo(
    () => (
      <div className="keychain-toolbar">
        <div className="keychain-sections" role="tablist" aria-label="凭据类型">
          {credentialTypes.map((type) => {
            const Icon = type.icon
            const count = credentials.filter((c) => c.type === type.id).length + (type.id === 'ssh_key' ? localKeys.length : 0)

            return (
              <button
                key={type.id}
                type="button"
                role="tab"
                aria-selected={activeType === type.id}
                className={`keychain-section-tab${activeType === type.id ? ' active' : ''}`}
                onClick={() => handleTypeChange(type.id)}
              >
                <Icon size={15} />
                <span>{type.label}</span>
                <small>{count}</small>
              </button>
            )
          })}
        </div>

        <div className="keychain-toolbar-actions">
          <button
            type="button"
            className="ghost-button compact"
            onClick={loadCredentials}
            disabled={loading || !vaultUnlocked}
          >
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            刷新
          </button>
        </div>
      </div>
    ),
    [activeType, credentials, handleTypeChange, loadCredentials, loading, localKeys.length, vaultUnlocked],
  )

  useLayoutEffect(() => {
    onToolbarChange(toolbar)
    return () => onToolbarChange(null)
  }, [onToolbarChange, toolbar])

  return (
    <section className="keychain-stage">
      <div className={`keychain-workbench${activeDrawer ? ' drawer-open' : ''}`}>
        <div className="keychain-canvas">
          {notice && <div className="success-message">{notice}</div>}
          {loading && !hasVisibleKeys ? (
            <div className="keychain-empty-state">
              <div className="keychain-empty-icon">
                <TypeIcon size={28} />
              </div>
              <div className="keychain-empty-copy">
                <strong>正在读取{activeTypeConfig.label}</strong>
                <p>ZenTerm 正在从保险箱中同步凭据列表。</p>
              </div>
            </div>
          ) : !hasVisibleKeys ? (
            <div className="keychain-empty-state">
              <div className="keychain-empty-icon">
                <TypeIcon size={28} />
              </div>
              <div className="keychain-empty-copy">
                <strong>暂无{activeTypeConfig.label}</strong>
                <p>
                  {activeType === 'ssh_key'
                    ? '导入或生成 SSH 密钥用于安全认证'
                    : activeType === 'password'
                    ? '添加密码凭据用于快速登录'
                    : '管理 SSH 证书和 CA 签发记录'}
                </p>
              </div>

              {activeType === 'ssh_key' && vaultUnlocked && (
                <div className="keychain-empty-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => openDrawer('importKey')}
                  >
                    <Upload size={15} />
                    导入
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openDrawer('generateKey')}
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
          ) : (
            <div className="keychain-list">
              <div className="keychain-list-header">
                <h3>{activeTypeConfig.label}列表</h3>
                {activeType === 'ssh_key' && vaultUnlocked && (
                  <button
                    type="button"
                    className="primary-button compact"
                    onClick={() => openDrawer('generateKey')}
                  >
                    <Plus size={15} />
                    新建
                  </button>
                )}
              </div>

              <div className="keychain-items">
                {filteredCredentials.length > 0 && (
                  <div className="keychain-section-label">保险箱密钥</div>
                )}
                {filteredCredentials.map((cred) => (
                  <div key={cred.id} className="keychain-item">
                    <div className="keychain-item-info">
                      <div className="keychain-item-name">
                        <KeyRound size={16} />
                        <span>{cred.label}</span>
                      </div>
                      <div className="keychain-item-meta">
                        <span className="keychain-item-algorithm">{cred.algorithm}</span>
                        <span className="keychain-item-date">创建于：{formatDate(cred.created_at)}</span>
                        {cred.last_used_at && (
                          <span className="keychain-item-date">
                            最后使用：{formatDate(cred.last_used_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="keychain-item-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => handleCopyPublicKey(cred.id)}
                        title="复制公钥"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => openUploadDrawer(cred.id)}
                        title="上传到主机"
                        disabled={!vaultUnlocked || hosts.length === 0}
                      >
                        <Send size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => handleDeleteCredential(cred.id)}
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {visibleLocalKeys.length > 0 && (
                  <div className="keychain-section-label">本机 ~/.ssh</div>
                )}
                {visibleLocalKeys.map((localKey) => (
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
                        onClick={() => handleCopyLocalPublicKey(localKey)}
                        title="复制本机公钥"
                        disabled={!localKey.public_key}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => openImportLocalDrawer(localKey)}
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
          )}
        </div>
      </div>

      {activeDrawer === 'generateKey' && (
        <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="generate-key-title">
          <div className="keychain-drawer-head">
            <div>
              <h3 id="generate-key-title">生成 SSH 密钥</h3>
              <p>生成新的 SSH 密钥对并安全存储</p>
            </div>
            <button type="button" className="toolbar-icon-btn" aria-label="关闭" onClick={closeDrawer}>
              <X size={16} />
            </button>
          </div>

          <div className="keychain-drawer-body">
            {error && <div className="error-message">{error}</div>}

            <label>
              密钥标签
              <input
                type="text"
                value={generateForm.label}
                onChange={(e) => handleGenerateField('label', e.target.value)}
                placeholder="例如：GitHub、公司服务器"
                disabled={operationLoading}
              />
            </label>

            <div className="keychain-form-block">
              <span>密钥算法</span>
              <div className="keychain-algorithm-group">
                {keyAlgorithms.map((algo) => (
                  <button
                    key={algo.id}
                    type="button"
                    className={`keychain-algorithm-chip${generateForm.algorithm === algo.id ? ' active' : ''}`}
                    onClick={() => {
                      handleGenerateField('algorithm', algo.id)
                      if (algo.id === 'rsa' && !generateForm.keyBits) {
                        handleGenerateField('keyBits', 2048)
                      } else if (algo.id === 'ecdsa' && !generateForm.keyBits) {
                        handleGenerateField('keyBits', 384)
                      } else if (algo.id === 'ed25519') {
                        handleGenerateField('keyBits', null)
                      }
                    }}
                    disabled={operationLoading}
                  >
                    {algo.label}
                  </button>
                ))}
              </div>
            </div>

            {(generateForm.algorithm === 'rsa' || generateForm.algorithm === 'ecdsa') && (
              <div className="keychain-form-block">
                <span>密钥长度</span>
                <div className="keychain-algorithm-group">
                  {(generateForm.algorithm === 'rsa' ? rsaKeySizes : ecdsaCurves).map((size) => (
                    <button
                      key={size.value}
                      type="button"
                      className={`keychain-algorithm-chip${generateForm.keyBits === size.value ? ' active' : ''}`}
                      onClick={() => handleGenerateField('keyBits', size.value)}
                      disabled={operationLoading}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label>
              密码短语（可选，保存于保险箱）
              <input
                type="password"
                value={generateForm.passphrase}
                onChange={(e) => handleGenerateField('passphrase', e.target.value)}
                placeholder="用于加密私钥"
                disabled={operationLoading}
              />
            </label>
          </div>

          <div className="keychain-drawer-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={closeDrawer}
              disabled={operationLoading}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleGenerateSubmit}
              disabled={!generateForm.label.trim() || operationLoading}
            >
              {operationLoading ? '生成中...' : '生成并保存'}
            </button>
          </div>
        </aside>
      )}

      {activeDrawer === 'importKey' && (
        <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="import-key-title">
          <div className="keychain-drawer-head">
            <div>
              <h3 id="import-key-title">导入 SSH 密钥</h3>
              <p>导入现有的 SSH 私钥</p>
            </div>
            <button type="button" className="toolbar-icon-btn" aria-label="关闭" onClick={closeDrawer}>
              <X size={16} />
            </button>
          </div>

          <div className="keychain-drawer-body">
            {error && <div className="error-message">{error}</div>}

            <label>
              密钥标签
              <input
                type="text"
                value={importForm.label}
                onChange={(e) => handleImportField('label', e.target.value)}
                placeholder="例如：GitHub、公司服务器"
                disabled={operationLoading}
              />
            </label>

            <label>
              私钥内容
              <textarea
                value={importForm.privateKeyPEM}
                onChange={(e) => handleImportField('privateKeyPEM', e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                rows={8}
                disabled={operationLoading}
              />
            </label>

            <label>
              密码短语（可选）
              <input
                type="password"
                value={importForm.passphrase}
                onChange={(e) => handleImportField('passphrase', e.target.value)}
                placeholder="如果私钥有密码保护"
                disabled={operationLoading}
              />
            </label>
          </div>

          <div className="keychain-drawer-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={closeDrawer}
              disabled={operationLoading}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleImportSubmit}
              disabled={!importForm.label.trim() || !importForm.privateKeyPEM.trim() || operationLoading}
            >
              {operationLoading ? '导入中...' : '导入并保存'}
            </button>
          </div>
        </aside>
      )}

      {activeDrawer === 'importLocalKey' && selectedLocalKey && (
        <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="import-local-key-title">
          <div className="keychain-drawer-head">
            <div>
              <h3 id="import-local-key-title">导入本机 SSH 密钥</h3>
              <p>从 ~/.ssh 读取私钥并加密保存到保险箱</p>
            </div>
            <button type="button" className="toolbar-icon-btn" aria-label="关闭" onClick={closeDrawer}>
              <X size={16} />
            </button>
          </div>

          <div className="keychain-drawer-body">
            {error && <div className="error-message">{error}</div>}

            <label>
              密钥标签
              <input
                type="text"
                value={importLocalForm.label}
                onChange={(event) => setImportLocalForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="例如：MacBook 本机密钥"
                disabled={operationLoading}
              />
            </label>

            <label>
              本机路径
              <input
                type="text"
                value={selectedLocalKey.path}
                readOnly
              />
            </label>

            <label>
              密码短语（可选）
              <input
                type="password"
                value={importLocalForm.passphrase}
                onChange={(event) => setImportLocalForm((current) => ({ ...current, passphrase: event.target.value }))}
                placeholder={selectedLocalKey.encrypted ? '该私钥已加密，请输入密码短语' : '如果私钥有密码保护'}
                disabled={operationLoading}
              />
            </label>

            <p className="form-hint">
              导入后会生成一条保险箱凭据；后续上传到服务器、绑定主机和连接都会使用保险箱中的加密副本。
            </p>
          </div>

          <div className="keychain-drawer-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={closeDrawer}
              disabled={operationLoading}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleImportLocalSubmit}
              disabled={!importLocalForm.label.trim() || operationLoading}
            >
              {operationLoading ? '导入中...' : '导入保险箱'}
            </button>
          </div>
        </aside>
      )}

      {activeDrawer === 'uploadKey' && (
        <aside className="keychain-drawer" role="dialog" aria-modal="false" aria-labelledby="upload-key-title">
          <div className="keychain-drawer-head">
            <div>
              <h3 id="upload-key-title">上传 SSH 公钥</h3>
              <p>写入远端 authorized_keys，并可自动切换主机认证方式</p>
            </div>
            <button type="button" className="toolbar-icon-btn" aria-label="关闭" onClick={closeDrawer}>
              <X size={16} />
            </button>
          </div>

          <div className="keychain-drawer-body">
            {error && <div className="error-message">{error}</div>}

            <label>
              目标主机
              <select
                value={uploadForm.hostId}
                onChange={(event) => setUploadForm((current) => ({ ...current, hostId: event.target.value }))}
                disabled={operationLoading}
              >
                <option value="">选择主机...</option>
                {hosts.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name || host.id} ({host.username}@{host.address})
                  </option>
                ))}
              </select>
            </label>

            <label className="remember-toggle">
              <input
                type="checkbox"
                checked={uploadForm.bindAfterUpload}
                onChange={(event) => setUploadForm((current) => ({ ...current, bindAfterUpload: event.target.checked }))}
                disabled={operationLoading}
              />
              <span>
                <strong>上传后绑定此凭据</strong>
                <small>成功后主机将改用该密钥登录</small>
              </span>
            </label>

            <p className="form-hint">
              上传会使用目标主机当前保存的认证方式先登录远端，然后追加公钥；不会上传私钥。
            </p>
          </div>

          <div className="keychain-drawer-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={closeDrawer}
              disabled={operationLoading}
            >
              取消
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleUploadSubmit}
              disabled={!uploadForm.hostId || operationLoading}
            >
              {operationLoading ? '上传中...' : '上传公钥'}
            </button>
          </div>
        </aside>
      )}
    </section>
  )
}
