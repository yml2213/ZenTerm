import { useCallback, useState } from 'react'
import { uniquePaths, type FileListing } from '../../lib/sftpUtils'

type SftpScope = 'local' | 'remote'

export function useSftpSelection() {
  const [selectedLocalPath, setSelectedLocalPath] = useState<string | null>(null)
  const [selectedRemotePath, setSelectedRemotePath] = useState<string | null>(null)
  const [selectedLocalPaths, setSelectedLocalPaths] = useState<string[]>([])
  const [selectedRemotePaths, setSelectedRemotePaths] = useState<string[]>([])
  const [localSelectionAnchor, setLocalSelectionAnchor] = useState<string | null>(null)
  const [remoteSelectionAnchor, setRemoteSelectionAnchor] = useState<string | null>(null)

  const clearScopeSelection = useCallback((scope: SftpScope) => {
    if (scope === 'remote') {
      setSelectedRemotePath(null)
      setSelectedRemotePaths([])
      setRemoteSelectionAnchor(null)
      return
    }

    setSelectedLocalPath(null)
    setSelectedLocalPaths([])
    setLocalSelectionAnchor(null)
  }, [])

  const selectOnlyPath = useCallback((scope: SftpScope, path: string | null) => {
    if (scope === 'remote') {
      setSelectedRemotePath(path || null)
      setSelectedRemotePaths(path ? [path] : [])
      setRemoteSelectionAnchor(path || null)
      return
    }

    setSelectedLocalPath(path || null)
    setSelectedLocalPaths(path ? [path] : [])
    setLocalSelectionAnchor(path || null)
  }, [])

  const togglePathSelection = useCallback((scope: SftpScope, path: string) => {
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
  }, [])

  const selectRange = useCallback((scope: SftpScope, path: string, orderedPaths: string[]) => {
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
  }, [localSelectionAnchor, remoteSelectionAnchor, selectOnlyPath])

  const toggleAllSelection = useCallback((scope: SftpScope, listing: FileListing | null) => {
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
  }, [clearScopeSelection, selectedLocalPaths, selectedRemotePaths])

  return {
    selectedLocalPath,
    selectedRemotePath,
    selectedLocalPaths,
    selectedRemotePaths,
    clearScopeSelection,
    selectOnlyPath,
    togglePathSelection,
    selectRange,
    toggleAllSelection,
  }
}
