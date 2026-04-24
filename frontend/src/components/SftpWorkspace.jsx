import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  LoaderCircle,
  MonitorSmartphone,
  PencilLine,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
} from '../lib/backend.js'

const defaultSort = { key: 'name', direction: 'asc' }

function getScopeLabel(scope) {
  return scope === 'remote' ? '远端' : '本地'
}

function isHiddenEntry(entry) {
  return Boolean(entry && !entry.parent && entry.name?.startsWith('.'))
}

function filterVisibleEntries(entries, showHiddenFiles) {
  if (showHiddenFiles) {
    return entries || []
  }

  return (entries || []).filter((entry) => !isHiddenEntry(entry))
}

function splitLocalPath(path) {
  const normalized = path || ''
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return [{ label: '/', path: '/' }]
  }

  return [
    { label: '/', path: '/' },
    ...parts.map((segment, index) => ({
      label: segment,
      path: `/${parts.slice(0, index + 1).join('/')}`,
    })),
  ]
}

function splitRemotePath(path) {
  const normalized = path || '/'
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return [{ label: '/', path: '/' }]
  }

  return [
    { label: '/', path: '/' },
    ...parts.map((segment, index) => ({
      label: segment,
      path: `/${parts.slice(0, index + 1).join('/')}`,
    })),
  ]
}

