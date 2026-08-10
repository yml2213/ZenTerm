import { useMemo } from 'react'
import type { SidebarPage } from './appShellConfig'
import { cmd } from '@/lib/backendModels'
import type { WorkspaceTab, WorkspaceType } from '@/features/workspace/workspaceTypes'

interface PageHeaderStateProps {
  activeWorkspace: WorkspaceType
  activeSession: WorkspaceTab | null
  selectedSftpHost: cmd.Host | null
  isSettingsPage: boolean
  isHostsPage: boolean
  hostFilterKey: string
  activeHostFilterLabel: string
  filteredHostCount: number
  hostCount: number
  currentSidebarPage: SidebarPage
}

export function usePageHeaderState({
  activeWorkspace,
  activeSession,
  selectedSftpHost,
  isSettingsPage,
  isHostsPage,
  hostFilterKey,
  activeHostFilterLabel,
  filteredHostCount,
  hostCount,
  currentSidebarPage,
}: PageHeaderStateProps) {
  return useMemo(() => {
    const pageHeader = activeWorkspace === 'ssh'
      ? {
          kicker: 'SSH',
          title: activeSession?.title || '终端工作区',
          description: activeSession?.remoteAddr || '当前活跃 SSH 会话会在这里独立展示。',
        }
      : activeWorkspace === 'sftp'
      ? {
          kicker: 'SFTP',
          title: '文件工作区',
          description: selectedSftpHost
            ? `当前主机：${selectedSftpHost.name || selectedSftpHost.id} · ${selectedSftpHost.address}:${selectedSftpHost.port || 22}`
            : 'SFTP 是独立工作区，用来浏览本地与远端目录并执行上传下载。',
        }
      : isSettingsPage
      ? {
          kicker: 'Security',
          title: '保险箱设置',
          description: '主密码用于保护本地保存的 SSH 凭据。ZenTerm 会默认交给系统钥匙串保管，日常不再需要手动进入。',
        }
      : currentSidebarPage

    return isHostsPage && hostFilterKey !== 'all'
      ? {
          ...pageHeader,
          title: activeHostFilterLabel,
          description: `当前筛选出 ${filteredHostCount} / ${hostCount} 台主机，可继续搜索缩小范围。`,
        }
      : pageHeader
  }, [
    activeHostFilterLabel,
    activeSession?.remoteAddr,
    activeSession?.title,
    activeWorkspace,
    currentSidebarPage,
    filteredHostCount,
    hostCount,
    hostFilterKey,
    isHostsPage,
    isSettingsPage,
    selectedSftpHost,
  ])
}
