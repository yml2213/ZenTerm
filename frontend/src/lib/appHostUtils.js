export function buildHostPayload(form) {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    address: form.address.trim(),
    port: Number.parseInt(form.port, 10) || 22,
    username: form.username.trim(),
    group: form.group.trim(),
    tags: form.tags.trim(),
    favorite: Boolean(form.favorite),
    credential_id: form.credentialId || undefined,
  }
}

export function buildIdentityPayload(form) {
  if (form.credentialId) {
    return {}
  }

  return {
    password: form.password,
    private_key: form.privateKey,
  }
}

export function hasConfiguredAuth(form) {
  return Boolean(
    form?.credentialId
      || form?.password?.trim()
      || form?.privateKey?.trim(),
  )
}

export function toUserMessage(error) {
  const message = error?.message || String(error || '')

  if (
    message === 'no supported ssh authentication method configured'
    || message === '未配置可用的 SSH 认证方式'
  ) {
    return '当前主机未配置认证方式，请填写密码、私钥或选择一个凭据后再连接。'
  }

  return message
}

export function matchesHost(host, query) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return true
  }

  return [host.id, host.name, host.address, host.username, host.group, host.tags]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(keyword))
}

export function parseHostTags(tags) {
  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function getHostFilterLabel(filterKey) {
  if (filterKey === 'favorite') {
    return '收藏主机'
  }
  if (filterKey === 'recent') {
    return '最近连接'
  }
  if (filterKey.startsWith('group:')) {
    return filterKey.slice('group:'.length)
  }
  if (filterKey.startsWith('tag:')) {
    return filterKey.slice('tag:'.length)
  }
  return '全部主机'
}

export function matchesHostFilter(host, filterKey) {
  if (filterKey === 'favorite') {
    return Boolean(host.favorite)
  }
  if (filterKey === 'recent') {
    return Boolean(Date.parse(host.last_connected_at || ''))
  }
  if (filterKey.startsWith('group:')) {
    return (host.group || '').trim() === filterKey.slice('group:'.length)
  }
  if (filterKey.startsWith('tag:')) {
    return parseHostTags(host.tags).includes(filterKey.slice('tag:'.length))
  }
  return true
}

export function sortHosts(hosts) {
  return hosts.slice().sort((left, right) => {
    if (Boolean(left.favorite) !== Boolean(right.favorite)) {
      return left.favorite ? -1 : 1
    }

    const leftTime = Date.parse(left.last_connected_at || '') || 0
    const rightTime = Date.parse(right.last_connected_at || '') || 0
    if (leftTime !== rightTime) {
      return rightTime - leftTime
    }

    return (left.name || left.id).localeCompare(right.name || right.id)
  })
}
