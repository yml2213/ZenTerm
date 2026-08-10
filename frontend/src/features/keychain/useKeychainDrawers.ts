import { useCallback, useState } from 'react'
import type { LocalSSHKey } from '@/lib/backend'
import { cmd } from '@/lib/backendModels'
import {
  createGenerateKeyForm,
  createImportKeyForm,
  type GenerateKeyForm,
  type ImportKeyForm,
  type ImportLocalKeyForm,
  type UploadKeyForm,
} from './keychainConfig'

type Host = cmd.Host
type KeychainDrawer = 'generateKey' | 'importKey' | 'uploadKey' | 'importLocalKey' | null

interface UseKeychainDrawersProps {
  hosts: Host[]
  setError: (error: string | null) => void
  setNotice: (notice: string | null) => void
}

export function useKeychainDrawers({
  hosts,
  setError,
  setNotice,
}: UseKeychainDrawersProps) {
  const [activeDrawer, setActiveDrawer] = useState<KeychainDrawer>(null)
  const [generateForm, setGenerateForm] = useState(createGenerateKeyForm)
  const [importForm, setImportForm] = useState(createImportKeyForm)
  const [importLocalForm, setImportLocalForm] = useState<ImportLocalKeyForm>({ label: '', passphrase: '' })
  const [uploadForm, setUploadForm] = useState<UploadKeyForm>({ hostId: '', bindAfterUpload: true })
  const [selectedCredentialId, setSelectedCredentialId] = useState('')
  const [selectedLocalKey, setSelectedLocalKey] = useState<LocalSSHKey | null>(null)

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

  const closeDrawer = useCallback(() => {
    setActiveDrawer(null)
    setError(null)
  }, [setError])

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

  return {
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
  }
}
