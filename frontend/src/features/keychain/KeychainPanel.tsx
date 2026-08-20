import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import {
  RefreshCw,
} from 'lucide-react'
import { cmd } from '@/lib/backendModels'
import * as AppAPI from '@/wailsjs/wailsjs/go/cmd/App'
import GenerateKeyDrawer from './components/GenerateKeyDrawer'
import ImportKeyDrawer from './components/ImportKeyDrawer'
import ImportLocalKeyDrawer from './components/ImportLocalKeyDrawer'
import KeychainEmptyState from './components/KeychainEmptyState'
import KeychainList from './components/KeychainList'
import HostSecretsList from './components/HostSecretsList'
import SecretModal from './components/SecretModal'
import UploadKeyDrawer from './components/UploadKeyDrawer'
import {
  credentialTypes,
} from './keychainConfig'
import { useKeychainActions } from './useKeychainActions'
import { useKeychainData } from './useKeychainData'
import { useKeychainDrawers } from './useKeychainDrawers'

type Host = cmd.Host

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
  const [modalSecret, setModalSecret] = useState<{
    isOpen: boolean
    title: string
    label: string
    secret: string
    type: 'password' | 'private_key'
  } | null>(null)

  const {
    credentials,
    localKeys,
    loading,
    error,
    notice,
    setError,
    setNotice,
    loadCredentials,
  } = useKeychainData(vaultUnlocked)
  const {
    activeDrawer,
    generateForm,
    importForm,
    importLocalForm,
    uploadForm,
    selectedCredentialId,
    selectedLocalKey,
    setImportLocalForm,
    setUploadForm,
    openDrawer,
    openUploadDrawer,
    openImportLocalDrawer,
    closeDrawer,
    handleGenerateField,
    handleImportField,
  } = useKeychainDrawers({
    hosts,
    setError,
    setNotice,
  })
  const {
    operationLoading,
    handleGenerateSubmit,
    handleImportSubmit,
    handleDeleteCredential,
    handleCopyPublicKey,
    handleCopyLocalPublicKey,
    handleImportLocalSubmit,
    handleUploadSubmit,
  } = useKeychainActions({
    generateForm,
    importForm,
    importLocalForm,
    uploadForm,
    selectedCredentialId,
    selectedLocalKey,
    closeDrawer,
    loadCredentials,
    setError,
    setNotice,
    onHostsChanged,
  })

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

  const handleTypeChange = useCallback((type: string) => {
    setActiveType(type)
    closeDrawer()
  }, [closeDrawer])

  const handleViewCredentialPrivateKey = async (cred: cmd.Credential) => {
    try {
      const secret = await AppAPI.GetCredentialSecret(cred.id)
      setModalSecret({
        isOpen: true,
        title: `凭据私钥 - ${cred.label}`,
        label: `${cred.algorithm || 'SSH 密钥'} (创建于 ${cred.created_at ? new Date(cred.created_at).toLocaleDateString() : ''})`,
        secret: secret.private_key || '',
        type: 'private_key',
      })
    } catch (err) {
      setError(String(err))
    }
  }

  const toolbar = useMemo(
    () => (
      <div className="keychain-toolbar">
        <div className="keychain-sections" role="tablist" aria-label="凭据类型">
          {credentialTypes.map((type) => {
            const Icon = type.icon
            let count = credentials.filter((c) => c.type === type.id).length
            if (type.id === 'ssh_key') count += localKeys.length
            if (type.id === 'host_secrets') count = hosts.length

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
    [activeType, credentials, handleTypeChange, hosts.length, loadCredentials, loading, localKeys.length, vaultUnlocked],
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
          {activeType === 'host_secrets' ? (
            <HostSecretsList
              hosts={hosts}
              vaultUnlocked={vaultUnlocked}
              credentials={credentials}
            />
          ) : !hasVisibleKeys ? (
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
              onViewPrivateKey={handleViewCredentialPrivateKey}
              onUploadCredential={openUploadDrawer}
              onDeleteCredential={handleDeleteCredential}
              onCopyLocalPublicKey={handleCopyLocalPublicKey}
              onImportLocalKey={openImportLocalDrawer}
            />
          )}
        </div>
      </div>

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
