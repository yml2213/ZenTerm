import { useMemo, useState } from 'react'
import type { WorkspaceType, SessionTab, WorkspaceTab } from '@/types'

export function useWorkspaceState() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>('vaults')
  const [sessionTabs, setSessionTabs] = useState<SessionTab[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [newTabs, setNewTabs] = useState<WorkspaceTab[]>([])
  const [activeNewTabId, setActiveNewTabId] = useState<string | null>(null)
  const [logTabs, setLogTabs] = useState<WorkspaceTab[]>([])
  const [activeLogTabId, setActiveLogTabId] = useState<string | null>(null)

  const activeSession = useMemo(() => (
    sessionTabs.find((session) => session.sessionId === activeSessionId) || null
  ), [activeSessionId, sessionTabs])
  const workspaceTabs: WorkspaceTab[] = useMemo(() => newTabs
    .concat(sessionTabs.map((session) => ({
      ...session,
      tabId: session.sessionId!,
      type: 'ssh' as const,
    })))
    .concat(logTabs), [logTabs, newTabs, sessionTabs])
  const activeLogTab = useMemo(() => (
    logTabs.find((tab) => tab.tabId === activeLogTabId) || null
  ), [activeLogTabId, logTabs])
  const activeWorkspaceTabId = useMemo(() => (activeWorkspace === 'new-tab'
    ? activeNewTabId
    : activeWorkspace === 'log'
    ? activeLogTabId
    : activeSessionId), [activeLogTabId, activeNewTabId, activeSessionId, activeWorkspace])

  const shellClassName = useMemo(() => [
    'app-shell',
    activeWorkspace === 'ssh' || activeWorkspace === 'log' ? 'app-shell-tabbed' : '',
    activeWorkspace === 'ssh' ? 'app-shell-ssh' : '',
    activeWorkspace === 'log' ? 'app-shell-log' : '',
    activeWorkspace === 'sftp' ? 'app-shell-sftp' : '',
  ].filter(Boolean).join(' '), [activeWorkspace])

  return {
    activeWorkspace,
    setActiveWorkspace,
    sessionTabs,
    setSessionTabs,
    activeSessionId,
    setActiveSessionId,
    newTabs,
    setNewTabs,
    activeNewTabId,
    setActiveNewTabId,
    logTabs,
    setLogTabs,
    activeLogTabId,
    setActiveLogTabId,
    activeSession,
    activeLogTab,
    workspaceTabs,
    activeWorkspaceTabId,
    shellClassName,
  }
}

export type WorkspaceState = ReturnType<typeof useWorkspaceState>
