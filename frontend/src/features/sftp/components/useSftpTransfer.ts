import { useEffect, useMemo, useState } from 'react'
import { downloadFile, uploadFile } from '@/lib/backend'
import {
  buildTransferNotice,
  isTransferConflictError,
  pickTransferableEntries,
  uniquePaths,
  type FileListing,
} from '../sftpUtils'
import { cmd } from '@/wailsjs/wailsjs/go/models'

type Host = cmd.Host
type SftpScope = 'local' | 'remote'
type TransferDirection = 'upload' | 'download'

interface Notice {
  tone: 'success' | 'error' | 'warning'
  message: string
}

interface TransferConflictState {
  sourcePaths: string[]
  targetDirectory: string
  startIndex: number
  completedCount: number
}

interface ExecuteTransferOptions {
  sourcePaths?: string[]
  targetDirectory?: string
  startIndex?: number
  completedCount?: number
  overwriteCurrent?: boolean
}

interface UseSftpTransferProps {
  selectedHost: Host | null
  localListing: FileListing | null
  remoteListing: FileListing | null
  selectedLocalPaths: string[]
  selectedRemotePaths: string[]
  handleLocalNavigate: (path: string) => Promise<void>
  handleRemoteNavigate: (path: string) => Promise<void>
  clearScopeSelection: (scope: SftpScope) => void
  openTransferConflictDialog: (direction: TransferDirection, state: TransferConflictState) => void
  closeDialog: () => void
  onError: (message: string) => void
}

export function useSftpTransfer({
  selectedHost,
  localListing,
  remoteListing,
  selectedLocalPaths,
  selectedRemotePaths,
  handleLocalNavigate,
  handleRemoteNavigate,
  clearScopeSelection,
  openTransferConflictDialog,
  closeDialog,
  onError,
}: UseSftpTransferProps) {
  const [transferBusy, setTransferBusy] = useState<TransferDirection | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const selectedLocalTransferableEntries = useMemo(
    () => pickTransferableEntries(localListing, selectedLocalPaths),
    [localListing, selectedLocalPaths],
  )
  const selectedRemoteTransferableEntries = useMemo(
    () => pickTransferableEntries(remoteListing, selectedRemotePaths),
    [remoteListing, selectedRemotePaths],
  )

  useEffect(() => {
    if (!notice) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setNotice(null)
    }, 3200)

    return () => window.clearTimeout(timer)
  }, [notice])

  async function executeTransfer(direction: TransferDirection, options: ExecuteTransferOptions = {}) {
    const sourcePaths = uniquePaths(
      options.sourcePaths || (
        direction === 'upload'
          ? selectedLocalTransferableEntries.map((entry) => entry.path)
          : selectedRemoteTransferableEntries.map((entry) => entry.path)
      ),
    )
    const targetDirectory = options.targetDirectory || (direction === 'upload' ? remoteListing?.path : localListing?.path)
    const startIndex = options.startIndex || 0
    const completedCount = options.completedCount || 0
    const overwriteCurrent = Boolean(options.overwriteCurrent)

    if (!selectedHost || !targetDirectory || sourcePaths.length === 0) {
      return
    }

    setTransferBusy(direction)
    if (startIndex === 0 && completedCount === 0) {
      setNotice(null)
    }

    try {
      const results = []

      for (let index = startIndex; index < sourcePaths.length; index += 1) {
        const sourcePath = sourcePaths[index]
        const overwrite = overwriteCurrent && index === startIndex

        try {
          const result = direction === 'upload'
            ? await uploadFile(selectedHost.id, sourcePath, targetDirectory, overwrite)
            : await downloadFile(selectedHost.id, sourcePath, targetDirectory, overwrite)
          results.push(result)
        } catch (error) {
          if (!overwrite && isTransferConflictError(error)) {
            openTransferConflictDialog(direction, {
              sourcePaths,
              targetDirectory,
              startIndex: index,
              completedCount: completedCount + results.length,
            })
            return
          }

          throw error
        }
      }

      if (direction === 'upload') {
        await handleRemoteNavigate(targetDirectory)
        clearScopeSelection('local')
      } else {
        await handleLocalNavigate(targetDirectory)
        clearScopeSelection('remote')
      }

      const totalCount = completedCount + results.length
      closeDialog()
      setNotice({
        tone: 'success',
        message: buildTransferNotice(direction, totalCount, targetDirectory, results.at(-1) || null),
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setTransferBusy(null)
    }
  }

  async function handleUpload() {
    await executeTransfer('upload')
  }

  async function handleDownload() {
    await executeTransfer('download')
  }

  return {
    transferBusy,
    notice,
    setNotice,
    selectedLocalTransferableEntries,
    selectedRemoteTransferableEntries,
    executeTransfer,
    handleUpload,
    handleDownload,
  }
}
