import { startTransition } from 'react'
import { buildOptimisticSessionTab, buildSessionTabs } from '../lib/appSessionUtils'
import {
  acceptHostKey,
  connect,
  disconnect,
  listHosts,
  listSessions,
  rejectHostKey,
  resizeTerminal,
  sendInput,
} from '../lib/backend'
import { toUserMessage } from '../lib/appHostUtils'
import { main } from '../wailsjs/wailsjs/go/models'
import { HostKeyPrompt, SessionTab, WorkspaceTab, WorkspaceType } from '../types'

interface SessionActionHandlersProps {
  state: {
    hosts: main.Host[]
    activeWorkspace: WorkspaceType
    activeNewTabId: string | null
    hostKeyPrompt: HostKeyPrompt | null
  }
  setters: {
    setError: (error: string | null) => void
    setHosts: (hosts: main.Host[]) => void
    setSessionTabs: (updater: SessionTab[] | ((current: SessionTab[]) => SessionTab[])) => void
    setActiveSessionId: (updater: string | null | ((current: string | null) => string | null)) => void
    setNewTabs: (updater: WorkspaceTab[] | ((current: WorkspaceTab[]) => WorkspaceTab[])) => void
    setActiveNewTabId: (updater: string | null | ((current: string | null) => string | null)) => void
    setConnectingHostIds: (updater: string[] | ((current: string[]) => string[])) => void
    setActiveWorkspace: (workspace: WorkspaceType) => void
    setHostKeyPrompt: (prompt: HostKeyPrompt | null) => void
    setIsAcceptingKey: (isAccepting: boolean) => void
  }
  refs: {
    rejectedHostIdsRef: React.MutableRefObject<Set<string>>
  }
  helpers: {
    removeSessionTab: (sessionID: string) => void
  }
}

export function useSessionActionHandlers({
  state,
  setters,
  refs,
  helpers,
}: SessionActionHandlersProps) {
  const {
    hosts,
    activeWorkspace,
    activeNewTabId,
    hostKeyPrompt,
  } = state
  const {
    setError,
    setHosts,
    setSessionTabs,
    setActiveSessionId,
    setNewTabs,
    setActiveNewTabId,
    setConnectingHostIds,
    setActiveWorkspace,
    setHostKeyPrompt,
    setIsAcceptingKey,
  } = setters
  const { rejectedHostIdsRef } = refs
  const { removeSessionTab } = helpers

  function syncHostsSessions(currentHosts = hosts) {
    return listSessions()
      .then((snapshot) => {
        setSessionTabs((currentTabs) => {
          const nextTabs = buildSessionTabs(snapshot, currentHosts, currentTabs)
          setActiveSessionId((currentActive) => {
            if (currentActive && nextTabs.some((tab) => tab.sessionId === currentActive)) {
              return currentActive
            }
            return nextTabs.at(-1)?.sessionId || null
          })
          return nextTabs
        })
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function refreshHostsAfterConnect() {
    return listHosts()
      .then((nextHosts) => {
        startTransition(() => setHosts(nextHosts))
        return syncHostsSessions(nextHosts)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleConnect(hostID: string) {
    const host = hosts.find((item) => item.id === hostID) || null
    const sourceNewTabId = activeWorkspace === 'new-tab' ? activeNewTabId : null
    setConnectingHostIds((current) => current.concat(hostID))
    setError(null)

    connect(hostID)
      .then((sessionID) => {
        const nextTab = buildOptimisticSessionTab(host, sessionID)

        startTransition(() => {
          setSessionTabs((currentTabs) => {
            if (currentTabs.some((tab) => tab.sessionId === sessionID)) {
              return currentTabs
            }

            return currentTabs.concat(nextTab)
          })
          if (sourceNewTabId) {
            setNewTabs((currentTabs) => currentTabs.filter((tab) => tab.tabId !== sourceNewTabId))
            setActiveNewTabId(null)
          }
          setActiveSessionId(sessionID)
          setActiveWorkspace('ssh')
        })

        void refreshHostsAfterConnect()
      })
      .catch((err) => {
        if (rejectedHostIdsRef.current.delete(hostID)) {
          return
        }
        setError(toUserMessage(err))
      })
      .finally(() => {
        setConnectingHostIds((current) => current.filter((id) => id !== hostID))
      })
  }

  function handleCloseTab(sessionID: string) {
    disconnect(sessionID)
      .then(() => {
        removeSessionTab(sessionID)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleSessionClosed(sessionID: string) {
    removeSessionTab(sessionID)
  }

  function handleSendInput(sessionID: string, data: string) {
    return sendInput(sessionID, data)
  }

  function handleResizeTerminal(sessionID: string, cols: number, rows: number) {
    return resizeTerminal(sessionID, cols, rows)
  }

  function handleAcceptHostKey() {
    if (!hostKeyPrompt) {
      return
    }

    setIsAcceptingKey(true)
    acceptHostKey(hostKeyPrompt.hostID, hostKeyPrompt.key)
      .then(() => {
        setHostKeyPrompt(null)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setIsAcceptingKey(false))
  }

  function handleRejectHostKey() {
    if (!hostKeyPrompt) {
      return
    }

    rejectedHostIdsRef.current.add(hostKeyPrompt.hostID)
    rejectHostKey(hostKeyPrompt.hostID)
      .then(() => {
        setHostKeyPrompt(null)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  return {
    syncHostsSessions,
    handleConnect,
    handleCloseTab,
    handleSessionClosed,
    handleSendInput,
    handleResizeTerminal,
    handleAcceptHostKey,
    handleRejectHostKey,
  }
}
