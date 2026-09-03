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
