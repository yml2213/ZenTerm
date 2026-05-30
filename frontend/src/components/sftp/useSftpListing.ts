import { useCallback, useEffect, useState } from 'react'
import { listLocalFiles, listRemoteFiles } from '../../lib/backend'
import {
  defaultSort,
  filterVisibleEntries,
  type FileListing,
  type SortConfig,
} from '../../lib/sftpUtils'
import { main } from '../../wailsjs/wailsjs/go/models'

type Host = main.Host
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

  function toggleHiddenFiles(scope: SftpScope) {
    clearScopeSelection(scope)
    if (scope === 'remote') {
      setShowHiddenRemoteFiles((current) => !current)
      return
    }

    setShowHiddenLocalFiles((current) => !current)
  }

  function getShowHiddenState(scope: SftpScope): boolean {
    return scope === 'remote' ? showHiddenRemoteFiles : showHiddenLocalFiles
  }

  function getVisibleListing(scope: SftpScope): FileListing | null {
    const listing = scope === 'remote' ? remoteListing : localListing
    return listing
      ? { ...listing, entries: filterVisibleEntries(listing.entries, getShowHiddenState(scope)) }
      : listing
  }

  function updateSort(scope: SftpScope, columnKey: string) {
    const setter = scope === 'remote' ? setRemoteSort : setLocalSort
    setter((current) => {
      const key = columnKey as SortConfig['key']
      return current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' }
    })
  }

  async function refreshScope(scope: SftpScope) {
    if (scope === 'remote') {
      await handleRemoteNavigate(remoteListing?.path || '')
      return
    }

    await handleLocalNavigate(localListing?.path || '')
  }

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
