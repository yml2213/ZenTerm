import { useMemo, useState } from 'react'
import { createInitialHostForm } from './hostFormModel'
import {
  getHostFilterLabel,
  matchesHost,
  matchesHostFilter,
  parseHostTags,
  sortHosts,
} from './appHostUtils'
import { sidebarPages, type SidebarPage } from '@/features/app/appShellConfig'
import { cmd } from '@/wailsjs/wailsjs/go/models'
import type { HostFormModel } from './hostFormModel'
import type { SessionTab } from '@/features/workspace/workspaceTypes'

export function useHostState(sessionTabs: SessionTab[]) {
  const [activeSidebarPage, setActiveSidebarPage] = useState('hosts')
  const [hosts, setHosts] = useState<cmd.Host[]>([])
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [selectedSftpHostId, setSelectedSftpHostId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newTabSearchQuery, setNewTabSearchQuery] = useState('')
  const [hostViewMode, setHostViewMode] = useState<'grid' | 'list'>('grid')
  const [hostFilterKey, setHostFilterKey] = useState('all')
  const [hostDialogMode, setHostDialogMode] = useState<'create' | 'edit' | null>(null)
  const [hostForm, setHostForm] = useState<HostFormModel>(() => createInitialHostForm())
  const [isSavingHost, setIsSavingHost] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<cmd.Host | null>(null)

  const filteredHosts = useMemo(() => sortHosts(hosts.filter((host) => (
    matchesHost(host, searchQuery) && matchesHostFilter(host, hostFilterKey)
  ))), [hostFilterKey, hosts, searchQuery])
  const hostGroups = useMemo(() => (
    Array.from(
      new Set(hosts.map((host) => host.group?.trim()).filter((group): group is string => Boolean(group))),
    ).sort()
  ), [hosts])
  const hostTags = useMemo(() => (
    Array.from(new Set(hosts.flatMap((host) => parseHostTags(host.tags)))).sort()
  ), [hosts])
  const favoriteHostCount = useMemo(() => hosts.filter((host) => host.favorite).length, [hosts])
  const recentHostCount = useMemo(() => hosts.filter((host) => Date.parse(host.last_connected_at || '')).length, [hosts])
  const activeHostFilterLabel = useMemo(() => getHostFilterLabel(hostFilterKey), [hostFilterKey])
  const sessionCountByHost = useMemo(() => sessionTabs.reduce((acc, session) => {
    acc[session.hostID!] = (acc[session.hostID!] || 0) + 1
    return acc
  }, {} as Record<string, number>), [sessionTabs])
  const selectedSftpHost = useMemo(() => (
    hosts.find((host) => host.id === selectedSftpHostId) || null
  ), [hosts, selectedSftpHostId])
  const currentSidebarPage: SidebarPage = useMemo(() => (
    sidebarPages[activeSidebarPage] || sidebarPages.hosts
  ), [activeSidebarPage])
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
