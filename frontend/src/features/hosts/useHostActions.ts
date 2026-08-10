import { startTransition } from 'react'
import { createHostFormFromHost, createInitialHostForm } from './hostFormModel'
import {
  buildHostPayload,
  buildIdentityPayload,
  hasConfiguredAuth,
  isDemoHost,
  sortHosts,
  toUserMessage,
  withDemoHosts,
} from './appHostUtils'
import { addHost, deleteHost, listHosts, reorderHosts, updateHost, updateHostPinned } from '@/lib/backend'
import { cmd } from '@/lib/backendModels'
import type { HostFormModel } from './hostFormModel'
import type { SessionTab, WorkspaceType } from '@/features/workspace/workspaceTypes'

interface HostActionHandlersProps {
  state: {
    hosts: cmd.Host[]
    hostDialogMode: 'create' | 'edit' | null
    hostForm: HostFormModel
    vaultUnlocked: boolean
    deleteCandidate: cmd.Host | null
    selectedHostId: string | null
    selectedSftpHostId: string | null
    sessionTabs: SessionTab[]
  }
  setters: {
    app: {
      setError: (error: string | null) => void
    }
    hosts: {
      setHostForm: (form: HostFormModel) => void
      setHostDialogMode: (mode: 'create' | 'edit' | null) => void
      setHosts: (hosts: cmd.Host[]) => void
      setSelectedHostId: (updater: string | null | ((current: string | null) => string | null)) => void
      setSelectedSftpHostId: (updater: string | null | ((current: string | null) => string | null)) => void
      setActiveSidebarPage: (page: string) => void
      setDeleteCandidate: (host: cmd.Host | null) => void
      setIsSavingHost: (isSaving: boolean) => void
    }
    workspace: {
      setActiveWorkspace: (workspace: WorkspaceType) => void
      setSessionTabs: (updater: SessionTab[] | ((current: SessionTab[]) => SessionTab[])) => void
    }
  }
}

