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
import * as AppAPI from '@/wailsjs/wailsjs/go/cmd/App'


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

      if (currentDialog.type === 'extract') {
        const targetDir = currentDialog.value || currentDialog.extractTarget || currentDialog.parentPath || ''
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) return
          await AppAPI.ExtractRemoteArchive(selectedHost.id, currentDialog.entry!.path, targetDir)
          await handleRemoteNavigate(remoteListing?.path || '')
        } else {
          await AppAPI.ExtractLocalArchive(currentDialog.entry!.path, targetDir)
          await handleLocalNavigate(localListing?.path || '')
        }

        setNotice({
          tone: 'success',
          message: `已成功解压 ${currentDialog.entry!.name} 到 ${targetDir}`,
        })
      }

      if (currentDialog.type === 'compress') {
        const parent = currentDialog.parentPath || ''
        const archiveName = currentDialog.value || `${currentDialog.entry!.name}.tar.gz`
        const targetArchivePath = currentDialog.scope === 'remote'
          ? (parent === '/' ? `/${archiveName}` : `${parent}/${archiveName}`)
          : `${parent}/${archiveName}`

        if (currentDialog.scope === 'remote') {
          if (!selectedHost) return
          await AppAPI.CompressRemoteEntry(selectedHost.id, currentDialog.entry!.path, targetArchivePath)
          await handleRemoteNavigate(remoteListing?.path || '')
        } else {
          await AppAPI.CompressLocalEntry(currentDialog.entry!.path, targetArchivePath)
          await handleLocalNavigate(localListing?.path || '')
        }

        setNotice({
          tone: 'success',
          message: `已成功压缩生成 ${archiveName}`,
        })
      }

      if (currentDialog.type === 'upload-folder') {
        if (!selectedHost || !currentDialog.sourcePath || !currentDialog.parentPath) return
        await AppAPI.UploadDirectory(
          selectedHost.id,
          currentDialog.sourcePath,
          currentDialog.parentPath,
          Boolean(currentDialog.autoCompress),
          true
        )
        await handleRemoteNavigate(remoteListing?.path || '')
        setNotice({
          tone: 'success',
          message: `已成功上传文件夹 ${currentDialog.sourceName}`,
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
      onToggleAutoCompress={() => {
        if (state && state.type === 'upload-folder') {
          setState({ ...state, autoCompress: !state.autoCompress })
        }
      }}
    />
  )
}

