import { startTransition, useEffect } from 'react'
import {
  getVaultStatus,
  listHosts,
  listSessions,
  onRuntimeEvent,
  tryAutoUnlock,
} from '@/lib/backend'
import { buildSessionTabs, normalizeHostKeyPrompt } from '@/lib/appSessionUtils'
import { withDemoHosts } from '@/features/hosts/appHostUtils'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import type { HostKeyPrompt, SessionTab, WorkspaceType } from '@/types'

interface AppBootstrapProps {
  setHosts: (hosts: cmd.Host[]) => void
  setSelectedHostId: (id: string | null) => void
  setSessionTabs: (tabs: SessionTab[]) => void
  setActiveSessionId: (id: string | null) => void
  setActiveWorkspace: (workspace: WorkspaceType) => void
  setVaultInitialized: (initialized: boolean) => void
  setVaultUnlocked: (unlocked: boolean) => void
  setVaultReady: (ready: boolean) => void
  setError: (error: string | null) => void
  setHostKeyPrompt: (prompt: HostKeyPrompt | null) => void
}

export function useAppBootstrap({
  setHosts,
  setSelectedHostId,
  setSessionTabs,
  setActiveSessionId,
  setActiveWorkspace,
  setVaultInitialized,
  setVaultUnlocked,
  setVaultReady,
  setError,
  setHostKeyPrompt,
}: AppBootstrapProps) {
  useEffect(() => {
    let disposed = false

    async function bootstrap() {
      const loadedHosts = withDemoHosts(await listHosts())
      if (disposed) {
        return
      }

      startTransition(() => {
        setHosts(loadedHosts)
        setSelectedHostId(loadedHosts[0]?.id || null)
      })

      const snapshot = await listSessions()
      if (disposed) {
        return
      }

      startTransition(() => {
        const nextTabs = buildSessionTabs(snapshot, loadedHosts, [])
        setSessionTabs(nextTabs)
        setActiveSessionId(nextTabs.at(-1)?.sessionId || null)
        setActiveWorkspace(nextTabs.length > 0 ? 'ssh' : 'vaults')
      })

      const status = await getVaultStatus()
      if (disposed) {
        return
      }

      let unlocked = Boolean(status.unlocked)
      if (status.initialized && !unlocked) {
        unlocked = await tryAutoUnlock()
        if (disposed) {
          return
        }
      }

      startTransition(() => {
        setVaultInitialized(Boolean(status.initialized))
        setVaultUnlocked(Boolean(unlocked))
        setVaultReady(true)
      })
    }

    bootstrap().catch((err) => {
      if (!disposed) {
        setError(err.message || String(err))
        setVaultReady(true)
      }
    })

    const offHostKey = onRuntimeEvent('ssh:host-key:confirm', (prompt: unknown) => {
      setHostKeyPrompt(normalizeHostKeyPrompt(prompt))
    })

    return () => {
      disposed = true
      offHostKey()
    }
  }, [
    setActiveSessionId,
    setActiveWorkspace,
    setError,
    setHostKeyPrompt,
    setHosts,
    setSelectedHostId,
    setSessionTabs,
    setVaultInitialized,
    setVaultReady,
    setVaultUnlocked,
  ])
}
