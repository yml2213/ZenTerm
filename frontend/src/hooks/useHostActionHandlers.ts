import { startTransition } from 'react'
import { createHostFormFromHost, createInitialHostForm } from '../components/HostForm'
import {
  buildHostPayload,
  buildIdentityPayload,
  hasConfiguredAuth,
  toUserMessage,
} from '../lib/appHostUtils'
import { addHost, deleteHost, listHosts, updateHost } from '../lib/backend'
import { main } from '../wailsjs/wailsjs/go/models'
import { HostFormModel, SessionTab } from '../types'

interface HostActionHandlersProps {
  state: {
    hosts: main.Host[]
    hostDialogMode: 'create' | 'edit' | null
    hostForm: HostFormModel
    vaultUnlocked: boolean
    deleteCandidate: main.Host | null
    selectedHostId: string | null
    selectedSftpHostId: string | null
    sessionTabs: SessionTab[]
  }
  setters: {
    setError: (error: string | null) => void
    setHostForm: (form: HostFormModel) => void
    setHostDialogMode: (mode: 'create' | 'edit' | null) => void
    setHosts: (hosts: main.Host[]) => void
    setSelectedHostId: (updater: string | null | ((current: string | null) => string | null)) => void
    setSelectedSftpHostId: (updater: string | null | ((current: string | null) => string | null)) => void
    setSessionTabs: (updater: SessionTab[] | ((current: SessionTab[]) => SessionTab[])) => void
    setDeleteCandidate: (host: main.Host | null) => void
    setIsSavingHost: (isSaving: boolean) => void
  }
  helpers: {
    openCreateHost: () => void
  }
}

export function useHostActionHandlers({
  state,
  setters,
  helpers,
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
    setHostForm,
    setHostDialogMode,
    setHosts,
    setSelectedHostId,
    setSelectedSftpHostId,
    setSessionTabs,
    setDeleteCandidate,
    setIsSavingHost,
  } = setters
  const { openCreateHost } = helpers

  function closeHostDialog() {
    setHostDialogMode(null)
    setHostForm(createInitialHostForm() as HostFormModel)
  }

  function refreshHosts() {
    return listHosts()
      .then((nextHosts) => {
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

  function openEditHost(host: main.Host) {
    if (!vaultUnlocked) {
      setError('请输入主密码后继续编辑主机配置。')
      return
    }

    setHostForm(createHostFormFromHost(host) as HostFormModel)
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

  function handleCopyHostAddress(host: main.Host) {
    const address = `${host.username}@${host.address}:${host.port || 22}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch((err: Error) => setError(err.message || String(err)))
      return
    }

    setError('当前环境不支持自动复制，请手动复制主机地址。')
  }

  function handleToggleFavorite(host: main.Host) {
    const nextHost = new main.Host({
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

  function handlePickSftpHost(hostID: string | null) {
    if (hostID === null) {
      setSelectedSftpHostId(null)
      return
    }

    const nextHostID = hostID || selectedSftpHostId || selectedHostId || hosts[0]?.id || null
    if (!nextHostID) {
      openCreateHost()
      return
    }

    setSelectedSftpHostId(nextHostID)
  }

  return {
    closeHostDialog,
    refreshHosts,
    openEditHost,
    handleSaveHost,
    handleDeleteHost,
    handleCopyHostAddress,
    handleToggleFavorite,
    handlePickSftpHost,
  }
}
