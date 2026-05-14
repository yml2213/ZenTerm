import { main } from '../wailsjs/wailsjs/go/models'
import { SessionTab } from '../types'

interface SessionSnapshot {
  id?: string
  ID?: string
  hostID?: string
  HostID?: string
  connectedAt?: string
  ConnectedAt?: string
  remoteAddr?: string
  RemoteAddr?: string
}

interface LogRecord {
  id: string
  host_name?: string
  host_address?: string
  host_id?: string
  started_at?: string
  ended_at?: string
  ssh_username?: string
  local_username?: string
  remote_addr?: string
  host_port?: number
}

interface LogWorkspaceTab {
  tabId: string
  type: 'log'
  logId: string
  title: string
  hostTitle: string
  startedAt: string
  endedAt: string
  sshUsername: string
  localUsername: string
  remoteAddr: string
}

interface NewWorkspaceTab {
  tabId: string
  type: 'new'
  title: string
}

interface HostKeyPromptInput {
  hostID?: string
  remoteAddr?: string
  key?: string
  sha256?: string
  md5?: string
}

interface HostKeyPrompt {
  hostID: string
  remoteAddr: string
  key: string
  sha256: string
  md5: string
}

export function buildSessionTabs(
  snapshot: SessionSnapshot[],
  hosts: main.Host[],
  previousTabs: SessionTab[]
): SessionTab[] {
  const normalizedSnapshot = snapshot.map((session) => ({
    id: session.id || session.ID || '',
    hostID: session.hostID || session.HostID || '',
    connectedAt: session.connectedAt || session.ConnectedAt,
    remoteAddr: session.remoteAddr || session.RemoteAddr,
  }))
  const previousMap = new Map(previousTabs.map((tab) => [tab.sessionId, tab]))
  const hostMap = new Map(hosts.map((host) => [host.id, host]))
  const nextTabs: SessionTab[] = []

  for (const previous of previousTabs) {
    const session = normalizedSnapshot.find((item) => item.id === previous.sessionId)
    if (!session) {
      continue
    }

    const host = hostMap.get(session.hostID)
    nextTabs.push({
      tabId: previous.tabId,
      sessionId: session.id,
      hostID: session.hostID,
      title: host?.name || host?.id || previous.title || session.hostID,
      connectedAt: session.connectedAt,
      remoteAddr: session.remoteAddr,
      type: 'ssh',
    })
  }

  for (const session of normalizedSnapshot) {
    if (previousMap.has(session.id)) {
      continue
    }

    const host = hostMap.get(session.hostID)
    nextTabs.push({
      tabId: `ssh-${session.id}`,
      sessionId: session.id,
      hostID: session.hostID,
      title: host?.name || host?.id || session.hostID,
      connectedAt: session.connectedAt,
      remoteAddr: session.remoteAddr,
      type: 'ssh',
    })
  }

  return nextTabs
}

export function buildOptimisticSessionTab(host: main.Host | null, sessionID: string): SessionTab {
  return {
    tabId: `ssh-${sessionID}`,
    sessionId: sessionID,
    hostID: host?.id || '',
    title: host?.name || host?.id || '新会话',
    connectedAt: new Date().toISOString(),
    remoteAddr: host?.address
      ? `${host.address}:${host.port || 22}`
      : host?.id || sessionID,
    type: 'ssh',
  }
}

export function createNewWorkspaceTab(index: number): NewWorkspaceTab {
  return {
    tabId: `new-tab-${index}`,
    type: 'new',
    title: '新标签页',
  }
}

export function createLogWorkspaceTab(log: LogRecord): LogWorkspaceTab {
  const title = log?.host_name || log?.host_address || log?.host_id || '连接日志'
  return {
    tabId: `log-${log.id}`,
    type: 'log',
    logId: log.id,
    title: `日志：${title}`,
    hostTitle: title,
    startedAt: log?.started_at || '',
    endedAt: log?.ended_at || '',
    sshUsername: log?.ssh_username || '',
    localUsername: log?.local_username || '',
    remoteAddr: log?.remote_addr || (log?.host_address ? `${log.host_address}:${log.host_port || 22}` : ''),
  }
}

export function normalizeHostKeyPrompt(prompt: HostKeyPromptInput | null): HostKeyPrompt | null {
  if (!prompt) {
    return null
  }

  return {
    hostID: String(prompt.hostID || ''),
    remoteAddr: String(prompt.remoteAddr || ''),
    key: String(prompt.key || ''),
    sha256: String(prompt.sha256 || ''),
    md5: String(prompt.md5 || ''),
  }
}
