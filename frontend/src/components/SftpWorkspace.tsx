import {
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Home,
  LoaderCircle,
  MonitorSmartphone,
  PencilLine,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import ContextMenu from './sftp/ContextMenu'
import EntryDialog from './sftp/EntryDialog'
import PaneEmptyState from './sftp/PaneEmptyState'
import SortButton from './sftp/SortButton'
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
  buildRows,
  buildTransferNotice,
  collapseEntriesForDelete,
  defaultSort,
  filterVisibleEntries,
  findSelectedEntries,
  formatSize,
  formatTime,
  getBaseName,
  getEntryPermissionLabel,
  getEntryTypeLabel,
  isTransferConflictError,
  joinTransferTargetPath,
  pickTransferableEntries,
  sortRows,
  splitLocalPath,
  splitRemotePath,
  uniquePaths,
  type FileEntry,
  type FileListing,
  type SortConfig,
  type PathSegment as BreadcrumbItem,
  type ContextMenuState,
  type TransferResult,
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

interface FilePaneProps {
  className?: string
  scope: 'local' | 'remote'
  sourceLabel: string
  sourceIcon: LucideIcon
  listing: FileListing | null
  loading: boolean
  hostLabel?: string
  hostMeta?: string
  headerActions?: React.ReactNode
  showHiddenFiles: boolean
  sort: SortConfig
  onSortChange: (key: string) => void
  onNavigate: (path: string) => void
  onRefresh: () => void
  breadcrumbItems: BreadcrumbItem[]
  selectedPath: string | null
  selectedPaths: string[]
  onSelectOnlyPath: (path: string | null) => void
  onTogglePathSelection: (path: string) => void
  onSelectRange: (path: string, orderedPaths: string[]) => void
  onToggleAllSelection: () => void
  transferLabel: string | null
  transferBusy: boolean
  transferDisabled: boolean
  onTransfer: () => void
  onCreateDirectory: () => void
  onRenameEntry: (entry: FileEntry) => void
  onDeleteEntry: (entry: FileEntry) => void
  onDeleteSelection: (entries: FileEntry[]) => void
  onClearSelection: () => void
  onContextMenu: (state: Omit<ContextMenuState, 'transferLabel' | 'deleteSelectionLabel' | 'hiddenFilesLabel'>) => void
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

function FilePane({
  className = '',
  scope,
  sourceLabel,
  sourceIcon: SourceIcon,
  listing,
  loading,
  hostLabel,
  hostMeta,
  headerActions = null,
  showHiddenFiles,
  sort,
  onSortChange,
  onNavigate,
  onRefresh,
  breadcrumbItems,
  selectedPath,
  selectedPaths,
  onSelectOnlyPath,
  onTogglePathSelection,
  onSelectRange,
  onToggleAllSelection,
  transferLabel,
  transferBusy,
  transferDisabled,
  onTransfer,
  onCreateDirectory,
  onRenameEntry,
  onDeleteEntry,
  onDeleteSelection,
  onClearSelection,
  onContextMenu,
}: FilePaneProps) {
  const visibleEntries = useMemo(
    () => filterVisibleEntries(listing?.entries, showHiddenFiles),
    [listing, showHiddenFiles],
  )
  const rawRows = useMemo(
    () => buildRows(listing ? { ...listing, entries: visibleEntries } : listing),
    [listing, visibleEntries],
  )
  const rows = useMemo(() => sortRows(rawRows, sort), [rawRows, sort])
  const selectedEntries = useMemo(
    () => findSelectedEntries(listing ? { ...listing, entries: visibleEntries } : listing, selectedPaths),
    [listing, selectedPaths, visibleEntries],
  )
  const selectedTransferableEntries = useMemo(
    () => pickTransferableEntries(listing ? { ...listing, entries: visibleEntries } : listing, selectedPaths),
    [listing, selectedPaths, visibleEntries],
  )
  const singleSelectedEntry = selectedEntries.length === 1 ? selectedEntries[0] : null
  const selectablePaths = useMemo(
    () => uniquePaths(visibleEntries.map((entry) => entry.path)),
    [visibleEntries],
  )
  const orderedSelectablePaths = useMemo(
    () => rows.filter((entry) => !entry.parent).map((entry) => entry.path),
    [rows],
  )
  const allSelected = selectablePaths.length > 0 && selectablePaths.every((path) => selectedPaths.includes(path))
  const showSelectionControls = selectedPaths.length > 1
  const paneClassName = ['sftp-pane', className].filter(Boolean).join(' ')
  const transferActionLabel = !transferLabel
    ? null
    : selectedTransferableEntries.length > 1
      ? `${transferLabel.includes('上传') ? '上传所选' : '下载所选'}`
      : transferLabel.includes('上传')
        ? '上传'
        : '下载'
  const transferActionAriaLabel = !transferLabel
    ? null
    : selectedTransferableEntries.length > 1
      ? `${transferLabel.includes('上传') ? '上传所选' : '下载所选'} (${selectedTransferableEntries.length})`
      : transferLabel
  const sourceMetaTitle = [hostLabel, hostMeta].filter(Boolean).join(' · ') || sourceLabel
  const transferIcon = transferActionLabel?.includes('上传') ? <Upload size={15} /> : <Download size={15} />

  function handleRowClick(event: React.MouseEvent, entry: FileEntry) {
    if (entry.parent) {
      onSelectOnlyPath(entry.path)
      return
    }

    if (event.shiftKey) {
      onSelectRange(entry.path, orderedSelectablePaths)
      return
    }

    if (event.metaKey || event.ctrlKey) {
      onTogglePathSelection(entry.path)
      return
    }

    if (selectedPaths.length === 1 && selectedPaths[0] === entry.path) {
      onSelectOnlyPath(null)
      return
    }

    onSelectOnlyPath(entry.path)
  }

  return (
    <section className={paneClassName}>
      <header className="sftp-pane-topbar">
        <div className="sftp-pane-tabbar">
          <div className="sftp-pane-tab" title={sourceMetaTitle}>
            {headerActions || (
              <>
                <SourceIcon size={14} />
                <span>{sourceLabel}</span>
              </>
            )}
          </div>
        </div>

        <div className="sftp-pane-toolbar">
          <div className="sftp-breadcrumb-scroll">
            <nav className="sftp-breadcrumb" aria-label={`${sourceLabel} 路径`}>
              {breadcrumbItems.map((item, index) => (
                <button
                  key={`${item.path}-${index}`}
                  type="button"
                  className={`sftp-breadcrumb-link${index === breadcrumbItems.length - 1 ? ' active' : ''}`}
                  onClick={() => onNavigate(item.path)}
                >
                  {index === 0 && item.label === '/' ? <Home size={14} /> : <span>{item.label}</span>}
                  {index < breadcrumbItems.length - 1 ? <ChevronRight size={14} /> : null}
                </button>
              ))}
            </nav>
          </div>

          <div className="sftp-pane-topbar-actions">
            {selectedEntries.length > 0 ? (
              <span className="visually-hidden">
                {selectedEntries.length === 1 && selectedTransferableEntries.length === 1 ? '已选文件' : `已选 ${selectedEntries.length} 项`}
              </span>
            ) : null}

            {selectedEntries.length > 0 ? (
              <span className="pill subtle sftp-selection-pill">
                {selectedEntries.length === 1 && selectedTransferableEntries.length === 1 ? '已选文件' : `已选 ${selectedEntries.length} 项`}
              </span>
            ) : null}

            <div className="sftp-toolbar-actions">
              {selectedEntries.length > 1 ? (
                <button
                  type="button"
                  className="icon-button sftp-tool-button"
                  aria-label="清空选择"
                  title="清空选择"
                  onClick={onClearSelection}
                >
                  <X size={15} />
                </button>
              ) : null}

              <button
                type="button"
                className="icon-button sftp-tool-button"
                aria-label="新建目录"
                title="新建目录"
                onClick={onCreateDirectory}
              >
                <Plus size={15} />
              </button>

              {singleSelectedEntry && !singleSelectedEntry.parent ? (
                <button
                  type="button"
                  className="icon-button sftp-tool-button"
                  aria-label="重命名"
                  title="重命名"
                  onClick={() => onRenameEntry(singleSelectedEntry)}
                >
                  <PencilLine size={15} />
                </button>
              ) : null}

              {selectedEntries.length > 0 ? (
                <button
                  type="button"
                  className="icon-button sftp-tool-button danger-outline"
                  aria-label={selectedEntries.length > 1 ? `删除所选 (${selectedEntries.length})` : '删除'}
                  title={selectedEntries.length > 1 ? `删除所选 (${selectedEntries.length})` : '删除'}
                  onClick={() => (
                    selectedEntries.length > 1
                      ? onDeleteSelection(selectedEntries)
                      : onDeleteEntry(singleSelectedEntry!)
                  )}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}

              {transferActionLabel ? (
                <button
                  type="button"
                  className="icon-button sftp-tool-button"
                  aria-label={transferActionAriaLabel || ''}
                  title={transferActionAriaLabel || ''}
                  disabled={transferDisabled}
                  onClick={onTransfer}
                >
                  {transferBusy ? <LoaderCircle size={15} className="spin" /> : transferIcon}
                </button>
              ) : null}
            </div>

            {loading ? (
              <span className="pill subtle">
                <LoaderCircle size={13} className="spin" />
                加载中
              </span>
            ) : null}

            <button
              type="button"
              className="icon-button sftp-pane-refresh"
              aria-label={`刷新 ${sourceLabel}`}
              title={`刷新 ${sourceLabel}`}
              onClick={onRefresh}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </header>

      <div className="sftp-file-table">
        <div className={`sftp-file-head${showSelectionControls ? ' has-selection' : ''}`}>
          {showSelectionControls ? (
            <button
              type="button"
              className={`sftp-select-all${allSelected ? ' active' : ''}`}
              onClick={onToggleAllSelection}
              disabled={selectablePaths.length === 0}
              aria-label={allSelected ? `取消全选${sourceLabel}` : `全选${sourceLabel}`}
              title={allSelected ? '取消全选' : '全选'}
            >
              <span className="sftp-checkbox-mark">{allSelected ? '✓' : ''}</span>
            </button>
          ) : null}
          <SortButton className="sftp-col-name" columnKey="name" label="名称" sort={sort} onSortChange={onSortChange} />
          <SortButton className="sftp-col-time" columnKey="modTime" label="修改时间" sort={sort} onSortChange={onSortChange} />
          <SortButton className="sftp-col-size" columnKey="size" label="大小" sort={sort} onSortChange={onSortChange} />
          <SortButton className="sftp-col-type" columnKey="type" label="类型" sort={sort} onSortChange={onSortChange} />
        </div>

        <div
          className="sftp-file-body"
          onContextMenu={(event) => {
            if (event.target instanceof Element && event.target.closest('.sftp-file-row')) {
              return
            }

            event.preventDefault()
            onContextMenu({
              scope,
              entry: undefined,
              x: event.clientX,
              y: event.clientY,
              useSelectionActions: false,
              selectionCount: 0,
              canTransferSelection: false,
              canClearSelection: false,
              canDeleteSelection: false,
            })
          }}
        >
          {rows.length === 0 ? (
            <div className="sftp-file-empty">
              <strong>当前目录为空</strong>
              <small>可右键打开工作区菜单，快速新建目录或刷新</small>
            </div>
          ) : rows.map((entry) => {
            const rowLabel = `${entry.name}，${getEntryTypeLabel(entry)}`
            const selected = selectedPaths.includes(entry.path)

            return (
              <div
                key={`${entry.path}-${entry.name}`}
                role="button"
                tabIndex={0}
                className={`sftp-file-row${showSelectionControls ? ' has-selection' : ''}${entry.parent ? ' is-parent' : ''}${selected ? ' selected' : ''}${selectedPath === entry.path ? ' focused' : ''}`}
                aria-label={rowLabel}
                title={entry.name}
                onClick={(event) => handleRowClick(event, entry)}
                onDoubleClick={() => {
                  if (entry.isDir) {
                    onNavigate(entry.path)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!selected || selectedEntries.length <= 1) {
                    onSelectOnlyPath(entry.path)
                  }
                  onContextMenu({
                    scope,
                    entry,
                    x: event.clientX,
                    y: event.clientY,
                    useSelectionActions: false,
                    selectionCount: 0,
                    canTransferSelection: false,
                    canClearSelection: false,
                    canDeleteSelection: false,
                  })
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    if (entry.isDir) {
                      onNavigate(entry.path)
                    } else {
                      onSelectOnlyPath(entry.path)
                    }
                  }
                }}
              >
                {showSelectionControls ? (
                  entry.parent ? (
                    <span className="sftp-select-spacer" />
                  ) : (
                    <button
                      type="button"
                      className={`sftp-row-select${selected ? ' active' : ''}`}
                      aria-label={selected ? `取消选择 ${entry.name}` : `选择 ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (event.shiftKey) {
                          onSelectRange(entry.path, orderedSelectablePaths)
                          return
                        }
                        onTogglePathSelection(entry.path)
                      }}
                    >
                      <span className="sftp-checkbox-mark">{selected ? '✓' : ''}</span>
                    </button>
                  )
                ) : null}

                <div className="sftp-file-name sftp-col-name">
                  <span className={`sftp-file-icon${entry.isDir || entry.parent ? ' is-dir' : ' is-file'}`}>
                    {entry.parent ? <FolderOpen size={16} /> : entry.isDir ? <Folder size={16} /> : <FileText size={16} />}
                  </span>
                  <div className="sftp-file-copy">
                    <strong>{entry.name}</strong>
                    <small title={getEntryPermissionLabel(entry)}>{getEntryPermissionLabel(entry)}</small>
                  </div>
                </div>
                <span className="sftp-col-time" title={entry.modTime || '--'}>{formatTime(entry.modTime)}</span>
                <span className="sftp-col-size">{formatSize(entry.size, entry.isDir)}</span>
                <span className="sftp-col-type">{getEntryTypeLabel(entry)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <footer className="sftp-pane-footer">
        <span>
          {visibleEntries.length} 个项目
          {selectedEntries.length > 0 ? ` · 已选 ${selectedEntries.length} 项` : ''}
          {!showHiddenFiles ? ' · 已隐藏 . 开头项目' : ''}
        </span>
        <span className="sftp-pane-footer-path" title={listing?.path || '--'}>{listing?.path || '--'}</span>
      </footer>
    </section>
  )
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
  const [localLoading, setLocalLoading] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
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

