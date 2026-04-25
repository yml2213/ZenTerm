import { startTransition } from 'react'
import { buildOptimisticSessionTab, buildSessionTabs } from '../lib/appSessionUtils.js'
import {
  acceptHostKey,
  connect,
  disconnect,
  listHosts,
  listSessions,
  rejectHostKey,
  resizeTerminal,
  sendInput,
} from '../lib/backend.js'
import { toUserMessage } from '../lib/appHostUtils.js'

export function useSessionActionHandlers({
  state,
  setters,
  refs,
  helpers,
}) {
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

  function handleConnect(hostID) {
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

  function handleCloseTab(sessionID) {
    disconnect(sessionID)
      .then(() => {
        removeSessionTab(sessionID)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleSessionClosed(sessionID) {
    removeSessionTab(sessionID)
  }

  function handleSendInput(sessionID, data) {
    return sendInput(sessionID, data)
  }

  function handleResizeTerminal(sessionID, cols, rows) {
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
