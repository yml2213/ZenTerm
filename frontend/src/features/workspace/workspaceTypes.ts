export type WorkspaceType = 'vaults' | 'sftp' | 'new-tab' | 'log' | 'ssh'

export interface SessionTab {
  tabId: string
  sessionId?: string
  hostID?: string
  title: string
  connectedAt?: string
  remoteAddr?: string
  type: 'ssh' | 'new' | 'log'
  logId?: string
  hostTitle?: string
  startedAt?: string
  endedAt?: string
  sshUsername?: string
  localUsername?: string
}

export type WorkspaceTab = SessionTab
