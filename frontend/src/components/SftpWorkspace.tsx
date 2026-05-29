import {
  MonitorSmartphone,
  Server,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import ContextMenu from './sftp/ContextMenu'
import EntryDialog from './sftp/EntryDialog'
import FilePane from './sftp/FilePane'
import PaneEmptyState from './sftp/PaneEmptyState'
import {
  createLocalDirectory,
  createRemoteDirectory,
  deleteLocalEntry,
  deleteRemoteEntry,
  downloadFile,
  listLocalFiles,
  listRemoteFiles,
  renameLocalEntry,
  renameRemoteEntry,
  uploadFile,
} from '../lib/backend'
import {
  buildActionSuccessMessage,
  buildTransferNotice,
  collapseEntriesForDelete,
  defaultSort,
  filterVisibleEntries,
  findSelectedEntries,
  getBaseName,
  isTransferConflictError,
  joinTransferTargetPath,
  pickTransferableEntries,
  splitLocalPath,
  splitRemotePath,
  uniquePaths,
  type FileEntry,
  type FileListing,
  type SortConfig,
  type ContextMenuState,
  type DialogState,
} from '../lib/sftpUtils'
import { main } from '../wailsjs/wailsjs/go/models'

type Host = main.Host

interface ExtendedContextMenuState extends ContextMenuState {
  transferLabel?: string
  deleteSelectionLabel?: string
  hiddenFilesLabel?: string
}

interface ExtendedDialogState extends DialogState {
  value?: string
  direction?: 'upload' | 'download'
  sourcePath?: string
  sourcePaths?: string[]
  startIndex?: number
  completedCount?: number
  targetDirectory?: string
  targetPath?: string
}

interface Notice {
  tone: 'success' | 'error' | 'warning'
  message: string
}

interface SftpWorkspaceProps {
  hosts: Host[]
  selectedHost: Host | null
  vaultUnlocked: boolean
  onChooseHost: (hostId?: string | null) => void
  onCreateHost: () => void
  onBackToVaults: () => void
  onError: (message: string) => void
}

export default function SftpWorkspace({
  hosts,
  selectedHost,
  vaultUnlocked,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
  onError,
}: SftpWorkspaceProps) {
  const [localListing, setLocalListing] = useState<FileListing | null>(null)
  const [remoteListing, setRemoteListing] = useState<FileListing | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [remoteLoading, setRemoteLoading] = useState(Boolean(selectedHost && vaultUnlocked))
  const [showHiddenLocalFiles, setShowHiddenLocalFiles] = useState(false)
  const [showHiddenRemoteFiles, setShowHiddenRemoteFiles] = useState(false)
  const [selectedLocalPath, setSelectedLocalPath] = useState<string | null>(null)
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(null)
  const [selectedLocalPaths, setSelectedLocalPaths] = useState<string[]>([])
  const [selectedRemotePaths, setSelectedRemotePaths] = useState<string[]>([])
  const [localSelectionAnchor, setLocalSelectionAnchor] = useState<string | null>(null)
  const [remoteSelectionAnchor, setRemoteSelectionAnchor] = useState<string | null>(null)
  const [transferBusy, setTransferBusy] = useState<'upload' | 'download' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [localSort, setLocalSort] = useState<SortConfig>(defaultSort)
  const [remoteSort, setRemoteSort] = useState<SortConfig>(defaultSort)
  const [contextMenu, setContextMenu] = useState<ExtendedContextMenuState | null>(null)
  const [dialogState, setDialogState] = useState<ExtendedDialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)

  function toggleHiddenFiles(scope: 'local' | 'remote') {
    clearScopeSelection(scope)
    if (scope === 'remote') {
      setShowHiddenRemoteFiles((current) => !current)
      return
    }

    setShowHiddenLocalFiles((current) => !current)
  }

  function getShowHiddenState(scope: 'local' | 'remote'): boolean {
    return scope === 'remote' ? showHiddenRemoteFiles : showHiddenLocalFiles
  }

  function getVisibleListing(scope: 'local' | 'remote'): FileListing | null {
    const listing = scope === 'remote' ? remoteListing : localListing
    return listing
      ? { ...listing, entries: filterVisibleEntries(listing.entries, getShowHiddenState(scope)) }
      : listing
  }

  function clearScopeSelection(scope: 'local' | 'remote') {
    if (scope === 'remote') {
      setSelectedRemotePath(null)
      setSelectedRemotePaths([])
      setRemoteSelectionAnchor(null)
      return
    }

    setSelectedLocalPath(null)
    setSelectedLocalPaths([])
    setLocalSelectionAnchor(null)
  }

  function selectOnlyPath(scope: 'local' | 'remote', path: string | null) {
    if (scope === 'remote') {
      setSelectedRemotePath(path || null)
      setSelectedRemotePaths(path ? [path] : [])
      setRemoteSelectionAnchor(path || null)
      return
    }

    setSelectedLocalPath(path || null)
    setSelectedLocalPaths(path ? [path] : [])
    setLocalSelectionAnchor(path || null)
  }

  function togglePathSelection(scope: 'local' | 'remote', path: string) {
    const setter = scope === 'remote' ? setSelectedRemotePaths : setSelectedLocalPaths
    const setPrimary = scope === 'remote' ? setSelectedRemotePath : setSelectedLocalPath
    const setAnchor = scope === 'remote' ? setRemoteSelectionAnchor : setLocalSelectionAnchor

    setter((current) => {
      const exists = current.includes(path)
      const next = exists ? current.filter((item) => item !== path) : [...current, path]
      setPrimary(exists ? (next.at(-1) || null) : path)
      setAnchor(path)
      return next
    })
  }

  function selectRange(scope: 'local' | 'remote', path: string, orderedPaths: string[]) {
    const anchor = scope === 'remote' ? remoteSelectionAnchor : localSelectionAnchor
    const resolvedAnchor = orderedPaths.includes(anchor || '') ? anchor : path
    const anchorIndex = orderedPaths.indexOf(resolvedAnchor || '')
    const currentIndex = orderedPaths.indexOf(path)

    if (anchorIndex === -1 || currentIndex === -1) {
      selectOnlyPath(scope, path)
      return
    }

    const [start, end] = anchorIndex <= currentIndex
      ? [anchorIndex, currentIndex]
      : [currentIndex, anchorIndex]
    const nextPaths = orderedPaths.slice(start, end + 1)

    if (scope === 'remote') {
      setSelectedRemotePaths(nextPaths)
      setSelectedRemotePath(path)
      setRemoteSelectionAnchor(resolvedAnchor)
      return
    }

    setSelectedLocalPaths(nextPaths)
    setSelectedLocalPath(path)
    setLocalSelectionAnchor(resolvedAnchor)
  }

  function toggleAllSelection(scope: 'local' | 'remote', listing: FileListing | null) {
    const allPaths = uniquePaths((listing?.entries || []).map((entry) => entry.path))
    const currentPaths = scope === 'remote' ? selectedRemotePaths : selectedLocalPaths
    const allSelected = allPaths.length > 0 && allPaths.every((path) => currentPaths.includes(path))

    if (allSelected || allPaths.length === 0) {
      clearScopeSelection(scope)
      return
    }

    if (scope === 'remote') {
      setSelectedRemotePaths(allPaths)
      setSelectedRemotePath(allPaths.at(-1) || null)
      setRemoteSelectionAnchor(allPaths[0] || null)
      return
    }

    setSelectedLocalPaths(allPaths)
    setSelectedLocalPath(allPaths.at(-1) || null)
    setLocalSelectionAnchor(allPaths[0] || null)
  }

  useEffect(() => {
    let cancelled = false
    setLocalLoading(true)

    listLocalFiles('')
      .then((listing) => {
        if (!cancelled) {
          setLocalListing(listing)
          clearScopeSelection('local')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError((error as Error)?.message || String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLocalLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [onError])

  useEffect(() => {
    let cancelled = false

    if (!selectedHost || !vaultUnlocked) {
      setRemoteListing(null)
      setRemoteLoading(false)
      clearScopeSelection('remote')
      return () => {
        cancelled = true
      }
    }

    setRemoteLoading(true)
    listRemoteFiles(selectedHost.id, '')
      .then((listing) => {
        if (!cancelled) {
          setRemoteListing(listing)
          clearScopeSelection('remote')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError((error as Error)?.message || String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRemoteLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [onError, selectedHost, vaultUnlocked])

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    function closeMenu() {
      setContextMenu(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('click', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!notice) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setNotice(null)
    }, 3200)

    return () => window.clearTimeout(timer)
  }, [notice])

  function updateSort(scope: 'local' | 'remote', columnKey: string) {
    const setter = scope === 'remote' ? setRemoteSort : setLocalSort
    setter((current) => {
      const key = columnKey as SortConfig['key']
      return current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' }
    })
  }

  async function handleLocalNavigate(path: string) {
    setLocalLoading(true)
    try {
      const listing = await listLocalFiles(path)
      setLocalListing(listing)
      clearScopeSelection('local')
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setLocalLoading(false)
    }
  }

  async function handleRemoteNavigate(path: string) {
    if (!selectedHost) {
      return
    }

    setRemoteLoading(true)
    try {
      const listing = await listRemoteFiles(selectedHost.id, path)
      setRemoteListing(listing)
      clearScopeSelection('remote')
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setRemoteLoading(false)
    }
  }

  async function refreshScope(scope: 'local' | 'remote') {
    if (scope === 'remote') {
      await handleRemoteNavigate(remoteListing?.path || '')
      return
    }

    await handleLocalNavigate(localListing?.path || '')
  }

  function openCreateDirectory(scope: 'local' | 'remote') {
    setContextMenu(null)
    setDialogState({
      type: 'mkdir',
      scope,
      parentPath: scope === 'remote' ? remoteListing?.path || '/' : localListing?.path || '',
      value: '',
    })
  }

  function openRenameEntry(scope: 'local' | 'remote', entry: FileEntry) {
    if (!entry || entry.parent) {
      return
    }

    setContextMenu(null)
    setDialogState({
      type: 'rename',
      scope,
      entry,
      value: entry.name,
    })
  }

  function openDeleteEntry(scope: 'local' | 'remote', entry: FileEntry) {
    if (!entry || entry.parent) {
      return
    }

    setContextMenu(null)
    setDialogState({
      type: 'delete',
      scope,
      entry,
      value: '',
    })
  }

  function openDeleteSelection(scope: 'local' | 'remote', entries: FileEntry[]) {
    const actionableEntries = collapseEntriesForDelete((entries || []).filter((entry) => entry && !entry.parent))
    if (actionableEntries.length === 0) {
      return
    }

    if (actionableEntries.length === 1) {
      openDeleteEntry(scope, actionableEntries[0])
      return
    }

    setContextMenu(null)
    setDialogState({
      type: 'delete-batch',
      scope,
      entries: actionableEntries,
      value: '',
    })
  }

  function openTransferConflictDialog(direction: 'upload' | 'download', state: {
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

  async function executeTransfer(direction: 'upload' | 'download', options: {
    sourcePaths?: string[]
    targetDirectory?: string
    startIndex?: number
    completedCount?: number
    overwriteCurrent?: boolean
  } = {}) {
    const sourcePaths = uniquePaths(
      options.sourcePaths || (
        direction === 'upload'
          ? pickTransferableEntries(localListing, selectedLocalPaths).map((entry) => entry.path)
          : pickTransferableEntries(remoteListing, selectedRemotePaths).map((entry) => entry.path)
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
      setDialogState(null)
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

  async function handleDialogConfirm() {
    if (!dialogState) {
      return
    }

    const currentDialog = dialogState
    setDialogBusy(true)
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

      setDialogState(null)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setDialogBusy(false)
    }
  }

  function handleContextAction(action: string) {
    if (!contextMenu) {
      return
    }

    if (action === 'open' && contextMenu.entry?.isDir) {
      if (contextMenu.scope === 'remote') {
        handleRemoteNavigate(contextMenu.entry.path)
      } else {
        handleLocalNavigate(contextMenu.entry.path)
      }
      setContextMenu(null)
      return
    }

    if (action === 'refresh') {
      refreshScope(contextMenu.scope)
      setContextMenu(null)
      return
    }

    if (action === 'transfer') {
      if (contextMenu.scope === 'remote') {
        handleDownload()
      } else {
        handleUpload()
      }
      setContextMenu(null)
      return
    }

    if (action === 'clear-selection') {
      clearScopeSelection(contextMenu.scope)
      setContextMenu(null)
      return
    }

    if (action === 'mkdir') {
      openCreateDirectory(contextMenu.scope)
      return
    }

    if (action === 'rename') {
      openRenameEntry(contextMenu.scope, contextMenu.entry!)
      return
    }

    if (action === 'delete') {
      openDeleteEntry(contextMenu.scope, contextMenu.entry!)
      return
    }

    if (action === 'delete-selection') {
      const selectedEntries = contextMenu.scope === 'remote'
        ? findSelectedEntries(getVisibleListing('remote'), selectedRemotePaths)
        : findSelectedEntries(getVisibleListing('local'), selectedLocalPaths)
      openDeleteSelection(contextMenu.scope, selectedEntries)
      return
    }

    if (action === 'toggle-hidden-files') {
      toggleHiddenFiles(contextMenu.scope)
      setContextMenu(null)
    }
  }

  async function handleUpload() {
    await executeTransfer('upload')
  }

  async function handleDownload() {
    await executeTransfer('download')
  }

  const selectedLocalTransferableEntries = pickTransferableEntries(getVisibleListing('local'), selectedLocalPaths)
  const selectedRemoteTransferableEntries = pickTransferableEntries(getVisibleListing('remote'), selectedRemotePaths)
  const remoteHostSwitcher = selectedHost ? (
    <div
      className="sftp-host-switcher-group"
      title={`${selectedHost.name || selectedHost.id} · ${selectedHost.username}@${selectedHost.address}:${selectedHost.port || 22}`}
    >
      <Server size={14} />
      {hosts.length > 1 ? (
        <label className="sftp-host-switcher">
          <select
            aria-label="切换 SFTP 主机"
            value={selectedHost.id}
            onChange={(event) => onChooseHost(event.target.value)}
          >
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name || host.id}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="sftp-current-host-label">{selectedHost.name || selectedHost.id}</span>
      )}
      <button
        type="button"
        className="icon-button sftp-tab-close"
        aria-label="关闭远端"
        title="关闭远端"
        onClick={() => onChooseHost(null)}
      >
        <X size={14} />
      </button>
    </div>
  ) : null

  function openContextMenu(nextState: Omit<ContextMenuState, 'useSelectionActions' | 'selectionCount' | 'transferLabel' | 'canTransferSelection' | 'canClearSelection' | 'canDeleteSelection' | 'deleteSelectionLabel' | 'hiddenFilesLabel'>) {
    const scope = nextState.scope
    const selectedPaths = scope === 'remote' ? selectedRemotePaths : selectedLocalPaths
    const listing = getVisibleListing(scope)
    const selectedEntries = findSelectedEntries(listing, selectedPaths)
    const transferableEntries = pickTransferableEntries(listing, selectedPaths)
    const keepBatchSelection = selectedEntries.length > 1 && (!nextState.entry || selectedPaths.includes(nextState.entry.path))

    setContextMenu({
      ...nextState,
      useSelectionActions: keepBatchSelection,
      selectionCount: keepBatchSelection ? selectedEntries.length : 0,
      transferLabel: scope === 'remote'
        ? `下载所选 (${transferableEntries.length})`
        : `上传所选 (${transferableEntries.length})`,
      canTransferSelection: keepBatchSelection && transferableEntries.length > 0 && (
        scope === 'remote'
          ? Boolean(localListing?.path) && transferBusy === null
          : Boolean(selectedHost) && vaultUnlocked && transferBusy === null
      ),
      canClearSelection: keepBatchSelection,
      canDeleteSelection: keepBatchSelection,
      deleteSelectionLabel: `删除所选 (${selectedEntries.length})`,
      hiddenFilesLabel: getShowHiddenState(scope) ? '隐藏隐藏文件' : '显示隐藏文件',
    })
  }

  return (
    <section className="sftp-shell" aria-label="SFTP 工作区">
      {notice?.message ? (
        <div className="sftp-transfer-banner">
          <span className={`pill ${notice.tone || 'success'}`} aria-live="polite">{notice.message}</span>
        </div>
      ) : null}

      <div className="sftp-browser">
        <FilePane
          className="sftp-pane-local"
          scope="local"
          sourceLabel="Local"
          sourceIcon={MonitorSmartphone}
          listing={localListing}
          loading={localLoading}
          hostMeta="本机目录"
          showHiddenFiles={showHiddenLocalFiles}
          sort={localSort}
          onSortChange={(key) => updateSort('local', key)}
          onNavigate={handleLocalNavigate}
          onRefresh={() => handleLocalNavigate(localListing?.path || '')}
          breadcrumbItems={splitLocalPath(localListing?.path || '')}
          selectedPath={selectedLocalPath}
          selectedPaths={selectedLocalPaths}
          onSelectOnlyPath={(path) => selectOnlyPath('local', path)}
          onTogglePathSelection={(path) => togglePathSelection('local', path)}
          onSelectRange={(path, orderedPaths) => selectRange('local', path, orderedPaths)}
          onToggleAllSelection={() => toggleAllSelection('local', getVisibleListing('local'))}
          transferLabel={selectedHost ? '上传到远端' : null}
          transferBusy={transferBusy === 'upload'}
          transferDisabled={selectedLocalTransferableEntries.length === 0 || !selectedHost || !vaultUnlocked || transferBusy !== null}
          onTransfer={handleUpload}
          onCreateDirectory={() => openCreateDirectory('local')}
          onRenameEntry={(entry) => openRenameEntry('local', entry)}
          onDeleteEntry={(entry) => openDeleteEntry('local', entry)}
          onDeleteSelection={(entries) => openDeleteSelection('local', entries)}
          onClearSelection={() => clearScopeSelection('local')}
          onContextMenu={openContextMenu}
        />

        {selectedHost ? (
          vaultUnlocked ? (
            <FilePane
              className="sftp-pane-remote"
              scope="remote"
              sourceLabel="Remote"
              sourceIcon={Server}
              listing={remoteListing}
              loading={remoteLoading}
              hostLabel={selectedHost.name || selectedHost.id}
              hostMeta={`${selectedHost.username}@${selectedHost.address}:${selectedHost.port || 22}`}
              headerActions={remoteHostSwitcher}
              showHiddenFiles={showHiddenRemoteFiles}
              sort={remoteSort}
              onSortChange={(key) => updateSort('remote', key)}
              onNavigate={handleRemoteNavigate}
              onRefresh={() => handleRemoteNavigate(remoteListing?.path || '')}
              breadcrumbItems={splitRemotePath(remoteListing?.path || '/')}
              selectedPath={selectedRemotePath}
              selectedPaths={selectedRemotePaths}
              onSelectOnlyPath={(path) => selectOnlyPath('remote', path)}
              onTogglePathSelection={(path) => togglePathSelection('remote', path)}
              onSelectRange={(path, orderedPaths) => selectRange('remote', path, orderedPaths)}
              onToggleAllSelection={() => toggleAllSelection('remote', getVisibleListing('remote'))}
              transferLabel="下载到本地"
              transferBusy={transferBusy === 'download'}
              transferDisabled={selectedRemoteTransferableEntries.length === 0 || !localListing?.path || transferBusy !== null}
              onTransfer={handleDownload}
              onCreateDirectory={() => openCreateDirectory('remote')}
              onRenameEntry={(entry) => openRenameEntry('remote', entry)}
              onDeleteEntry={(entry) => openDeleteEntry('remote', entry)}
              onDeleteSelection={(entries) => openDeleteSelection('remote', entries)}
              onClearSelection={() => clearScopeSelection('remote')}
              onContextMenu={openContextMenu}
            />
          ) : (
            <PaneEmptyState
              sourceLabel="Remote"
              sourceIcon={Server}
              title="需要主密码"
              description="远端文件需要先完成一次主密码验证，才能使用已保存凭据建立 SFTP 连接。"
            />
          )
        ) : (
          <PaneEmptyState
            sourceLabel="Remote"
            sourceIcon={Server}
            title="先选择一个主机"
            description="选择要浏览的远端文件系统后，左右面板就会进入可传输的双栏工作区。"
            actions={(
              <div className="sftp-empty-actions">
                {hosts.length > 0 ? (
                  <button type="button" className="primary-button" onClick={() => onChooseHost()}>
                    选择主机
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={onCreateHost}>
                    新建主机
                  </button>
                )}
                <button type="button" className="ghost-button" onClick={onBackToVaults}>
                  返回 Vaults
                </button>
              </div>
            )}
            extra={hosts.length > 0 ? (
              <div className="sftp-host-picker-panel">
                <div className="sftp-host-picker-meta">
                  已保存 {hosts.length} 台主机，可滚动查看更多。
                </div>
                <div className="sftp-host-picker-scroll" aria-label="SFTP 主机列表">
                  <div className="sftp-host-picker">
                    {hosts.map((host) => (
                      <button
                        key={host.id}
                        type="button"
                        className="sftp-host-chip"
                        onClick={() => onChooseHost(host.id)}
                      >
                        <span>{host.name || host.id}</span>
                        <small>{host.username}@{host.address}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          />
        )}
      </div>

      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextAction}
      />

      <EntryDialog
        state={dialogState}
        busy={dialogBusy}
        onClose={() => setDialogState(null)}
        onConfirm={handleDialogConfirm}
        onChange={(value) => setDialogState((current) => current ? { ...current, value } : current)}
      />
    </section>
  )
}
