import { persistWindowState, windowToggleMaximise } from '../lib/backend'
import { createLogWorkspaceTab, createNewWorkspaceTab } from '../lib/appSessionUtils'
import { main } from '../wailsjs/wailsjs/go/models'
import { SessionTab, WorkspaceTab, WorkspaceType } from '../types'

interface WorkspaceActionHandlersProps {
  state: {
    newTabs: WorkspaceTab[]
    activeNewTabId: string | null
    sessionTabs: SessionTab[]
    activeLogTabId: string | null
  }
  setters: {
    setError: (error: string | null) => void
    setActiveNewTabId: (id: string | null) => void
    setActiveWorkspace: (workspace: WorkspaceType) => void
    setSessionTabs: (updater: SessionTab[] | ((current: SessionTab[]) => SessionTab[])) => void
    setActiveSessionId: (updater: string | null | ((current: string | null) => string | null)) => void
    setNewTabs: (updater: WorkspaceTab[] | ((current: WorkspaceTab[]) => WorkspaceTab[])) => void
    setLogTabs: (updater: WorkspaceTab[] | ((current: WorkspaceTab[]) => WorkspaceTab[])) => void
    setActiveLogTabId: (id: string | null) => void
  }
  refs: {
    newTabCounterRef: React.MutableRefObject<number>
  }
}

export function useWorkspaceActionHandlers({
  state,
  setters,
  refs,
}: WorkspaceActionHandlersProps) {
  const {
    newTabs,
    activeNewTabId,
    sessionTabs,
    activeLogTabId,
  } = state
  const {
    setError,
    setActiveNewTabId,
    setActiveWorkspace,
    setSessionTabs,
    setActiveSessionId,
    setNewTabs,
    setLogTabs,
    setActiveLogTabId,
  } = setters
  const { newTabCounterRef } = refs

  function createNextNewTab() {
    newTabCounterRef.current += 1
    return createNewWorkspaceTab(newTabCounterRef.current)
  }

  function activateNewTab(tabId: string) {
    setActiveNewTabId(tabId)
    setActiveWorkspace('new-tab')
  }

  function removeSessionTab(sessionID: string) {
    setSessionTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((session) => session.sessionId !== sessionID)
      setActiveSessionId((currentActive) => {
        if (currentActive !== sessionID) {
          return currentActive
        }
        return nextTabs.at(-1)?.sessionId || null
      })
      return nextTabs
    })
  }

  function openNewTab() {
    const nextTab = createNextNewTab()
    setNewTabs((currentTabs) => currentTabs.concat(nextTab))
    setActiveNewTabId(nextTab.tabId)
    setActiveWorkspace('new-tab')
  }

  function closeNewTab(tabId: string) {
    setNewTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.tabId !== tabId)
      if (activeNewTabId === tabId) {
        const nextNewTab = nextTabs.at(-1)
        if (nextNewTab) {
          setActiveNewTabId(nextNewTab.tabId)
          setActiveWorkspace('new-tab')
        } else {
          setActiveNewTabId(null)
          setActiveSessionId((current) => current || sessionTabs.at(-1)?.sessionId || null)
          setActiveWorkspace(sessionTabs.length > 0 ? 'ssh' : 'vaults')
        }
      }

      return nextTabs
    })
  }

  function openLogTab(log: main.SessionLog) {
    if (!log?.id) {
      return
    }

    const nextTab = createLogWorkspaceTab(log)
    setLogTabs((currentTabs) => (
      currentTabs.some((tab) => tab.tabId === nextTab.tabId)
        ? currentTabs.map((tab) => (tab.tabId === nextTab.tabId ? { ...tab, ...nextTab } : tab))
        : currentTabs.concat(nextTab)
    ))
    setActiveLogTabId(nextTab.tabId)
    setActiveWorkspace('log')
  }

  function closeLogTab(tabId: string) {
    setLogTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.tabId !== tabId)
      if (activeLogTabId === tabId) {
        const nextLogTab = nextTabs.at(-1)
        if (nextLogTab) {
          setActiveLogTabId(nextLogTab.tabId)
          setActiveWorkspace('log')
        } else {
          setActiveLogTabId(null)
          setActiveSessionId((current) => current || sessionTabs.at(-1)?.sessionId || null)
          setActiveWorkspace(sessionTabs.length > 0 ? 'ssh' : 'vaults')
        }
      }

      return nextTabs
    })
  }

  function handleWorkspaceStripDoubleClick(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) {
      return
    }

    windowToggleMaximise()
      .then(() => persistWindowState())
      .catch((err) => setError(err.message || String(err)))
  }

  function handleWorkspaceChange(workspace: WorkspaceType) {
    if (workspace === 'ssh') {
      if (sessionTabs.length === 0) {
        if (newTabs.length > 0) {
          const fallbackNewTabId = activeNewTabId || newTabs.at(-1)?.tabId
          if (fallbackNewTabId) {
            activateNewTab(fallbackNewTabId)
          }
        }
        return
      }

      setActiveSessionId((current) => current || sessionTabs.at(-1)?.sessionId || null)
    }

    setActiveWorkspace(workspace)
  }

  function handleWorkspaceTabSelect(tab: WorkspaceTab) {
    if (tab.type === 'new') {
      activateNewTab(tab.tabId)
      return
    }

    if (tab.type === 'log') {
      setActiveLogTabId(tab.tabId)
      setActiveWorkspace('log')
      return
    }

    setActiveSessionId(tab.sessionId!)
    setActiveWorkspace('ssh')
  }

  return {
    activateNewTab,
    removeSessionTab,
    openLogTab,
    openNewTab,
    closeNewTab,
    closeLogTab,
    handleWorkspaceStripDoubleClick,
    handleWorkspaceChange,
    handleWorkspaceTabSelect,
  }
}
