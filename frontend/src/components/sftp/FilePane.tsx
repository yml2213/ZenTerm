import {
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Home,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type MouseEvent, type ReactNode } from 'react'
import {
  buildRows,
  filterVisibleEntries,
  findSelectedEntries,
  formatSize,
  formatTime,
  getEntryPermissionLabel,
  getEntryTypeLabel,
  pickTransferableEntries,
  sortRows,
  uniquePaths,
  type ContextMenuState,
  type FileEntry,
  type FileListing,
  type PathSegment as BreadcrumbItem,
  type SortConfig,
} from '../../lib/sftpUtils'
import SortButton from './SortButton'

interface FilePaneProps {
  className?: string
  scope: 'local' | 'remote'
  sourceLabel: string
  sourceIcon: LucideIcon
  listing: FileListing | null
  loading: boolean
  hostLabel?: string
  hostMeta?: string
  headerActions?: ReactNode
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

export default function FilePane({
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

  function handleRowClick(event: MouseEvent, entry: FileEntry) {
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
          {loading && !listing ? (
            <div className="sftp-file-empty">
              <strong>正在加载目录</strong>
              <small>正在读取 {sourceLabel} 文件列表</small>
            </div>
          ) : rows.length === 0 ? (
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
