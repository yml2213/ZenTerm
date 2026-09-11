import { startTransition } from 'react'
import { buildOptimisticSessionTab, buildSessionTabs } from '@/lib/appSessionUtils'
import {
  acceptHostKey,
  answerKeyboardInteractive,
  cancelConnect,
  cancelKeyboardInteractive,
  connect,
  disconnect,
  listHosts,
  listSessions,
  rejectHostKey,
  resizeTerminal,
  sendInput,
} from '@/lib/backend'
import { isDemoHost, toUserMessage, withDemoHosts } from '@/features/hosts/appHostUtils'
import { cmd } from '@/lib/backendModels'
import type { HostKeyPrompt, KeyboardInteractivePrompt } from './sessionTypes'
import type { SessionTab, WorkspaceTab, WorkspaceType } from '@/features/workspace/workspaceTypes'

interface SessionActionHandlersProps {
  state: {
    hosts: cmd.Host[]
    activeWorkspace: WorkspaceType
    activeNewTabId: string | null
    hostKeyPrompt: HostKeyPrompt | null
    keyboardInteractivePrompt: KeyboardInteractivePrompt | null
  }
  setters: {
    app: {
      setError: (error: string | null) => void
    }
    hosts: {
      setHosts: (hosts: cmd.Host[]) => void
    }
    workspace: {
      setSessionTabs: (updater: SessionTab[] | ((current: SessionTab[]) => SessionTab[])) => void
      setActiveSessionId: (updater: string | null | ((current: string | null) => string | null)) => void
      setNewTabs: (updater: WorkspaceTab[] | ((current: WorkspaceTab[]) => WorkspaceTab[])) => void
      setActiveNewTabId: (updater: string | null | ((current: string | null) => string | null)) => void
      setActiveWorkspace: (workspace: WorkspaceType) => void
    }
    sessions: {
      setConnectingHostIds: (updater: string[] | ((current: string[]) => string[])) => void
      setHostKeyPrompt: (prompt: HostKeyPrompt | null) => void
      setIsAcceptingKey: (isAccepting: boolean) => void
      setKeyboardInteractivePrompt: (prompt: KeyboardInteractivePrompt | null) => void
      setIsAnsweringKeyboardInteractive: (busy: boolean) => void
    }
  }
  refs: {
    rejectedHostIdsRef: React.MutableRefObject<Set<string>>
  }
  helpers: {
    removeSessionTab: (sessionID: string) => void
  }
}

export function useSessionActions({
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
    keyboardInteractivePrompt,
  } = state
  const {
    setError,
  } = setters.app
  const {
    setHosts,
  } = setters.hosts
  const {
    setSessionTabs,
    setActiveSessionId,
    setNewTabs,
    setActiveNewTabId,
    setActiveWorkspace,
  } = setters.workspace
  const {
    setConnectingHostIds,
    setHostKeyPrompt,
    setIsAcceptingKey,
    setKeyboardInteractivePrompt,
    setIsAnsweringKeyboardInteractive,
  } = setters.sessions
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
      .then((persistedHosts) => {
        const nextHosts = withDemoHosts(persistedHosts)
        startTransition(() => setHosts(nextHosts))
        return syncHostsSessions(nextHosts)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleConnect(hostID: string) {
    const host = hosts.find((item) => item.id === hostID) || null
    if (isDemoHost(host)) {
      setError('演示主机仅用于界面预览，不会发起真实连接。')
      return
    }

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

  function handleCancelConnect(hostID: string) {
    cancelConnect(hostID).catch((err) => setError(toUserMessage(err)))
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

  function handleAnswerKeyboardInteractive(answers: string[]) {
    if (!keyboardInteractivePrompt) {
      return
    }

    setIsAnsweringKeyboardInteractive(true)
    answerKeyboardInteractive(
      keyboardInteractivePrompt.hostID,
      keyboardInteractivePrompt.promptID,
      answers,
    )
      .then(() => {
        setKeyboardInteractivePrompt(null)
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setIsAnsweringKeyboardInteractive(false))
  }

  function handleCancelKeyboardInteractive() {
    if (!keyboardInteractivePrompt) {
      return
    }

    rejectedHostIdsRef.current.add(keyboardInteractivePrompt.hostID)
    cancelKeyboardInteractive(keyboardInteractivePrompt.hostID, keyboardInteractivePrompt.promptID)
      .then(() => {
        setKeyboardInteractivePrompt(null)
      })
      .catch((err) => setError(err.message || String(err)))
  }

  return {
    syncHostsSessions,
    handleConnect,
    handleCancelConnect,
    handleCloseTab,
    handleSessionClosed,
    handleSendInput,
    handleResizeTerminal,
    handleAcceptHostKey,
    handleRejectHostKey,
    handleAnswerKeyboardInteractive,
    handleCancelKeyboardInteractive,
  }
}