function formatSize(size, isDir) {
  if (isDir) {
    return '--'
  }

  if (!Number.isFinite(size) || size < 1024) {
    return `${Math.max(size, 0)} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size
  let unitIndex = -1
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatTime(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-')
}

function buildRows(listing) {
  const rows = listing?.entries || []
  if (!listing?.parentPath) {
    return rows
  }

  return [
    {
      name: '..',
      path: listing.parentPath,
      size: 0,
      modTime: '',
      type: 'dir',
      isDir: true,
      parent: true,
    },
    ...rows,
  ]
}

function getEntryTypeLabel(entry) {
  if (entry.parent) {
    return '返回上级'
  }

  if (entry.isDir) {
    return '文件夹'
  }

  if (entry.type === 'symlink') {
    return '链接'
  }

  if (entry.type === 'other') {
    return '特殊'
  }

  return '文件'
}

function getEntryKindLabel(entry) {
  if (entry?.parent || entry?.isDir) {
    return '目录'
  }

  return '文件'
}

function getEntryPermissionLabel(entry) {
  if (entry?.parent) {
    return '双击返回上级目录'
  }

  return entry?.mode || getEntryTypeLabel(entry)
}

function isTransferConflictError(error) {
  const message = error?.message || String(error || '')
  return message === 'transfer target already exists'
}

function getBaseName(path) {
  const normalized = String(path || '').replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) || normalized || '--'
}

function joinTransferTargetPath(scope, directory, name) {
  if (!directory) {
    return name
  }

  if (scope === 'remote') {
    const prefix = directory.endsWith('/') ? directory.slice(0, -1) : directory
    return `${prefix || ''}/${name}` || `/${name}`
  }

  const prefix = directory.endsWith('/') ? directory.slice(0, -1) : directory
  return `${prefix}/${name}`
}

function uniquePaths(paths) {
  return Array.from(new Set((paths || []).filter(Boolean)))
}

function normalizeComparePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/\/+$/, '') || '/'
}

function isNestedUnderDirectory(childPath, parentPath) {
  const child = normalizeComparePath(childPath)
  const parent = normalizeComparePath(parentPath)
  return child !== parent && child.startsWith(`${parent}/`)
}

function collapseEntriesForDelete(entries) {
  const sorted = [...entries].sort((left, right) => {
    const leftWeight = left.isDir ? 0 : 1
    const rightWeight = right.isDir ? 0 : 1

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight
    }

    return normalizeComparePath(left.path).length - normalizeComparePath(right.path).length
  })

  return sorted.filter((entry, index) => (
    !sorted.slice(0, index).some((candidate) => candidate.isDir && isNestedUnderDirectory(entry.path, candidate.path))
  ))
}

function buildActionSuccessMessage(type, scope, payload = {}) {
  const scopeLabel = getScopeLabel(scope)

  if (type === 'mkdir') {
    return `已在${scopeLabel}创建目录 ${payload.name}`
  }

  if (type === 'rename') {
    return `已重命名${scopeLabel}${payload.entry?.isDir ? '目录' : '文件'}为 ${payload.name}`
  }

  if (type === 'delete') {
    return `已删除${scopeLabel}${payload.entry?.isDir ? '目录' : '文件'} ${payload.entry?.name}`
  }

  if (type === 'delete-batch') {
    return `已删除${scopeLabel} ${payload.count} 个条目`
  }

  return ''
}

function buildTransferNotice(direction, count, targetDirectory, lastResult) {
  if (count === 1 && lastResult) {
    return `已${direction === 'upload' ? '上传' : '下载'} ${lastResult.sourcePath.split('/').at(-1)} → ${lastResult.targetPath}`
  }

  return `已${direction === 'upload' ? '上传' : '下载'} ${count} 个文件到 ${targetDirectory}`
}

function buildDialogDescription(state) {
  const scopeLabel = getScopeLabel(state.scope)
  const entryKind = getEntryKindLabel(state.entry)

  if (state.type === 'overwrite-transfer') {
    return `目标${getScopeLabel(state.targetScope)}文件 ${state.targetName} 已存在。确认后将用 ${state.sourceName} 覆盖现有文件。`
  }

  if (state.type === 'delete-batch') {
    const total = state.entries?.length || 0
    const dirCount = (state.entries || []).filter((entry) => entry.isDir).length
    const dirSuffix = dirCount > 0 ? `，其中 ${dirCount} 个目录会递归删除` : ''
    return `将删除${scopeLabel}已选 ${total} 个条目${dirSuffix}，此操作不可撤销。`
  }

  if (state.type === 'delete') {
    if (state.entry?.isDir) {
      return `将递归删除${scopeLabel}${entryKind} ${state.entry?.name}，包含其下全部内容，此操作不可撤销。`
    }

    return `将删除${scopeLabel}${entryKind} ${state.entry?.name}，此操作不可撤销。`
  }

  if (state.type === 'rename') {
    return `请输入${scopeLabel}${entryKind} ${state.entry?.name} 的新名称。`
  }

  return `将在当前${scopeLabel}目录 ${state.parentPath || '--'} 下创建新文件夹。`
}

function getContextMenuTitle(state) {
  if (state.useSelectionActions) {
    return `${getScopeLabel(state.scope)}已选 ${state.selectionCount} 项`
  }

  if (state.entry?.parent) {
    return '上级目录'
  }

  if (state.entry) {
    return state.entry.name
  }

  return `${getScopeLabel(state.scope)}当前目录`
}

function getContextMenuPosition(state) {
  const menuWidth = 196
  const actionCount = state.useSelectionActions
    ? [
        state.canTransferSelection,
        state.canClearSelection,
        state.canDeleteSelection,
        true,
        true,
        true,
      ].filter(Boolean).length
    : [
        state.entry?.isDir,
        true,
        state.entry && !state.entry.parent,
        state.entry && !state.entry.parent,
        true,
        true,
      ].filter(Boolean).length
  const separatorCount = state.useSelectionActions ? 1 : 1
  const menuHeight = 22 + actionCount * 38 + separatorCount * 9
  const maxX = Math.max(12, window.innerWidth - menuWidth - 12)
  const maxY = Math.max(12, window.innerHeight - menuHeight - 12)

  return {
    left: Math.min(state.x, maxX),
    top: Math.min(state.y, maxY),
  }
}

function sortRows(rows, sort) {
  const parentRows = rows.filter((entry) => entry.parent)
  const normalRows = rows.filter((entry) => !entry.parent)
  const direction = sort.direction === 'desc' ? -1 : 1

  normalRows.sort((left, right) => {
    if (left.isDir !== right.isDir) {
      return left.isDir ? -1 : 1
    }

    let compare = 0
    switch (sort.key) {
      case 'modTime': {
        compare = new Date(left.modTime || 0).getTime() - new Date(right.modTime || 0).getTime()
        break
      }
      case 'size': {
        compare = (left.size || 0) - (right.size || 0)
        break
      }
      case 'type': {
        compare = getEntryTypeLabel(left).localeCompare(getEntryTypeLabel(right), 'zh-CN')
        break
      }
      default: {
        compare = left.name.localeCompare(right.name, 'zh-CN', { sensitivity: 'base' })
        break
      }
    }

    if (compare === 0) {
      compare = left.name.localeCompare(right.name, 'zh-CN', { sensitivity: 'base' })
    }

    return compare * direction
  })

  return [...parentRows, ...normalRows]
}

function findSelectedEntry(listing, selectedPath) {
  if (!selectedPath) {
    return null
  }

  if (listing?.parentPath && listing.parentPath === selectedPath) {
    return {
      name: '..',
      path: listing.parentPath,
      size: 0,
      modTime: '',
      type: 'dir',
      isDir: true,
      parent: true,
    }
  }

  return (listing?.entries || []).find((entry) => entry.path === selectedPath) || null
}

function findSelectedEntries(listing, selectedPaths) {
  const pathSet = new Set(uniquePaths(selectedPaths))
  if (pathSet.size === 0) {
    return []
  }

  return (listing?.entries || []).filter((entry) => pathSet.has(entry.path))
}

function pickTransferableEntries(listing, selectedPaths) {
  return findSelectedEntries(listing, selectedPaths).filter((entry) => !entry.isDir)
}

function SortButton({ columnKey, label, sort, onSortChange, className = '' }) {
  const isActive = sort.key === columnKey

  return (
    <button
      type="button"
      className={`sftp-head-sort${isActive ? ' active' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onSortChange(columnKey)}
    >
      <span>{label}</span>
      {isActive ? (
        <ChevronDown size={13} className={`sftp-sort-indicator${sort.direction === 'desc' ? ' desc' : ''}`} />
      ) : null}
    </button>
  )
}

