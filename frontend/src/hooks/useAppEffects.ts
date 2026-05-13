import { startTransition, useEffect } from 'react'
import {
  getVaultStatus,
  listHosts,
  listSessions,
  onRuntimeEvent,
  persistWindowState,
  tryAutoUnlock,
} from '../lib/backend'
import { buildSessionTabs, normalizeHostKeyPrompt } from '../lib/appSessionUtils'
import { main } from '../wailsjs/wailsjs/go/models'
import { HostKeyPrompt, SessionTab, WorkspaceTab, WorkspaceType } from '../types'

interface AppBootstrapProps {
  setHosts: (hosts: main.Host[]) => void
  setSelectedHostId: (id: string | null) => void
  setSessionTabs: (tabs: SessionTab[]) => void
  setActiveSessionId: (id: string | null) => void
  setActiveWorkspace: (workspace: WorkspaceType) => void
  setVaultInitialized: (initialized: boolean) => void
  setVaultUnlocked: (unlocked: boolean) => void
  setVaultReady: (ready: boolean) => void
  refreshKeychainStatus: () => void
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
  refreshKeychainStatus,
  setError,
  setHostKeyPrompt,
}: AppBootstrapProps) {
  useEffect(() => {
    let disposed = false

    async function bootstrap() {
      const loadedHosts = await listHosts()
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

      refreshKeychainStatus()
    }

    bootstrap().catch((err) => {
      if (!disposed) {
        setError(err.message || String(err))
        setVaultReady(true)
      }
    })

    const offHostKey = onRuntimeEvent('ssh:host-key:confirm', (prompt: any) => {
      setHostKeyPrompt(normalizeHostKeyPrompt(prompt))
    })

    return () => {
      disposed = true
      offHostKey()
    }
  }, [
    refreshKeychainStatus,
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

export function useWindowStatePersistence(setError: (error: string | null) => void) {
  useEffect(() => {
    let timerId: number | null = null

    function scheduleWindowStatePersist() {
      if (timerId) {
        window.clearTimeout(timerId)
      }

      // 使用防抖避免连续拖拽窗口时频繁写盘 / debounce resize bursts to avoid excessive writes while dragging.
      timerId = window.setTimeout(() => {
        persistWindowState().catch((err) => setError(err.message || String(err)))
      }, 200)
    }

    window.addEventListener('resize', scheduleWindowStatePersist)

    return () => {
      window.removeEventListener('resize', scheduleWindowStatePersist)
      if (timerId) {
        window.clearTimeout(timerId)
      }
    }
  }, [setError])
}

interface WorkspaceAutoFallbackProps {
  activeWorkspace: WorkspaceType
  sessionCount: number
  setNewTabs: (updater: WorkspaceTab[] | ((current: WorkspaceTab[]) => WorkspaceTab[])) => void
  setActiveNewTabId: (updater: string | null | ((current: string | null) => string | null)) => void
  setActiveWorkspace: (workspace: WorkspaceType) => void
}

export function useWorkspaceAutoFallback({
  activeWorkspace,
  sessionCount,
  setNewTabs,
  setActiveNewTabId,
  setActiveWorkspace,
}: WorkspaceAutoFallbackProps) {
  useEffect(() => {
    if (activeWorkspace === 'ssh' && sessionCount === 0) {
      setNewTabs((currentTabs) => {
        if (currentTabs.length > 0) {
          setActiveNewTabId((current) => current || currentTabs.at(-1)?.tabId || null)
          setActiveWorkspace('new-tab')
          return currentTabs
        }

        setActiveNewTabId(null)
        setActiveWorkspace('vaults')
        return currentTabs
      })
    }
  }, [activeWorkspace, sessionCount, setActiveNewTabId, setActiveWorkspace, setNewTabs])
}

interface GlobalHostSearchHotkeyProps {
  activeWorkspace: WorkspaceType
  newTabSearchInputRef: React.RefObject<HTMLInputElement>
  hostSearchInputRef: React.RefObject<HTMLInputElement>
  setActiveWorkspace: (workspace: WorkspaceType) => void
  setActiveSidebarPage: (page: string) => void
}

export function useGlobalHostSearchHotkey({
  activeWorkspace,
  newTabSearchInputRef,
  hostSearchInputRef,
  setActiveWorkspace,
  setActiveSidebarPage,
}: GlobalHostSearchHotkeyProps) {
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return
      }

      event.preventDefault()
      if (activeWorkspace === 'new-tab') {
        newTabSearchInputRef.current?.focus()
        newTabSearchInputRef.current?.select()
        return
      }

      setActiveWorkspace('vaults')
      setActiveSidebarPage('hosts')
      window.requestAnimationFrame(() => {
        hostSearchInputRef.current?.focus()
        hostSearchInputRef.current?.select()
      })
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [
    activeWorkspace,
    hostSearchInputRef,
    newTabSearchInputRef,
    setActiveSidebarPage,
    setActiveWorkspace,
  ])
}