export function useHostActions({
  state,
  setters,
}: HostActionHandlersProps) {
  const {
    hosts,
    hostDialogMode,
    hostForm,
    vaultUnlocked,
    deleteCandidate,
    selectedHostId,
    selectedSftpHostId,
    sessionTabs,
  } = state
  const {
    setError,
  } = setters.app
  const {
    setHostForm,
    setHostDialogMode,
    setHosts,
    setSelectedHostId,
    setSelectedSftpHostId,
    setActiveSidebarPage,
    setDeleteCandidate,
    setIsSavingHost,
  } = setters.hosts
  const {
    setActiveWorkspace,
    setSessionTabs,
  } = setters.workspace

  function closeHostDialog() {
    setHostDialogMode(null)
    setHostForm(createInitialHostForm())
  }

  function openCreateHost() {
    if (!vaultUnlocked) {
      setError('请输入主密码后继续保存主机配置。')
      return
    }

    setHostForm(createInitialHostForm())
    setActiveWorkspace('vaults')
    setActiveSidebarPage('hosts')
    setHostDialogMode('create')
  }

  function refreshHosts() {
    return listHosts()
      .then((persistedHosts) => {
        const nextHosts = withDemoHosts(persistedHosts)
        startTransition(() => {
          setHosts(nextHosts)
          setSelectedHostId((current) => {
            if (current && nextHosts.some((host) => host.id === current)) {
              return current
            }
            return nextHosts[0]?.id || null
          })
          setSelectedSftpHostId((current) => {
            if (current && nextHosts.some((host) => host.id === current)) {
              return current
            }
            return null
          })
          setSessionTabs((currentTabs) => currentTabs.map((tab) => {
            const host = nextHosts.find((item) => item.id === tab.hostID)
            if (!host) {
              return tab
            }

            return {
              ...tab,
              title: host.name || host.id,
            }
          }))
        })
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function openEditHost(host: cmd.Host) {
    if (isDemoHost(host)) {
      setError('演示主机仅用于界面预览，不会写入保险箱。')
      return
    }

    if (!vaultUnlocked) {
      setError('请输入主密码后继续编辑主机配置。')
      return
    }

    setHostForm(createHostFormFromHost(host))
    setHostDialogMode('edit')
  }

  function handleSaveHost(event: React.FormEvent) {
    event.preventDefault()

    if (hostDialogMode === 'create' && !hasConfiguredAuth(hostForm)) {
      setError('请至少配置一种 SSH 认证方式：密码、私钥或凭据。')
      return
    }

    setIsSavingHost(true)
    setError(null)

    const host = buildHostPayload(hostForm)
    const identity = buildIdentityPayload(hostForm)
    const action = hostDialogMode === 'edit' ? updateHost(host, identity) : addHost(host, identity)

    action
      .then(async () => {
        closeHostDialog()
        await refreshHosts()
        setSelectedHostId(host.id)
      })
      .catch((err) => setError(toUserMessage(err)))
      .finally(() => setIsSavingHost(false))
  }

  function handleDeleteHost() {
    if (!deleteCandidate) {
      return
    }

    if (isDemoHost(deleteCandidate)) {
      setHosts(hosts.filter((host) => host.id !== deleteCandidate.id))
      setDeleteCandidate(null)
      return
    }

    const hasSession = sessionTabs.some((session) => session.hostID === deleteCandidate.id)
    if (hasSession) {
      setError('该主机仍有活跃终端标签，请先关闭对应会话后再删除。')
      setDeleteCandidate(null)
      return
    }

    deleteHost(deleteCandidate.id)
      .then(async () => {
        setDeleteCandidate(null)
        if (selectedHostId === deleteCandidate.id) {
          setSelectedHostId(null)
        }
        await refreshHosts()
      })
      .catch((err) => setError(err.message || String(err)))
  }

  function handleCopyHostAddress(host: cmd.Host) {
    const address = `${host.username}@${host.address}:${host.port || 22}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch((err: Error) => setError(err.message || String(err)))
      return
    }

    setError('当前环境不支持自动复制，请手动复制主机地址。')
  }

  function handleToggleFavorite(host: cmd.Host) {
    if (isDemoHost(host)) {
      setHosts(hosts.map((item) => {
        if (item.id !== host.id) {
          return item
        }

        return new cmd.Host({
          ...item,
          favorite: !item.favorite,
        })
      }))
      return
    }

    const nextHost = new cmd.Host({
      id: host.id,
      name: host.name,
      address: host.address,
      port: host.port || 22,
      username: host.username,
      group: host.group || '',
      tags: host.tags || '',
      favorite: !host.favorite,
      system_type: host.system_type,
      system_type_source: host.system_type_source || 'auto',
      last_connected_at: host.last_connected_at,
      known_hosts: host.known_hosts,
      credential_id: host.credential_id,
    })

    updateHost(nextHost, {})
      .then(async () => {
        await refreshHosts()
        setSelectedHostId(host.id)
      })
      .catch((err) => setError(toUserMessage(err)))
  }

  function handleTogglePinned(host: cmd.Host) {
    const nextPinned = !host.pinned
    const nextHosts = hosts.map((item) => {
      if (item.id !== host.id) {
        return item
      }

      return new cmd.Host({
        ...item,
        pinned: nextPinned,
      })
    })

    setError(null)
    setHosts(nextHosts)

    if (isDemoHost(host)) {
      return
    }

    updateHostPinned(host.id, nextPinned)
      .then(() => setSelectedHostId(host.id))
      .catch((err) => {
        setError(toUserMessage(err))
        void refreshHosts()
      })
  }

  function handleReorderHosts(orderedVisibleHostIds: string[]) {
    const hostById = new Map(hosts.map((host) => [host.id, host]))
    const seenVisibleIds = new Set<string>()
    const visibleHostIds = orderedVisibleHostIds.filter((hostId) => {
      if (!hostById.has(hostId) || seenVisibleIds.has(hostId)) {
        return false
      }

      seenVisibleIds.add(hostId)
      return true
    })

    if (visibleHostIds.length < 2) {
      return
    }

    const visibleHostIdSet = new Set(visibleHostIds)
    let visibleIndex = 0
    const nextHostIds = sortHosts(hosts).map((host) => {
      if (!visibleHostIdSet.has(host.id)) {
        return host.id
      }

      const nextHostId = visibleHostIds[visibleIndex]
      visibleIndex += 1
      return nextHostId || host.id
    })
    const nextHosts = nextHostIds
      .map((hostId, index) => {
        const host = hostById.get(hostId)
        if (!host) {
          return null
        }

        return new cmd.Host({
          ...host,
          sort_order: index + 1,
        })
      })
      .filter((host): host is cmd.Host => Boolean(host))

    const persistedHostIds = nextHostIds.filter((hostId) => !isDemoHost(hostById.get(hostId)))

    setError(null)
    setHosts(nextHosts)

    if (persistedHostIds.length === 0) {
      return
    }

    reorderHosts(persistedHostIds)
      .catch((err) => {
        setError(toUserMessage(err))
        void refreshHosts()
      })
  }

  function handlePickSftpHost(hostId?: string | null) {
    if (hostId === null) {
      setSelectedSftpHostId(null)
      return
    }

    const nextHostID = hostId || selectedSftpHostId || selectedHostId || hosts[0]?.id || null
    if (!nextHostID) {
      openCreateHost()
      return
    }

    setSelectedSftpHostId(nextHostID)
  }

  return {
    closeHostDialog,
    refreshHosts,
    openCreateHost,
    openEditHost,
    handleSaveHost,
    handleDeleteHost,
    handleCopyHostAddress,
    handleToggleFavorite,
    handleTogglePinned,
    handleReorderHosts,
    handlePickSftpHost,
  }
}
