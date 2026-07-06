import { useCallback, useEffect, useState } from 'react'
import { listLocalFiles, listRemoteFiles } from '@/lib/backend'
import {
  defaultSort,
  filterVisibleEntries,
  type FileListing,
  type SortConfig,
} from '../sftpUtils'
import { cmd } from '@/wailsjs/wailsjs/go/models'

type Host = cmd.Host
type SftpScope = 'local' | 'remote'

interface UseSftpListingProps {
  selectedHost: Host | null
  vaultUnlocked: boolean
  onError: (message: string) => void
  clearScopeSelection: (scope: SftpScope) => void
}

export function useSftpListing({
  selectedHost,
  vaultUnlocked,
  onError,
  clearScopeSelection,
}: UseSftpListingProps) {
  const [localListing, setLocalListing] = useState<FileListing | null>(null)
  const [remoteListing, setRemoteListing] = useState<FileListing | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [remoteLoading, setRemoteLoading] = useState(Boolean(selectedHost && vaultUnlocked))
  const [showHiddenLocalFiles, setShowHiddenLocalFiles] = useState(false)
  const [showHiddenRemoteFiles, setShowHiddenRemoteFiles] = useState(false)
  const [localSort, setLocalSort] = useState<SortConfig>(defaultSort)
  const [remoteSort, setRemoteSort] = useState<SortConfig>(defaultSort)

  const handleLocalNavigate = useCallback(async (path: string) => {
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
  }, [clearScopeSelection, onError])

  const handleRemoteNavigate = useCallback(async (path: string) => {
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
  }, [clearScopeSelection, onError, selectedHost])

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
  }, [clearScopeSelection, onError])

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
  }, [clearScopeSelection, onError, selectedHost, vaultUnlocked])

  const toggleHiddenFiles = useCallback((scope: SftpScope) => {
    clearScopeSelection(scope)
    if (scope === 'remote') {
      setShowHiddenRemoteFiles((current) => !current)
      return
    }

    setShowHiddenLocalFiles((current) => !current)
  }, [clearScopeSelection])

  const getShowHiddenState = useCallback((scope: SftpScope): boolean => {
    return scope === 'remote' ? showHiddenRemoteFiles : showHiddenLocalFiles
  }, [showHiddenRemoteFiles, showHiddenLocalFiles])

  // 直接内联 showHidden 而非调用 getShowHiddenState，避免函数引用变化连带导致 useMemo 失效 / inline showHidden instead of calling getShowHiddenState so a stable dependency list keeps downstream useMemo valid.
  const getVisibleListing = useCallback((scope: SftpScope): FileListing | null => {
    const listing = scope === 'remote' ? remoteListing : localListing
    const showHidden = scope === 'remote' ? showHiddenRemoteFiles : showHiddenLocalFiles
    return listing
      ? { ...listing, entries: filterVisibleEntries(listing.entries, showHidden) }
      : listing
  }, [remoteListing, localListing, showHiddenRemoteFiles, showHiddenLocalFiles])

  const updateSort = useCallback((scope: SftpScope, columnKey: string) => {
    const setter = scope === 'remote' ? setRemoteSort : setLocalSort
    setter((current) => {
      const key = columnKey as SortConfig['key']
      return current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' }
    })
  }, [])

  const refreshScope = useCallback(async (scope: SftpScope) => {
    if (scope === 'remote') {
      await handleRemoteNavigate(remoteListing?.path || '')
      return
    }

    await handleLocalNavigate(localListing?.path || '')
  }, [handleRemoteNavigate, handleLocalNavigate, remoteListing, localListing])

  return {
    localListing,
    remoteListing,
    localLoading,
    remoteLoading,
    showHiddenLocalFiles,
    showHiddenRemoteFiles,
    localSort,
    remoteSort,
    toggleHiddenFiles,
    getShowHiddenState,
    getVisibleListing,
    updateSort,
    handleLocalNavigate,
    handleRemoteNavigate,
    refreshScope,
  }
}
