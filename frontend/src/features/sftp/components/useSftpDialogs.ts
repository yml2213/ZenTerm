import { useState } from 'react'
import {
  collapseEntriesForDelete,
  getBaseName,
  joinTransferTargetPath,
  modeToOctal,
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

  function openExtractArchive(scope: SftpScope, entry: FileEntry, intoSubfolder = false) {
    if (!entry || entry.parent) return
    closeContextMenu()

    const parent = scope === 'remote' ? remoteListing?.path || '/' : localListing?.path || ''
    const baseNameWithoutExt = entry.name.replace(/(\.tar\.gz|\.tgz|\.zip|\.tar|\.gz|\.tar\.bz2|\.tbz2|\.tar\.xz|\.txz|\.7z|\.rar)$/i, '')
    const targetDir = intoSubfolder
      ? (scope === 'remote' ? (parent === '/' ? `/${baseNameWithoutExt}` : `${parent}/${baseNameWithoutExt}`) : `${parent}/${baseNameWithoutExt}`)
      : parent

    setDialogState({
      type: 'extract',
      scope,
      entry,
      parentPath: parent,
      extractTarget: targetDir,
      value: targetDir,
    })
  }

  function openCompressEntry(scope: SftpScope, entry: FileEntry, format: 'tar.gz' | 'zip' = 'tar.gz') {
    if (!entry || entry.parent) return
    closeContextMenu()

    const parent = scope === 'remote' ? remoteListing?.path || '/' : localListing?.path || ''
    const archiveName = `${entry.name}.${format}`

    setDialogState({
      type: 'compress',
      scope,
      entry,
      parentPath: parent,
      archiveFormat: format,
      value: archiveName,
    })
  }

  function openUploadFolderDialog(localFolderPath: string) {
    closeContextMenu()
    const folderName = localFolderPath.split(/[/\\]/).filter(Boolean).at(-1) || 'folder'
    setDialogState({
      type: 'upload-folder',
      scope: 'local',
      targetScope: 'remote',
      parentPath: remoteListing?.path || '/',
      sourcePath: localFolderPath,
      sourceName: folderName,
      autoCompress: true,
      value: folderName,
    })
  }

  function toggleDialogAutoCompress() {
    setDialogState((current) => current ? { ...current, autoCompress: !current.autoCompress } : current)
  }

  function openChmodEntry(scope: SftpScope, entry: FileEntry) {
    if (!entry || entry.parent) {
      return
    }

    closeContextMenu()
    setDialogState({
      type: 'chmod',
      scope,
      entry,
      value: entry.mode ? modeToOctal(entry.mode) : '0644',
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
    openExtractArchive,
    openCompressEntry,
    openUploadFolderDialog,
    openChmodEntry,
    toggleDialogAutoCompress,
    closeDialog,
    changeDialogValue,
  }
}

