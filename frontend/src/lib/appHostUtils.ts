import { cmd } from '../wailsjs/wailsjs/go/models'

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

export function buildHostPayload(form: HostForm): cmd.Host {
  const host = new cmd.Host({
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

export function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')

  if (
    message === 'no supported ssh authentication method configured'
    || message === '未配置可用的 SSH 认证方式'
  ) {
    return '当前主机未配置认证方式，请填写密码、私钥或选择一个凭据后再连接。'
  }

  return message
}

export function matchesHost(host: cmd.Host, query: string): boolean {
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

let demoHostCache: cmd.Host[] | null = null

const demoHostNames = [
  'prod-api-01',
  'prod-db-02',
  'edge-gateway',
  'cache-redis',
  'worker-gpu',
  'staging-app',
  'backup-node',
  'metrics-box',
  'ci-runner',
  'dev-bastion',
]

const demoHostGroups = ['生产环境', '测试环境', 'SSH Config', '边缘节点']
const demoHostTags = ['Linux, API', 'DB, Backup', 'Gateway', 'Cache', 'GPU, Worker', 'CI, Build']
const demoSystemTypes = ['ubuntu', 'debian', 'linux', 'database', 'gateway', 'cache']

function shouldFillDemoHosts(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE !== 'test'
}

function createDemoHosts(existingIDs: Set<string>): cmd.Host[] {
  const hosts: cmd.Host[] = []
  let index = 0

  while (hosts.length < 10 && index < 40) {
    const number = index + 1
    const id = `demo-${number.toString().padStart(2, '0')}`
    index += 1
    if (existingIDs.has(id)) {
      continue
    }

    hosts.push(new cmd.Host({
      id,
      name: demoHostNames[(number - 1) % demoHostNames.length],
      address: `10.${10 + Math.floor(Math.random() * 30)}.${Math.floor(Math.random() * 240)}.${20 + number}`,
      port: number % 4 === 0 ? 2222 : 22,
      username: ['root', 'ubuntu', 'deploy', 'ops'][number % 4],
      group: demoHostGroups[number % demoHostGroups.length],
      tags: demoHostTags[number % demoHostTags.length],
      favorite: number % 3 === 0,
      system_type: demoSystemTypes[number % demoSystemTypes.length],
      system_type_source: 'auto',
      last_connected_at: new Date(Date.now() - number * 36e5).toISOString(),
      known_hosts: number % 2 === 0 ? 'demo-known-host' : '',
    }))
  }

  return hosts
}

export function withDemoHosts(hosts: cmd.Host[]): cmd.Host[] {
  if (!shouldFillDemoHosts() || hosts.length >= 10) {
    return hosts
  }

  const existingIDs = new Set(hosts.map((host) => host.id))
  if (!demoHostCache || demoHostCache.some((host) => existingIDs.has(host.id))) {
    demoHostCache = createDemoHosts(existingIDs)
  }

  const fillerHosts = demoHostCache
    .filter((host) => !existingIDs.has(host.id))
    .slice(0, 10 - hosts.length)

  return hosts.concat(fillerHosts)
}

export function isDemoHost(host?: Pick<cmd.Host, 'id'> | null): boolean {
  return Boolean(host?.id?.startsWith('demo-'))
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

export function matchesHostFilter(host: cmd.Host, filterKey: string): boolean {
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

export function sortHosts(hosts: cmd.Host[]): cmd.Host[] {
  return hosts.slice().sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1
    }

    const leftOrder = left.sort_order || 0
    const rightOrder = right.sort_order || 0
    if (leftOrder > 0 || rightOrder > 0) {
      if (leftOrder > 0 && rightOrder > 0 && leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      if (leftOrder > 0 !== rightOrder > 0) {
        return leftOrder > 0 ? -1 : 1
      }
    }

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
