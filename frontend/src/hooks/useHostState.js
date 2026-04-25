import { useState } from 'react'
import { createInitialHostForm } from '../components/HostForm.jsx'
import {
  getHostFilterLabel,
  matchesHost,
  matchesHostFilter,
  parseHostTags,
  sortHosts,
} from '../lib/appHostUtils.js'
import { sidebarPages } from '../lib/appShellConfig.jsx'

export function useHostState(sessionTabs) {
  const [activeSidebarPage, setActiveSidebarPage] = useState('hosts')
  const [hosts, setHosts] = useState([])
  const [selectedHostId, setSelectedHostId] = useState(null)
  const [selectedSftpHostId, setSelectedSftpHostId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newTabSearchQuery, setNewTabSearchQuery] = useState('')
  const [hostViewMode, setHostViewMode] = useState('grid')
  const [hostFilterKey, setHostFilterKey] = useState('all')
  const [hostDialogMode, setHostDialogMode] = useState(null)
  const [hostForm, setHostForm] = useState(createInitialHostForm)
  const [isSavingHost, setIsSavingHost] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState(null)

  const filteredHosts = sortHosts(hosts.filter((host) => (
    matchesHost(host, searchQuery) && matchesHostFilter(host, hostFilterKey)
  )))
  const hostGroups = Array.from(new Set(hosts.map((host) => host.group?.trim()).filter(Boolean))).sort()
  const hostTags = Array.from(new Set(hosts.flatMap((host) => parseHostTags(host.tags)))).sort()
  const favoriteHostCount = hosts.filter((host) => host.favorite).length
  const recentHostCount = hosts.filter((host) => Date.parse(host.last_connected_at || '')).length
  const activeHostFilterLabel = getHostFilterLabel(hostFilterKey)
  const sessionCountByHost = sessionTabs.reduce((acc, session) => {
    acc[session.hostID] = (acc[session.hostID] || 0) + 1
    return acc
  }, {})
  const selectedSftpHost = hosts.find((host) => host.id === selectedSftpHostId) || null
  const currentSidebarPage = sidebarPages[activeSidebarPage] || sidebarPages.hosts
  const isHostsPage = activeSidebarPage === 'hosts'
  const isSettingsPage = activeSidebarPage === 'settings'
  const isKnownHostsPage = activeSidebarPage === 'knownHosts'
  const isKeychainPage = activeSidebarPage === 'keychain'
  const isLogsPage = activeSidebarPage === 'logs'

  return {
    activeSidebarPage,
    setActiveSidebarPage,
    hosts,
    setHosts,
    selectedHostId,
    setSelectedHostId,
    selectedSftpHostId,
    setSelectedSftpHostId,
    searchQuery,
    setSearchQuery,
    newTabSearchQuery,
    setNewTabSearchQuery,
    hostViewMode,
    setHostViewMode,
    hostFilterKey,
    setHostFilterKey,
    hostDialogMode,
    setHostDialogMode,
    hostForm,
    setHostForm,
    isSavingHost,
    setIsSavingHost,
    deleteCandidate,
    setDeleteCandidate,
    filteredHosts,
    hostGroups,
    hostTags,
    favoriteHostCount,
    recentHostCount,
    activeHostFilterLabel,
    sessionCountByHost,
    selectedSftpHost,
    currentSidebarPage,
    isHostsPage,
    isSettingsPage,
    isKnownHostsPage,
    isKeychainPage,
    isLogsPage,
  }
}
