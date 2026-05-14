import { main } from '../wailsjs/wailsjs/go/models'

export interface HostForm {
  id: string
  name: string
  address: string
  port: string
  username: string
  group: string
  tags: string
  favorite: boolean
  systemType: string
  systemTypeSource: 'auto' | 'manual'
  authType: 'password' | 'key' | 'credential'
  password?: string
  privateKey?: string
  credentialId?: string
}

export function buildHostPayload(form: HostForm): main.Host {
  const host = new main.Host({
    id: form.id.trim(),
    name: form.name.trim(),
    address: form.address.trim(),
    port: Number.parseInt(form.port, 10) || 22,
    username: form.username.trim(),
    group: form.group.trim(),
    tags: form.tags.trim(),
    favorite: Boolean(form.favorite),
    system_type_source: form.systemTypeSource || 'auto',
  })

  if (form.systemType) {
    host.system_type = form.systemType
  }
  if (form.credentialId) {
    host.credential_id = form.credentialId
  }

  return host
}

export function buildIdentityPayload(form: HostForm): { password?: string; private_key?: string } {
  if (form.credentialId) {
    return {}
  }

  return {
    password: form.password,
    private_key: form.privateKey,
  }
}

export function hasConfiguredAuth(form: Partial<HostForm>): boolean {
  return Boolean(
    form?.credentialId
      || form?.password?.trim()
      || form?.privateKey?.trim(),
  )
}

export function toUserMessage(error: any): string {
  const message = error?.message || String(error || '')

  if (
    message === 'no supported ssh authentication method configured'
    || message === '未配置可用的 SSH 认证方式'
  ) {
    return '当前主机未配置认证方式，请填写密码、私钥或选择一个凭据后再连接。'
  }

  return message
}

export function matchesHost(host: main.Host, query: string): boolean {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return true
  }

  return [host.id, host.name, host.address, host.username, host.group, host.tags]
    .filter(Boolean)
    .some((value) => (value as string).toLowerCase().includes(keyword))
}

export function parseHostTags(tags: string | undefined): string[] {
  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function getHostFilterLabel(filterKey: string): string {
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

export function matchesHostFilter(host: main.Host, filterKey: string): boolean {
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

export function sortHosts(hosts: main.Host[]): main.Host[] {
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
