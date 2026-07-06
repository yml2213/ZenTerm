import { useState } from 'react'
import {
  deleteCredential,
  generateCredential,
  getCredentialPublicKey,
  getCredentialUsage,
  importCredential,
  importLocalSSHKey,
  type LocalSSHKey,
  uploadCredentialToHost,
} from '@/lib/backend'
import type {
  GenerateKeyForm,
  ImportKeyForm,
  ImportLocalKeyForm,
  UploadKeyForm,
} from './keychainConfig'

interface UseKeychainActionsProps {
  generateForm: GenerateKeyForm
  importForm: ImportKeyForm
  importLocalForm: ImportLocalKeyForm
  uploadForm: UploadKeyForm
  selectedCredentialId: string
  selectedLocalKey: LocalSSHKey | null
  closeDrawer: () => void
  loadCredentials: () => Promise<void>
  setError: (error: string | null) => void
  setNotice: (notice: string | null) => void
  onHostsChanged?: () => Promise<void> | void
}

export function useKeychainActions({
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
}: UseKeychainActionsProps) {
  const [operationLoading, setOperationLoading] = useState(false)

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
        generateForm.passphrase,
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
        importForm.passphrase,
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
      const usage = await getCredentialUsage(credentialID)
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

  return {
    operationLoading,
    handleGenerateSubmit,
    handleImportSubmit,
    handleDeleteCredential,
    handleCopyPublicKey,
    handleCopyLocalPublicKey,
    handleImportLocalSubmit,
    handleUploadSubmit,
  }
}
