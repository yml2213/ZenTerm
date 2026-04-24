import { startTransition, useEffect } from 'react'
import {
  getVaultStatus,
  listHosts,
  listSessions,
  onRuntimeEvent,
  persistWindowState,
  tryAutoUnlock,
} from '../lib/backend.js'
import { buildSessionTabs, normalizeHostKeyPrompt } from '../lib/appSessionUtils.js'

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
}) {
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

    const offHostKey = onRuntimeEvent('ssh:host-key:confirm', (prompt) => {
      setHostKeyPrompt(normalizeHostKeyPrompt(prompt))
    })

    return () => {
      disposed = true
      offHostKey()
    }
  }, [])
}

export function useWindowStatePersistence(setError) {
  useEffect(() => {
    let timerId = null

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

export function useWorkspaceAutoFallback({
  activeWorkspace,
  sessionCount,
  setNewTabs,
  setActiveNewTabId,
  setActiveWorkspace,
}) {
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

export function useGlobalHostSearchHotkey({
  activeWorkspace,
  newTabSearchInputRef,
  hostSearchInputRef,
  setActiveWorkspace,
  setActiveSidebarPage,
}) {
  useEffect(() => {
    function handleGlobalKeyDown(event) {
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
