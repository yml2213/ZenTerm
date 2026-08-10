import EntryDialog from './EntryDialog'
import type { ExtendedDialogState } from './useSftpDialogs'
import {
  createLocalDirectory,
  createRemoteDirectory,
  deleteLocalEntry,
  deleteRemoteEntry,
  renameLocalEntry,
  renameRemoteEntry,
} from '@/lib/backend'
import {
  buildActionSuccessMessage,
  type FileListing,
} from '../sftpUtils'
import { cmd } from '@/lib/backendModels'

type Host = cmd.Host
type SftpScope = 'local' | 'remote'
type TransferDirection = 'upload' | 'download'

interface Notice {
  tone: 'success' | 'error' | 'warning'
  message: string
}

interface ExecuteTransferOptions {
  sourcePaths?: string[]
  targetDirectory?: string
  startIndex?: number
  completedCount?: number
  overwriteCurrent?: boolean
}

interface SftpDialogControllerProps {
  state: ExtendedDialogState | null
  busy: boolean
  selectedHost: Host | null
  localListing: FileListing | null
  remoteListing: FileListing | null
  setBusy: (busy: boolean) => void
  setState: (state: ExtendedDialogState | null) => void
  closeDialog: () => void
  changeValue: (value: string) => void
  executeTransfer: (direction: TransferDirection, options?: ExecuteTransferOptions) => Promise<void>
  handleLocalNavigate: (path: string) => Promise<void>
  handleRemoteNavigate: (path: string) => Promise<void>
  clearScopeSelection: (scope: SftpScope) => void
  setNotice: (notice: Notice | null) => void
  onError: (message: string) => void
}

export default function SftpDialogController({
  state,
  busy,
  selectedHost,
  localListing,
  remoteListing,
  setBusy,
  setState,
  closeDialog,
  changeValue,
  executeTransfer,
  handleLocalNavigate,
  handleRemoteNavigate,
  clearScopeSelection,
  setNotice,
  onError,
}: SftpDialogControllerProps) {
  async function handleConfirm() {
    if (!state) {
      return
    }

    const currentDialog = state
    setBusy(true)
    try {
      if (currentDialog.type === 'overwrite-transfer') {
        await executeTransfer(currentDialog.direction!, {
          sourcePaths: currentDialog.sourcePaths,
          targetDirectory: currentDialog.targetDirectory,
          startIndex: currentDialog.startIndex,
          completedCount: currentDialog.completedCount,
          overwriteCurrent: true,
        })
        return
      }

      if (currentDialog.type === 'mkdir') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await createRemoteDirectory(selectedHost.id, currentDialog.parentPath!, currentDialog.value!)
          await handleRemoteNavigate(currentDialog.parentPath!)
        } else {
          await createLocalDirectory(currentDialog.parentPath!, currentDialog.value!)
          await handleLocalNavigate(currentDialog.parentPath!)
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('mkdir', currentDialog.scope, { name: currentDialog.value!.trim() }),
        })
      }

      if (currentDialog.type === 'rename') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await renameRemoteEntry(selectedHost.id, currentDialog.entry!.path, currentDialog.value!)
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          await renameLocalEntry(currentDialog.entry!.path, currentDialog.value!)
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('rename', currentDialog.scope, {
            entry: currentDialog.entry!,
            name: currentDialog.value!.trim(),
          }),
        })
      }

      if (currentDialog.type === 'delete') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await deleteRemoteEntry(selectedHost.id, currentDialog.entry!.path)
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          await deleteLocalEntry(currentDialog.entry!.path)
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('delete', currentDialog.scope, { entry: currentDialog.entry! }),
        })
      }

      if (currentDialog.type === 'delete-batch') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          for (const entry of currentDialog.entries!) {
            await deleteRemoteEntry(selectedHost.id, entry.path)
          }
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          for (const entry of currentDialog.entries!) {
            await deleteLocalEntry(entry.path)
          }
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('delete-batch', currentDialog.scope, { count: currentDialog.entries!.length }),
        })
      }

      setState(null)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryDialog
      state={state}
      busy={busy}
      onClose={closeDialog}
      onConfirm={handleConfirm}
      onChange={changeValue}
    />
  )
}
