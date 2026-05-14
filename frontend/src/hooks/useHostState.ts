import { useState } from 'react'
import { createInitialHostForm } from '../components/HostForm'
import {
  getHostFilterLabel,
  matchesHost,
  matchesHostFilter,
  parseHostTags,
  sortHosts,
} from '../lib/appHostUtils'
import { sidebarPages, SidebarPage } from '../lib/appShellConfig'
import { main } from '../wailsjs/wailsjs/go/models'
import { HostFormModel, SessionTab } from '../types'

export function useHostState(sessionTabs: SessionTab[]) {
  const [activeSidebarPage, setActiveSidebarPage] = useState('hosts')
  const [hosts, setHosts] = useState<main.Host[]>([])
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [selectedSftpHostId, setSelectedSftpHostId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newTabSearchQuery, setNewTabSearchQuery] = useState('')
  const [hostViewMode, setHostViewMode] = useState<'grid' | 'list'>('grid')
  const [hostFilterKey, setHostFilterKey] = useState('all')
  const [hostDialogMode, setHostDialogMode] = useState<'create' | 'edit' | null>(null)
  const [hostForm, setHostForm] = useState<HostFormModel>(() => createInitialHostForm() as HostFormModel)
  const [isSavingHost, setIsSavingHost] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<main.Host | null>(null)

  const filteredHosts = sortHosts(hosts.filter((host) => (
    matchesHost(host, searchQuery) && matchesHostFilter(host, hostFilterKey)
  )))
  const hostGroups = Array.from(new Set(hosts.map((host) => host.group?.trim()).filter((group): group is string => Boolean(group)))).sort()
  const hostTags = Array.from(new Set(hosts.flatMap((host) => parseHostTags(host.tags)))).sort()
  const favoriteHostCount = hosts.filter((host) => host.favorite).length
  const recentHostCount = hosts.filter((host) => Date.parse(host.last_connected_at || '')).length
  const activeHostFilterLabel = getHostFilterLabel(hostFilterKey)
  const sessionCountByHost = sessionTabs.reduce((acc, session) => {
    acc[session.hostID!] = (acc[session.hostID!] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const selectedSftpHost = hosts.find((host) => host.id === selectedSftpHostId) || null
  const currentSidebarPage: SidebarPage = sidebarPages[activeSidebarPage] || sidebarPages.hosts
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
