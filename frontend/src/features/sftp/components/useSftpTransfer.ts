import { useEffect, useMemo, useRef, useState } from 'react'
import { cancelFileTransfer, downloadFile, onRuntimeEvent, uploadDirectory, uploadFile } from '@/lib/backend'
import {
  buildTransferNotice,
  isTransferConflictError,
  pickTransferableEntries,
  uniquePaths,
  type FileListing,
  type TransferProgressEvent,
} from '../sftpUtils'
import { cmd } from '@/lib/backendModels'

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

export interface DirectoryUploadOptions {
  sourcePath: string
  parentPath: string
  sourceName: string
  autoCompress: boolean
}

// TransferProgressView 供 banner 展示的传输进度视图 / progress view consumed by the transfer banner.
export interface TransferProgressView {
  fileName: string
  doneBytes: number
  totalBytes: number
  percent: number
  speedBps?: number
  phase?: 'compress' | 'copy'
}

// ProgressContext 记录当前传输在事件聚合时需要的上下文 / context needed to aggregate progress events.
interface ProgressContext {
  mode: 'batch' | 'directory'
  totalBytes: number
  doneBefore: number
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

function baseName(path: string | null | undefined): string {
  const trimmed = String(path || '').replace(/\\/g, '/').split('/').filter(Boolean)
  return trimmed.at(-1) || ''
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
  const [transferProgress, setTransferProgress] = useState<TransferProgressView | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const cancelRequestedRef = useRef(false)
  const transferIdRef = useRef('')
  const progressCtxRef = useRef<ProgressContext | null>(null)

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

  // 订阅后端进度事件；只接受当前传输 id 的快照，避免取消/失败后的旧事件串扰。
  useEffect(() => {
    return onRuntimeEvent('sftp:transfer-progress', (payload) => {
      const data = payload as TransferProgressEvent
      if (!data || typeof data !== 'object' || data.transferId !== transferIdRef.current) {
        return
      }
      const ctx = progressCtxRef.current
      if (!ctx) {
        return
      }

      if (ctx.mode === 'directory') {
        setTransferProgress({
          fileName: data.fileName || '',
          doneBytes: data.doneBytes ?? 0,
          totalBytes: data.totalBytes ?? 0,
          percent: data.percent ?? 0,
          speedBps: data.speedBps,
          phase: data.phase,
        })
        return
      }

      const overallDone = ctx.doneBefore + (data.doneBytes ?? 0)
      setTransferProgress({
        fileName: data.fileName || '',
        doneBytes: overallDone,
        totalBytes: ctx.totalBytes,
        percent: ctx.totalBytes > 0 ? Math.min(100, (overallDone / ctx.totalBytes) * 100) : 0,
        speedBps: data.speedBps,
      })
    })
  }, [])

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

    // 用所选条目的 size 汇总批总量，并计算已完成的基线字节（冲突续传场景）。
    const sizes = new Map<string, number>()
    const sourceEntries = direction === 'upload'
      ? selectedLocalTransferableEntries
      : selectedRemoteTransferableEntries
    for (const entry of sourceEntries) {
      sizes.set(entry.path, entry.size || 0)
    }

    let doneBefore = 0
    let totalBytes = 0
    sourcePaths.forEach((path, index) => {
      const size = sizes.get(path) || 0
      totalBytes += size
      if (index < startIndex) {
        doneBefore += size
      }
    })

    const transferId = crypto.randomUUID()
    transferIdRef.current = transferId
    progressCtxRef.current = { mode: 'batch', totalBytes, doneBefore }

    setTransferBusy(direction)
    setTransferProgress({
      fileName: baseName(sourcePaths[startIndex]) || '',
      doneBytes: doneBefore,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(100, (doneBefore / totalBytes) * 100) : 0,
    })
    cancelRequestedRef.current = false
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
            ? await uploadFile(selectedHost.id, sourcePath, targetDirectory, overwrite, transferId)
            : await downloadFile(selectedHost.id, sourcePath, targetDirectory, overwrite, transferId)
          results.push(result)
          if (progressCtxRef.current) {
            progressCtxRef.current.doneBefore += sizes.get(sourcePath) || 0
          }
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
      if (cancelRequestedRef.current) {
        setNotice({ tone: 'warning', message: '文件传输已取消。' })
        return
      }
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setTransferBusy(null)
      setTransferProgress(null)
      transferIdRef.current = ''
      progressCtxRef.current = null
    }
  }

  // 目录上传：压缩/递归整体走后端批内进度，事件值直接用于展示。
  async function executeDirectoryUpload(options: DirectoryUploadOptions) {
    if (!selectedHost) {
      return
    }

    const transferId = crypto.randomUUID()
    transferIdRef.current = transferId
    progressCtxRef.current = { mode: 'directory', totalBytes: 0, doneBefore: 0 }
    cancelRequestedRef.current = false

    setTransferBusy('upload')
    setTransferProgress({
      fileName: options.sourceName,
      doneBytes: 0,
      totalBytes: 0,
      percent: 0,
      phase: 'compress',
    })

    try {
      await uploadDirectory(
        selectedHost.id,
        options.sourcePath,
        options.parentPath,
        options.autoCompress,
        true,
        transferId,
      )
      await handleRemoteNavigate(options.parentPath)
      setNotice({ tone: 'success', message: `已成功上传文件夹 ${options.sourceName}` })
    } catch (error) {
      if (cancelRequestedRef.current) {
        setNotice({ tone: 'warning', message: '文件传输已取消。' })
        return
      }
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setTransferBusy(null)
      setTransferProgress(null)
      transferIdRef.current = ''
      progressCtxRef.current = null
    }
  }

  async function handleUpload() {
    await executeTransfer('upload')
  }

  async function handleDownload() {
    await executeTransfer('download')
  }

  async function handleCancelTransfer() {
    if (!selectedHost || !transferBusy) {
      return
    }

    cancelRequestedRef.current = true
    try {
      await cancelFileTransfer(selectedHost.id)
    } catch (error) {
      cancelRequestedRef.current = false
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    transferBusy,
    transferProgress,
    notice,
    setNotice,
    selectedLocalTransferableEntries,
    selectedRemoteTransferableEntries,
    executeTransfer,
    executeDirectoryUpload,
    handleUpload,
    handleDownload,
    handleCancelTransfer,
  }
}