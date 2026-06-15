import { useEffect } from 'react'
import { WorkspaceType } from '../types'

interface GlobalHostSearchHotkeyProps {
  activeWorkspace: WorkspaceType
  newTabSearchInputRef: React.RefObject<HTMLInputElement | null>
  hostSearchInputRef: React.RefObject<HTMLInputElement | null>
  setActiveWorkspace: (workspace: WorkspaceType) => void
  setActiveSidebarPage: (page: string) => void
}

export function useGlobalHostSearchHotkey({
  activeWorkspace,
  newTabSearchInputRef,
  hostSearchInputRef,
  setActiveWorkspace,
  setActiveSidebarPage,
}: GlobalHostSearchHotkeyProps) {
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
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
