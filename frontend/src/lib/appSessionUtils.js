export function buildSessionTabs(snapshot, hosts, previousTabs) {
  const normalizedSnapshot = snapshot.map((session) => ({
    id: session.id || session.ID,
    hostID: session.hostID || session.HostID,
    connectedAt: session.connectedAt || session.ConnectedAt,
    remoteAddr: session.remoteAddr || session.RemoteAddr,
  }))
  const previousMap = new Map(previousTabs.map((tab) => [tab.sessionId, tab]))
  const hostMap = new Map(hosts.map((host) => [host.id, host]))
  const nextTabs = []

  for (const previous of previousTabs) {
    const session = normalizedSnapshot.find((item) => item.id === previous.sessionId)
    if (!session) {
      continue
    }

    const host = hostMap.get(session.hostID)
    nextTabs.push({
      sessionId: session.id,
      hostID: session.hostID,
      title: host?.name || host?.id || previous.title || session.hostID,
      connectedAt: session.connectedAt,
      remoteAddr: session.remoteAddr,
    })
  }

  for (const session of normalizedSnapshot) {
    if (previousMap.has(session.id)) {
      continue
    }

    const host = hostMap.get(session.hostID)
    nextTabs.push({
      sessionId: session.id,
      hostID: session.hostID,
      title: host?.name || host?.id || session.hostID,
      connectedAt: session.connectedAt,
      remoteAddr: session.remoteAddr,
    })
  }

  return nextTabs
}

export function buildOptimisticSessionTab(host, sessionID) {
  return {
    sessionId: sessionID,
    hostID: host?.id || '',
    title: host?.name || host?.id || '新会话',
    connectedAt: new Date().toISOString(),
    remoteAddr: host?.address
      ? `${host.address}:${host.port || 22}`
      : host?.id || sessionID,
  }
}

export function createNewWorkspaceTab(index) {
  return {
    tabId: `new-tab-${index}`,
    type: 'new',
    title: '新标签页',
  }
}

export function createLogWorkspaceTab(log) {
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

export function normalizeHostKeyPrompt(prompt) {
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
