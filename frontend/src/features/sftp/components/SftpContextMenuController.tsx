import { useEffect } from 'react'
import ContextMenu from './ContextMenu'
import type { ContextMenuState } from '../sftpUtils'

export interface ExtendedContextMenuState extends ContextMenuState {
  transferLabel?: string
  deleteSelectionLabel?: string
  hiddenFilesLabel?: string
}

interface SftpContextMenuControllerProps {
  state: ExtendedContextMenuState | null
  onClose: () => void
  onAction: (action: string) => void
}

export default function SftpContextMenuController({
  state,
  onClose,
  onAction,
}: SftpContextMenuControllerProps) {
  useEffect(() => {
    if (!state) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('click', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, state])

  return (
    <ContextMenu
      state={state}
      onClose={onClose}
      onAction={onAction}
    />
  )
}
