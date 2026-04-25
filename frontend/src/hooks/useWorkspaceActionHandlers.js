import { persistWindowState, windowToggleMaximise } from '../lib/backend.js'
import { createLogWorkspaceTab, createNewWorkspaceTab } from '../lib/appSessionUtils.js'

export function useWorkspaceActionHandlers({
  state,
  setters,
  refs,
}) {
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

  function activateNewTab(tabId) {
    setActiveNewTabId(tabId)
    setActiveWorkspace('new-tab')
  }

  function removeSessionTab(sessionID) {
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

  function closeNewTab(tabId) {
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

  function openLogTab(log) {
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

  function closeLogTab(tabId) {
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

  function handleWorkspaceStripDoubleClick(event) {
    if (event.target.closest('button, input, textarea, select, a, [role="button"]')) {
      return
    }

    windowToggleMaximise()
      .then(() => persistWindowState())
      .catch((err) => setError(err.message || String(err)))
  }

  function handleWorkspaceChange(workspace) {
    if (workspace === 'ssh') {
      if (sessionTabs.length === 0) {
        if (newTabs.length > 0) {
          activateNewTab(activeNewTabId || newTabs.at(-1)?.tabId)
        }
        return
      }

      setActiveSessionId((current) => current || sessionTabs.at(-1)?.sessionId || null)
    }

    setActiveWorkspace(workspace)
  }

  function handleWorkspaceTabSelect(tab) {
    if (tab.type === 'new') {
      activateNewTab(tab.tabId)
      return
    }

    if (tab.type === 'log') {
      setActiveLogTabId(tab.tabId)
      setActiveWorkspace('log')
      return
    }

    setActiveSessionId(tab.sessionId)
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
