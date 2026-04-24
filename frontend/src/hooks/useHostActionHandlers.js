import { startTransition } from 'react'
import { createHostFormFromHost, createInitialHostForm } from '../components/HostForm.jsx'
import {
  buildHostPayload,
  buildIdentityPayload,
  hasConfiguredAuth,
  toUserMessage,
} from '../lib/appHostUtils.js'
import { addHost, deleteHost, listHosts, updateHost } from '../lib/backend.js'

export function useHostActionHandlers({
  state,
  setters,
  helpers,
}) {
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
    setHostForm(createInitialHostForm())
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

  function openEditHost(host) {
    if (!vaultUnlocked) {
      setError('请输入主密码后继续编辑主机配置。')
      return
    }

    setHostForm(createHostFormFromHost(host))
    setHostDialogMode('edit')
  }

  function handleSaveHost(event) {
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

  function handleCopyHostAddress(host) {
    const address = `${host.username}@${host.address}:${host.port || 22}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch((err) => setError(err.message || String(err)))
      return
    }

    setError('当前环境不支持自动复制，请手动复制主机地址。')
  }

  function handleToggleFavorite(host) {
    const nextHost = {
      id: host.id,
      name: host.name,
      address: host.address,
      port: host.port || 22,
      username: host.username,
      group: host.group || '',
      tags: host.tags || '',
      favorite: !host.favorite,
      last_connected_at: host.last_connected_at,
      known_hosts: host.known_hosts,
      credential_id: host.credential_id,
    }

    updateHost(nextHost, {})
      .then(async () => {
        await refreshHosts()
        setSelectedHostId(host.id)
      })
      .catch((err) => setError(toUserMessage(err)))
  }

  function handlePickSftpHost(hostID) {
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
