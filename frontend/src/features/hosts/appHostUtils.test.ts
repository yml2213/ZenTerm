import { describe, expect, it } from 'vitest'
import { cmd } from '@/lib/backendModels'
import { sortHosts } from './appHostUtils'

function makeHost(source: Partial<cmd.Host> & { id: string; name: string }): cmd.Host {
  return new cmd.Host(source)
}

describe('sortHosts', () => {
  it('连接时间变化不改变普通主机顺序', () => {
    const before = sortHosts([
      makeHost({ id: 'a', name: 'alpha', last_connected_at: '2026-01-01T10:00:00Z' }),
      makeHost({ id: 'b', name: 'beta' }),
      makeHost({ id: 'c', name: 'gamma' }),
    ]).map((host) => host.id)

    // 模拟连接成功后更新 last_connected_at
    const after = sortHosts([
      makeHost({ id: 'a', name: 'alpha', last_connected_at: '2026-01-01T10:00:00Z' }),
      makeHost({ id: 'b', name: 'beta', last_connected_at: '2026-09-03T21:00:00Z' }),
      makeHost({ id: 'c', name: 'gamma' }),
    ]).map((host) => host.id)

    expect(before).toEqual(['a', 'b', 'c'])
    expect(after).toEqual(before)
  })

  it('置顶主机始终排在最前', () => {
    const hosts = sortHosts([
      makeHost({ id: 'a', name: 'alpha' }),
      makeHost({ id: 'b', name: 'beta', pinned: true, last_connected_at: '2026-01-01T10:00:00Z' }),
    ])

    expect(hosts.map((host) => host.id)).toEqual(['b', 'a'])
  })

  it('手动排序(sort_order)优先于名称顺序', () => {
    const hosts = sortHosts([
      makeHost({ id: 'a', name: 'alpha', sort_order: 2 }),
      makeHost({ id: 'b', name: 'beta', sort_order: 1 }),
      makeHost({ id: 'c', name: 'gamma' }),
    ])

    expect(hosts.map((host) => host.id)).toEqual(['b', 'a', 'c'])
  })

  it('收藏主机排在未收藏之前', () => {
    const hosts = sortHosts([
      makeHost({ id: 'a', name: 'alpha' }),
      makeHost({ id: 'b', name: 'beta', favorite: true }),
    ])

    expect(hosts.map((host) => host.id)).toEqual(['b', 'a'])
  })
})

describe('parseSshConnectionString', () => {
  it('支持标准 ssh 命令并解析各要素', async () => {
    const { parseSshConnectionString } = await import('./appHostUtils')
    const result = parseSshConnectionString('ssh root@192.168.1.100 -p 2222')
    expect(result).toEqual({
      username: 'root',
      address: '192.168.1.100',
      port: '2222',
      name: 'root@192.168.1.100',
    })
  })

  it('支持 user@host 简单格式', async () => {
    const { parseSshConnectionString } = await import('./appHostUtils')
    const result = parseSshConnectionString('ubuntu@my-server.com')
    expect(result).toEqual({
      username: 'ubuntu',
      address: 'my-server.com',
      port: undefined,
      name: 'ubuntu@my-server.com',
    })
  })

  it('支持纯 IP 携带端口', async () => {
    const { parseSshConnectionString } = await import('./appHostUtils')
    const result = parseSshConnectionString('10.0.0.5:2200')
    expect(result).toEqual({
      username: undefined,
      address: '10.0.0.5',
      port: '2200',
      name: '10.0.0.5',
    })
  })
})