function EntryDialog({ state, busy, onClose, onConfirm, onChange }) {
  if (!state) {
    return null
  }

  const isDelete = state.type === 'delete'
  const isDeleteBatch = state.type === 'delete-batch'
  const isRename = state.type === 'rename'
  const isCreate = state.type === 'mkdir'
  const isOverwriteTransfer = state.type === 'overwrite-transfer'
  const title = isCreate
    ? `在${getScopeLabel(state.scope)}创建目录`
    : isOverwriteTransfer
      ? `${state.direction === 'upload' ? '上传' : '下载'}覆盖确认`
      : isDeleteBatch
        ? `删除${getScopeLabel(state.scope)}所选条目`
        : isRename
          ? `重命名${getScopeLabel(state.scope)}条目`
          : `删除${getScopeLabel(state.scope)}条目`

  const confirmLabel = isCreate
    ? '确认创建'
    : isOverwriteTransfer
      ? '覆盖并继续'
      : isDeleteBatch
        ? '删除所选'
        : isRename
          ? '确认重命名'
          : '确认删除'

  const description = buildDialogDescription(state)
  const hideInput = isDelete || isDeleteBatch || isOverwriteTransfer

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-narrow sftp-action-modal">
        <div className="modal-eyebrow">
          <span className="panel-kicker">SFTP</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭操作弹窗">
            ×
          </button>
        </div>

        <div className="sftp-action-dialog-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>

        {hideInput ? null : (
          <label className="modal-form-stack">
            <span>{isCreate ? '目录名称' : '新名称'}</span>
            <input
              autoFocus
              value={state.value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={isCreate ? '例如 logs' : '请输入新名称'}
            />
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={`primary-button${isDelete || isDeleteBatch ? ' danger' : ''}${isOverwriteTransfer ? ' warning' : ''}`}
            onClick={onConfirm}
            disabled={busy || (!hideInput && !String(state.value || '').trim())}
          >
            {busy ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContextMenu({ state, onClose, onAction }) {
  if (!state) {
    return null
  }

  const position = getContextMenuPosition(state)

  return (
    <div
      className="sftp-context-menu"
      role="menu"
      aria-label={`${getScopeLabel(state.scope)}${state.entry ? '条目' : '工作区'}菜单`}
      style={position}
    >
      <div className="sftp-context-menu-title">{getContextMenuTitle(state)}</div>
      {state.useSelectionActions ? (
        <>
          {state.canTransferSelection ? (
            <button type="button" role="menuitem" onClick={() => onAction('transfer')}>
              {state.transferLabel}
            </button>
          ) : null}
          {state.canClearSelection ? (
            <button type="button" role="menuitem" onClick={() => onAction('clear-selection')}>
              清空选择
            </button>
          ) : null}
          {state.canDeleteSelection ? (
            <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete-selection')}>
              {state.deleteSelectionLabel}
            </button>
          ) : null}
        </>
      ) : state.entry?.isDir ? (
        <button type="button" role="menuitem" onClick={() => onAction('open')}>
          打开目录
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={() => onAction('mkdir')}>
        新建目录
      </button>
      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" onClick={() => onAction('rename')}>
          重命名
        </button>
      ) : null}
      {!state.useSelectionActions && state.entry && !state.entry.parent ? (
        <button type="button" role="menuitem" className="danger" onClick={() => onAction('delete')}>
          删除
        </button>
      ) : null}
      <button type="button" role="menuitem" onClick={() => onAction('refresh')}>
        刷新
      </button>
      <button type="button" role="menuitem" onClick={() => onAction('toggle-hidden-files')}>
        {state.hiddenFilesLabel}
      </button>
      <div className="sftp-context-menu-separator" />
      <button type="button" role="menuitem" onClick={onClose}>
        关闭菜单
      </button>
    </div>
  )
}

function PaneEmptyState({
  sourceLabel,
  sourceIcon: SourceIcon,
  title,
  description,
  actions = null,
  extra = null,
}) {
  return (
    <section className="sftp-pane">
      <header className="sftp-pane-topbar">
        <div className="sftp-pane-topbar-main">
          <div className="sftp-pane-source">
            <span className="sftp-pane-source-icon">
              <SourceIcon size={15} />
            </span>
            <div className="sftp-pane-source-copy">
              <strong>{sourceLabel}</strong>
              <span>文件浏览器</span>
            </div>
          </div>
        </div>
      </header>

      <div className="sftp-empty-state">
        <div className="sftp-empty-icon">
          <HardDrive size={24} />
        </div>
        <div className="sftp-empty-copy">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        {actions}
        {extra}
      </div>
    </section>
  )
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
}) {
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

  function handleRowClick(event, entry) {
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
        <div className="sftp-pane-topbar-main">
          <div className="sftp-pane-source">
            <span className="sftp-pane-source-icon">
              <SourceIcon size={15} />
            </span>
            <div className="sftp-pane-source-copy">
              <strong>{sourceLabel}</strong>
              <span>{hostLabel || '当前目录浏览'}</span>
            </div>
          </div>

          {hostMeta ? <span className="sftp-pane-host-meta">{hostMeta}</span> : null}
        </div>

        <div className="sftp-pane-topbar-actions">
          {headerActions}

          {selectedEntries.length > 0 ? (
            <span className="visually-hidden">
              {selectedEntries.length === 1 && selectedTransferableEntries.length === 1 ? '已选文件' : `已选 ${selectedEntries.length} 项`}
            </span>
          ) : null}

          {selectedEntries.length > 1 ? (
            <button type="button" className="ghost-button" onClick={onClearSelection}>
              清空选择
            </button>
          ) : null}

          <button type="button" className="ghost-button" onClick={onCreateDirectory}>
            <Plus size={14} />
            新建目录
          </button>

          {singleSelectedEntry && !singleSelectedEntry.parent ? (
            <button type="button" className="ghost-button" onClick={() => onRenameEntry(singleSelectedEntry)}>
              <PencilLine size={14} />
              重命名
            </button>
          ) : null}

          {selectedEntries.length > 0 ? (
            <button
              type="button"
              className="ghost-button danger-outline"
              onClick={() => (
                selectedEntries.length > 1
                  ? onDeleteSelection(selectedEntries)
                  : onDeleteEntry(singleSelectedEntry)
              )}
            >
              <Trash2 size={14} />
              {selectedEntries.length > 1 ? `删除所选 (${selectedEntries.length})` : '删除'}
            </button>
          ) : null}

          {transferActionLabel ? (
            <button
              type="button"
              className="ghost-button"
              aria-label={transferActionAriaLabel}
              disabled={transferDisabled}
              onClick={onTransfer}
            >
              {transferBusy ? <LoaderCircle size={14} className="spin" /> : null}
              {transferActionLabel}
            </button>
          ) : null}

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
      </header>

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
      </div>

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
            if (event.target.closest('.sftp-file-row')) {
              return
            }

            event.preventDefault()
            onContextMenu({
              scope,
              entry: null,
              x: event.clientX,
              y: event.clientY,
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
}) {
  const [localListing, setLocalListing] = useState(null)
  const [remoteListing, setRemoteListing] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [showHiddenLocalFiles, setShowHiddenLocalFiles] = useState(false)
  const [showHiddenRemoteFiles, setShowHiddenRemoteFiles] = useState(false)
  const [selectedLocalPath, setSelectedLocalPath] = useState(null)
  const [selectedRemotePath, setSelectedRemotePath] = useState(null)
  const [selectedLocalPaths, setSelectedLocalPaths] = useState([])
  const [selectedRemotePaths, setSelectedRemotePaths] = useState([])
  const [localSelectionAnchor, setLocalSelectionAnchor] = useState(null)
  const [remoteSelectionAnchor, setRemoteSelectionAnchor] = useState(null)
  const [transferBusy, setTransferBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [localSort, setLocalSort] = useState(defaultSort)
  const [remoteSort, setRemoteSort] = useState(defaultSort)
  const [contextMenu, setContextMenu] = useState(null)
  const [dialogState, setDialogState] = useState(null)
  const [dialogBusy, setDialogBusy] = useState(false)

  function toggleHiddenFiles(scope) {
    clearScopeSelection(scope)
    if (scope === 'remote') {
      setShowHiddenRemoteFiles((current) => !current)
      return
    }

    setShowHiddenLocalFiles((current) => !current)
  }

  function getShowHiddenState(scope) {
    return scope === 'remote' ? showHiddenRemoteFiles : showHiddenLocalFiles
  }

  function getVisibleListing(scope) {
    const listing = scope === 'remote' ? remoteListing : localListing
    return listing
      ? { ...listing, entries: filterVisibleEntries(listing.entries, getShowHiddenState(scope)) }
      : listing
  }

  function clearScopeSelection(scope) {
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

  function selectOnlyPath(scope, path) {
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

  function togglePathSelection(scope, path) {
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

  function selectRange(scope, path, orderedPaths) {
    const anchor = scope === 'remote' ? remoteSelectionAnchor : localSelectionAnchor
    const resolvedAnchor = orderedPaths.includes(anchor) ? anchor : path
    const anchorIndex = orderedPaths.indexOf(resolvedAnchor)
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

  function toggleAllSelection(scope, listing) {
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
      .catch((error) => {
        if (!cancelled) {
          onError(error?.message || String(error))
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
      .catch((error) => {
        if (!cancelled) {
          onError(error?.message || String(error))
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

    function handleKeyDown(event) {
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

  function updateSort(scope, columnKey) {
    const setter = scope === 'remote' ? setRemoteSort : setLocalSort
    setter((current) => (
      current.key === columnKey
        ? { key: columnKey, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: columnKey, direction: columnKey === 'name' ? 'asc' : 'desc' }
    ))
  }

  async function handleLocalNavigate(path) {
    setLocalLoading(true)
    try {
      const listing = await listLocalFiles(path)
      setLocalListing(listing)
      clearScopeSelection('local')
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setLocalLoading(false)
    }
  }

  async function handleRemoteNavigate(path) {
    if (!selectedHost) {
      return
    }

    setRemoteLoading(true)
    try {
      const listing = await listRemoteFiles(selectedHost.id, path)
      setRemoteListing(listing)
      clearScopeSelection('remote')
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setRemoteLoading(false)
    }
  }

  async function refreshScope(scope) {
    if (scope === 'remote') {
      await handleRemoteNavigate(remoteListing?.path || '')
      return
    }

    await handleLocalNavigate(localListing?.path || '')
  }

  function openCreateDirectory(scope) {
    setContextMenu(null)
    setDialogState({
      type: 'mkdir',
      scope,
      parentPath: scope === 'remote' ? remoteListing?.path || '/' : localListing?.path || '',
      value: '',
    })
  }

  function openRenameEntry(scope, entry) {
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

  function openDeleteEntry(scope, entry) {
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

  function openDeleteSelection(scope, entries) {
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

  function openTransferConflictDialog(direction, state) {
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

  async function executeTransfer(direction, options = {}) {
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
        message: buildTransferNotice(direction, totalCount, targetDirectory, results.at(-1)),
      })
    } catch (error) {
      onError(error?.message || String(error))
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
        await executeTransfer(currentDialog.direction, {
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
          await createRemoteDirectory(selectedHost.id, currentDialog.parentPath, currentDialog.value)
          await handleRemoteNavigate(currentDialog.parentPath)
        } else {
          await createLocalDirectory(currentDialog.parentPath, currentDialog.value)
          await handleLocalNavigate(currentDialog.parentPath)
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('mkdir', currentDialog.scope, { name: currentDialog.value.trim() }),
        })
      }

      if (currentDialog.type === 'rename') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await renameRemoteEntry(selectedHost.id, currentDialog.entry.path, currentDialog.value)
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          await renameLocalEntry(currentDialog.entry.path, currentDialog.value)
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('rename', currentDialog.scope, {
            entry: currentDialog.entry,
            name: currentDialog.value.trim(),
          }),
        })
      }

      if (currentDialog.type === 'delete') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await deleteRemoteEntry(selectedHost.id, currentDialog.entry.path)
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          await deleteLocalEntry(currentDialog.entry.path)
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('delete', currentDialog.scope, { entry: currentDialog.entry }),
        })
      }

      if (currentDialog.type === 'delete-batch') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          for (const entry of currentDialog.entries) {
            await deleteRemoteEntry(selectedHost.id, entry.path)
          }
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          for (const entry of currentDialog.entries) {
            await deleteLocalEntry(entry.path)
          }
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('delete-batch', currentDialog.scope, { count: currentDialog.entries.length }),
        })
      }

      setDialogState(null)
    } catch (error) {
      onError(error?.message || String(error))
    } finally {
      setDialogBusy(false)
    }
  }

  function handleContextAction(action) {
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
      openRenameEntry(contextMenu.scope, contextMenu.entry)
      return
    }

    if (action === 'delete') {
      openDeleteEntry(contextMenu.scope, contextMenu.entry)
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
  const remoteHostSwitcher = hosts.length > 1 && selectedHost ? (
    <label className="sftp-host-switcher">
      <span>主机</span>
      <select
        aria-label="切换 SFTP 主机"
        value={selectedHost.id}
        onChange={(event) => onChooseHost(event.target.value)}
      >
        {hosts.map((host) => (
          <option key={host.id} value={host.id}>
            {(host.name || host.id)} · {host.username}@{host.address}:{host.port || 22}
          </option>
        ))}
      </select>
    </label>
  ) : null

  function openContextMenu(nextState) {
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
              <div className="sftp-host-picker">
                {hosts.slice(0, 6).map((host) => (
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
