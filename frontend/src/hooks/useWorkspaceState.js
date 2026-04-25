import { useState } from 'react'

export function useWorkspaceState() {
  const [activeWorkspace, setActiveWorkspace] = useState('vaults')
  const [sessionTabs, setSessionTabs] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [newTabs, setNewTabs] = useState([])
  const [activeNewTabId, setActiveNewTabId] = useState(null)
  const [logTabs, setLogTabs] = useState([])
  const [activeLogTabId, setActiveLogTabId] = useState(null)

  const activeSession = sessionTabs.find((session) => session.sessionId === activeSessionId) || null
  const workspaceTabs = newTabs
    .concat(sessionTabs.map((session) => ({
      ...session,
      tabId: session.sessionId,
      type: 'ssh',
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
