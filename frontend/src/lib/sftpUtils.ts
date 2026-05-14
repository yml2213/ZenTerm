export interface FileEntry {
  name: string
  path: string
  size: number
  modTime: string
  type: string
  isDir: boolean
  parent?: boolean
  mode?: string
}

export interface FileListing {
  path: string
  parentPath?: string
  entries: FileEntry[]
}

export interface PathSegment {
  label: string
  path: string
}

export interface SortConfig {
  key: 'name' | 'modTime' | 'size' | 'type'
  direction: 'asc' | 'desc'
}

export interface ContextMenuState {
  scope: 'local' | 'remote'
  entry?: FileEntry
  x: number
  y: number
  useSelectionActions: boolean
  selectionCount: number
  canTransferSelection: boolean
  canClearSelection: boolean
  canDeleteSelection: boolean
}

export interface DialogState {
  type: 'mkdir' | 'rename' | 'delete' | 'delete-batch' | 'overwrite-transfer'
  scope: 'local' | 'remote'
  entry?: FileEntry
  entries?: FileEntry[]
  parentPath?: string
  targetScope?: 'local' | 'remote'
  targetName?: string
  sourceName?: string
}

export interface TransferResult {
  sourcePath: string
  targetPath: string
}

export const defaultSort: SortConfig = { key: 'name', direction: 'asc' }

export function getScopeLabel(scope: 'local' | 'remote'): string {
  return scope === 'remote' ? '远端' : '本地'
}

export function isHiddenEntry(entry: FileEntry | null | undefined): boolean {
  return Boolean(entry && !entry.parent && entry.name?.startsWith('.'))
}

export function filterVisibleEntries(entries: FileEntry[] | null | undefined, showHiddenFiles: boolean): FileEntry[] {
  if (showHiddenFiles) {
    return entries || []
  }

  return (entries || []).filter((entry) => !isHiddenEntry(entry))
}

export function splitLocalPath(path: string | null | undefined): PathSegment[] {
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

export function splitRemotePath(path: string | null | undefined): PathSegment[] {
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

export function formatSize(size: number, isDir: boolean): string {
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

export function formatTime(value: string | null | undefined): string {
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

export function buildRows(listing: FileListing | null | undefined): FileEntry[] {
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

export function getEntryTypeLabel(entry: FileEntry): string {
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

export function getEntryKindLabel(entry: FileEntry | null | undefined): string {
  if (entry?.parent || entry?.isDir) {
    return '目录'
  }

  return '文件'
}

export function getEntryPermissionLabel(entry: FileEntry | null | undefined): string {
  if (entry?.parent) {
    return '双击返回上级目录'
  }

  return entry?.mode || getEntryTypeLabel(entry!)
}

export function isTransferConflictError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? (error as Error).message : String(error || '')
  return message === 'transfer target already exists'
}

export function getBaseName(path: string | null | undefined): string {
  const normalized = String(path || '').replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) || normalized || '--'
}

export function joinTransferTargetPath(scope: 'local' | 'remote', directory: string, name: string): string {
  if (!directory) {
    return name
  }

  if (scope === 'remote') {
    const prefix = directory.endsWith('/') ? directory.slice(0, -1) : directory
    return `${prefix}/${name}`
  }

  const prefix = directory.endsWith('/') ? directory.slice(0, -1) : directory
  return `${prefix}/${name}`
}

export function uniquePaths(paths: (string | null | undefined)[]): string[] {
  return Array.from(new Set((paths || []).filter(Boolean) as string[]))
}

function normalizeComparePath(path: string | null | undefined): string {
  return String(path || '').replace(/\\/g, '/').replace(/\/+$/, '') || '/'
}

function isNestedUnderDirectory(childPath: string, parentPath: string): boolean {
  const child = normalizeComparePath(childPath)
  const parent = normalizeComparePath(parentPath)
  return child !== parent && child.startsWith(`${parent}/`)
}

export function collapseEntriesForDelete(entries: FileEntry[]): FileEntry[] {
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

export function buildActionSuccessMessage(
  type: 'mkdir' | 'rename' | 'delete' | 'delete-batch',
  scope: 'local' | 'remote',
  payload: { name?: string; entry?: FileEntry; count?: number } = {}
): string {
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

export function buildTransferNotice(
  direction: 'upload' | 'download',
  count: number,
  targetDirectory: string,
  lastResult: TransferResult | null
): string {
  if (count === 1 && lastResult) {
    return `已${direction === 'upload' ? '上传' : '下载'} ${lastResult.sourcePath.split('/').at(-1)} → ${lastResult.targetPath}`
  }

  return `已${direction === 'upload' ? '上传' : '下载'} ${count} 个文件到 ${targetDirectory}`
}

export function buildDialogDescription(state: DialogState): string {
  const scopeLabel = getScopeLabel(state.scope)
  const entryKind = getEntryKindLabel(state.entry)

  if (state.type === 'overwrite-transfer') {
    return `目标${getScopeLabel(state.targetScope!)}文件 ${state.targetName} 已存在。确认后将用 ${state.sourceName} 覆盖现有文件。`
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

export function getContextMenuTitle(state: ContextMenuState): string {
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

export function getContextMenuPosition(state: ContextMenuState): { left: number; top: number } {
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

export function sortRows(rows: FileEntry[], sort: SortConfig): FileEntry[] {
  const parentRows = rows.filter((entry) => entry.parent)
  const normalRows = rows.filter((entry) => !entry.parent)
  const direction = sort.direction === 'desc' ? -1 : 1

  normalRows.sort((left, right) => {
    if (left.isDir !== right.isDir) {
      return left.isDir ? -1 : 1
    }

    const compareBySortKey = (() => {
      switch (sort.key) {
        case 'modTime': {
          return new Date(left.modTime || 0).getTime() - new Date(right.modTime || 0).getTime()
        }
        case 'size': {
          return (left.size || 0) - (right.size || 0)
        }
        case 'type': {
          return getEntryTypeLabel(left).localeCompare(getEntryTypeLabel(right), 'zh-CN')
        }
        default: {
          return left.name.localeCompare(right.name, 'zh-CN', { sensitivity: 'base' })
        }
      }
    })()

    const compare = compareBySortKey === 0
      ? left.name.localeCompare(right.name, 'zh-CN', { sensitivity: 'base' })
      : compareBySortKey

    return compare * direction
  })

  return [...parentRows, ...normalRows]
}

export function findSelectedEntry(listing: FileListing | null | undefined, selectedPath: string | null | undefined): FileEntry | null {
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

export function findSelectedEntries(listing: FileListing | null | undefined, selectedPaths: string[]): FileEntry[] {
  const pathSet = new Set(uniquePaths(selectedPaths))
  if (pathSet.size === 0) {
    return []
  }

  return (listing?.entries || []).filter((entry) => pathSet.has(entry.path))
}

export function pickTransferableEntries(listing: FileListing | null | undefined, selectedPaths: string[]): FileEntry[] {
  return findSelectedEntries(listing, selectedPaths).filter((entry) => !entry.isDir)
}
