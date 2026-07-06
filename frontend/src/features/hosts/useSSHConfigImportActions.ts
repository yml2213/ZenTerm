import { startTransition } from 'react'
import { withDemoHosts } from './appHostUtils'
import { importLocalSSHConfigHosts, listHosts } from '@/lib/backend'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import type { SSHConfigImportPrompt } from './sshConfigImportTypes'

interface SSHConfigImportActionProps {
  state: {
    sshConfigImportPrompt: SSHConfigImportPrompt | null
    sshConfigImportBusy: boolean
  }
  setters: {
    app: {
      setError: (error: string | null) => void
      setSSHConfigImportPrompt: (prompt: SSHConfigImportPrompt | null) => void
      setSSHConfigImportBusy: (busy: boolean) => void
    }
    hosts: {
      setHosts: (hosts: cmd.Host[]) => void
      setSelectedHostId: (updater: string | null | ((current: string | null) => string | null)) => void
    }
  }
}

export function useSSHConfigImportActions({
  state,
  setters,
}: SSHConfigImportActionProps) {
  function dismissSSHConfigImportPrompt() {
    const { sshConfigImportPrompt } = state
    if (sshConfigImportPrompt) {
      window.sessionStorage.setItem(sshConfigImportPrompt.promptKey, 'dismissed')
    }
    setters.app.setSSHConfigImportPrompt(null)
  }

  function dismissSSHConfigImportPermanently() {
    window.localStorage.setItem('zenterm:ssh-config-import:never-prompt', 'true')
    setters.app.setSSHConfigImportPrompt(null)
  }

  async function handleConfirmSSHConfigImport() {
    const { sshConfigImportPrompt, sshConfigImportBusy } = state
    if (!sshConfigImportPrompt || sshConfigImportBusy) {
      return
    }

    setters.app.setSSHConfigImportBusy(true)
    try {
      await importLocalSSHConfigHosts(sshConfigImportPrompt.hostIds)
      const nextHosts = withDemoHosts(await listHosts())
      startTransition(() => {
        setters.hosts.setHosts(nextHosts)
        setters.hosts.setSelectedHostId(nextHosts[0]?.id || null)
        setters.app.setSSHConfigImportPrompt(null)
      })
    } catch (err) {
      setters.app.setError(err instanceof Error ? err.message : String(err))
    } finally {
      setters.app.setSSHConfigImportBusy(false)
    }
  }

  return {
    dismissSSHConfigImportPrompt,
    dismissSSHConfigImportPermanently,
    handleConfirmSSHConfigImport,
  }
}
