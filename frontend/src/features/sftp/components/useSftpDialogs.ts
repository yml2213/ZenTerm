import { useState } from 'react'
import {
  collapseEntriesForDelete,
  getBaseName,
  joinTransferTargetPath,
  type DialogState,
  type FileEntry,
  type FileListing,
} from '../sftpUtils'

type SftpScope = 'local' | 'remote'
type TransferDirection = 'upload' | 'download'

export interface ExtendedDialogState extends DialogState {
  value?: string
  direction?: TransferDirection
  sourcePath?: string
  sourcePaths?: string[]
  startIndex?: number
  completedCount?: number
  targetDirectory?: string
  targetPath?: string
}

interface UseSftpDialogsProps {
  localListing: FileListing | null
  remoteListing: FileListing | null
  closeContextMenu: () => void
}

export function useSftpDialogs({
  localListing,
  remoteListing,
  closeContextMenu,
}: UseSftpDialogsProps) {
  const [dialogState, setDialogState] = useState<ExtendedDialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)

  function openCreateDirectory(scope: SftpScope) {
    closeContextMenu()
    setDialogState({
      type: 'mkdir',
      scope,
      parentPath: scope === 'remote' ? remoteListing?.path || '/' : localListing?.path || '',
      value: '',
    })
  }

  function openRenameEntry(scope: SftpScope, entry: FileEntry) {
    if (!entry || entry.parent) {
      return
    }

    closeContextMenu()
    setDialogState({
      type: 'rename',
      scope,
      entry,
      value: entry.name,
    })
  }

  function openDeleteEntry(scope: SftpScope, entry: FileEntry) {
    if (!entry || entry.parent) {
      return
    }

    closeContextMenu()
    setDialogState({
      type: 'delete',
      scope,
      entry,
      value: '',
    })
  }

  function openDeleteSelection(scope: SftpScope, entries: FileEntry[]) {
    const actionableEntries = collapseEntriesForDelete((entries || []).filter((entry) => entry && !entry.parent))
    if (actionableEntries.length === 0) {
      return
    }

    if (actionableEntries.length === 1) {
      openDeleteEntry(scope, actionableEntries[0])
      return
    }

    closeContextMenu()
    setDialogState({
      type: 'delete-batch',
      scope,
      entries: actionableEntries,
      value: '',
    })
  }

  function openTransferConflictDialog(direction: TransferDirection, state: {
    sourcePaths: string[]
    targetDirectory: string
    startIndex: number
    completedCount: number
  }) {
    const currentSourcePath = state.sourcePaths[state.startIndex]
    const sourceName = getBaseName(currentSourcePath)

    setDialogState({
      type: 'overwrite-transfer',
      direction,
      scope: direction === 'upload' ? 'local' : 'remote',
      targetScope: direction === 'upload' ? 'remote' : 'local',
      sourcePath: currentSourcePath,
      sourcePaths: state.sourcePaths,
      startIndex: state.startIndex,
      completedCount: state.completedCount,
      targetDirectory: state.targetDirectory,
      targetPath: joinTransferTargetPath(direction === 'upload' ? 'remote' : 'local', state.targetDirectory, sourceName),
      sourceName,
      targetName: sourceName,
    })
  }

  function closeDialog() {
    setDialogState(null)
  }

  function changeDialogValue(value: string) {
    setDialogState((current) => current ? { ...current, value } : current)
  }

  return {
    dialogState,
    dialogBusy,
    setDialogBusy,
    setDialogState,
    openCreateDirectory,
    openRenameEntry,
    openDeleteEntry,
    openDeleteSelection,
    openTransferConflictDialog,
    closeDialog,
    changeDialogValue,
  }
}
