import { useEffect } from 'react'
import type { WorkspaceTab, WorkspaceType } from './workspaceTypes'

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
