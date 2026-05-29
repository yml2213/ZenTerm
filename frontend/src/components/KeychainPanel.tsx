import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import {
  RefreshCw,
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
import GenerateKeyDrawer from './keychain/GenerateKeyDrawer'
import ImportKeyDrawer from './keychain/ImportKeyDrawer'
import ImportLocalKeyDrawer from './keychain/ImportLocalKeyDrawer'
import KeychainEmptyState from './keychain/KeychainEmptyState'
import KeychainList from './keychain/KeychainList'
import UploadKeyDrawer from './keychain/UploadKeyDrawer'
import {
  createGenerateKeyForm,
  createImportKeyForm,
  credentialTypes,
  type GenerateKeyForm,
  type ImportKeyForm,
  type ImportLocalKeyForm,
  type UploadKeyForm,
} from './keychain/keychainConfig'

type Credential = main.Credential
type CredentialUsage = model.CredentialUsage
type Host = main.Host

interface KeychainPanelProps {
  vaultUnlocked: boolean
  hosts: Host[]
  onToolbarChange: (toolbar: ReactNode | null) => void
  onHostsChanged?: () => Promise<void> | void
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
          {!hasVisibleKeys ? (
            <KeychainEmptyState
              activeType={activeType}
              label={activeTypeConfig.label}
              icon={activeTypeConfig.icon}
              loading={loading}
              vaultUnlocked={vaultUnlocked}
              onGenerate={() => openDrawer('generateKey')}
              onImport={() => openDrawer('importKey')}
            />
          ) : (
            <KeychainList
              activeType={activeType}
              label={activeTypeConfig.label}
              vaultUnlocked={vaultUnlocked}
              hostsCount={hosts.length}
              credentials={filteredCredentials}
              localKeys={visibleLocalKeys}
              onGenerate={() => openDrawer('generateKey')}
              onCopyPublicKey={handleCopyPublicKey}
              onUploadCredential={openUploadDrawer}
              onDeleteCredential={handleDeleteCredential}
              onCopyLocalPublicKey={handleCopyLocalPublicKey}
              onImportLocalKey={openImportLocalDrawer}
            />
          )}
        </div>
      </div>

      {activeDrawer === 'generateKey' && (
        <GenerateKeyDrawer
          form={generateForm}
          error={error}
          operationLoading={operationLoading}
          onClose={closeDrawer}
          onSubmit={handleGenerateSubmit}
          onFieldChange={handleGenerateField}
        />
      )}

      {activeDrawer === 'importKey' && (
        <ImportKeyDrawer
          form={importForm}
          error={error}
          operationLoading={operationLoading}
          onClose={closeDrawer}
          onSubmit={handleImportSubmit}
          onFieldChange={handleImportField}
        />
      )}

      {activeDrawer === 'importLocalKey' && selectedLocalKey && (
        <ImportLocalKeyDrawer
          form={importLocalForm}
          localKey={selectedLocalKey}
          error={error}
          operationLoading={operationLoading}
          onClose={closeDrawer}
          onSubmit={handleImportLocalSubmit}
          onFormChange={setImportLocalForm}
        />
      )}

      {activeDrawer === 'uploadKey' && (
        <UploadKeyDrawer
          form={uploadForm}
          hosts={hosts}
          error={error}
          operationLoading={operationLoading}
          onClose={closeDrawer}
          onSubmit={handleUploadSubmit}
          onFormChange={setUploadForm}
        />
      )}
    </section>
  )
}
