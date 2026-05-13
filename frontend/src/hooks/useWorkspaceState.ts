import { useState } from 'react'
import { WorkspaceType, SessionTab, WorkspaceTab } from '../types'

export function useWorkspaceState() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>('vaults')
  const [sessionTabs, setSessionTabs] = useState<SessionTab[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [newTabs, setNewTabs] = useState<WorkspaceTab[]>([])
  const [activeNewTabId, setActiveNewTabId] = useState<string | null>(null)
  const [logTabs, setLogTabs] = useState<WorkspaceTab[]>([])
  const [activeLogTabId, setActiveLogTabId] = useState<string | null>(null)

  const activeSession = sessionTabs.find((session) => session.sessionId === activeSessionId) || null
  const workspaceTabs: WorkspaceTab[] = newTabs
    .concat(sessionTabs.map((session) => ({
      ...session,
      tabId: session.sessionId!,
      type: 'ssh' as const,
    })))
    .concat(logTabs)
  const activeLogTab = logTabs.find((tab) => tab.tabId === activeLogTabId) || null
  const activeWorkspaceTabId = activeWorkspace === 'new-tab'
    ? activeNewTabId
    : activeWorkspace === 'log'
    ? activeLogTabId
    : activeSessionId

  const shellClassName = [
    'app-shell',
    activeWorkspace === 'ssh' || activeWorkspace === 'log' ? 'app-shell-tabbed' : '',
    activeWorkspace === 'ssh' ? 'app-shell-ssh' : '',
    activeWorkspace === 'log' ? 'app-shell-log' : '',
    activeWorkspace === 'sftp' ? 'app-shell-sftp' : '',
  ].filter(Boolean).join(' ')

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
