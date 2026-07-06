import { useEffect } from 'react'
import { listLocalSSHConfigHosts } from '@/lib/backend'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import type { SSHConfigImportPrompt } from '@/types'

interface SSHConfigImportPromptProps {
  vaultUnlocked: boolean
  hosts: cmd.Host[]
  setError: (error: string | null) => void
  setSSHConfigImportPrompt: (prompt: SSHConfigImportPrompt | null) => void
}

export function useSSHConfigImportPrompt({
  vaultUnlocked,
  hosts,
  setError,
  setSSHConfigImportPrompt,
}: SSHConfigImportPromptProps) {
  useEffect(() => {
    if (!vaultUnlocked) {
      return undefined
    }

    let disposed = false

    async function discoverAndAsk() {
      const discoveredHosts = await listLocalSSHConfigHosts()
      if (disposed) {
        return
      }

      const existingIDs = new Set(hosts.map((host) => host.id))
      const importableHosts = discoveredHosts.filter((host) => !host.imported && !existingIDs.has(host.id))
      if (importableHosts.length === 0) {
        return
      }

      const promptKey = `zenterm:ssh-config-import:${importableHosts.map((host) => host.id).sort().join(',')}`
      if (window.sessionStorage.getItem(promptKey) === 'dismissed') {
        return
      }

      if (window.localStorage.getItem('zenterm:ssh-config-import:never-prompt') === 'true') {
        return
      }

      const previewLines = importableHosts
        .slice(0, 5)
        .map((host) => `${host.alias} (${host.user || '当前用户'}@${host.host_name}:${host.port || 22})`)
      setSSHConfigImportPrompt({
        promptKey,
        hostIds: importableHosts.map((host) => host.id),
        previewLines,
        total: importableHosts.length,
      })
    }

    discoverAndAsk().catch((err) => {
      if (!disposed) {
        setError(err.message || String(err))
      }
    })

    return () => {
      disposed = true
    }
  }, [hosts, setError, setSSHConfigImportPrompt, vaultUnlocked])
}
