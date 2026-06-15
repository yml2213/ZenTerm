import { useCallback, useEffect, useState } from 'react'
import {
  getCredentials,
  listLocalSSHKeys,
  type LocalSSHKey,
} from '../../lib/backend'
import { cmd } from '../../wailsjs/wailsjs/go/models'

type Credential = cmd.Credential

export function useKeychainData(vaultUnlocked: boolean) {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [localKeys, setLocalKeys] = useState<LocalSSHKey[]>([])
  const [loading, setLoading] = useState(vaultUnlocked)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  return {
    credentials,
    localKeys,
    loading,
    error,
    notice,
    setError,
    setNotice,
    loadCredentials,
  }
}
