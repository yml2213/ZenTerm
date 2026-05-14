import type { RefObject } from 'react'
import { Clock3, Plus, Search, Server, TerminalSquare } from 'lucide-react'
import { matchesHost, sortHosts } from '../lib/appHostUtils'
import { main } from '../wailsjs/wailsjs/go/models'

type Host = main.Host

interface NewTabPageProps {
  hosts: Host[]
  searchQuery: string
  onConnect: (hostId: string) => void
  onCreateHost: () => void
  connectingHostIds: string[]
  vaultUnlocked: boolean
}

interface NewTabWorkspaceProps {
  searchInputRef: RefObject<HTMLInputElement>
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onCreateHost: () => void
  hosts: Host[]
  onConnect: (hostId: string) => void
  connectingHostIds: string[]
  vaultUnlocked: boolean
}

function NewTabPage({
  hosts,
  searchQuery,
  onConnect,
  onCreateHost,
  connectingHostIds,
  vaultUnlocked,
}: NewTabPageProps) {
  const filteredHosts = sortHosts(hosts.filter((host) => matchesHost(host, searchQuery)))

  return (
    <section className="new-tab-surface" aria-label="新标签页主机列表">
      <header className="new-tab-list-head">
        <div className="new-tab-list-title">
          <Clock3 size={15} />
          <h2>最近连接</h2>
          <span>{filteredHosts.length} / {hosts.length}</span>
        </div>
        <button type="button" className="new-tab-link-button" disabled>
          恢复会话
        </button>
      </header>

      <section className="new-tab-host-table" aria-label="最近连接">
        <div className="new-tab-host-table-head" aria-hidden="true">
          <span>主机</span>
          <span>地址</span>
          <span>分组</span>
          <span>协议</span>
        </div>

        <div className="new-tab-host-list">
          {filteredHosts.length > 0 ? filteredHosts.map((host) => {
            const connecting = connectingHostIds.includes(host.id)
            const address = `${host.username}@${host.address}:${host.port || 22}`

            return (
              <button
                type="button"
                key={host.id}
                className="new-tab-host-row"
                aria-label={`${host.name || host.id} ${address} SSH`}
                onClick={() => onConnect(host.id)}
                disabled={!vaultUnlocked || connecting}
              >
                <span className="new-tab-host-main">
                  <span className="new-tab-host-icon">
                    <TerminalSquare size={15} />
                  </span>
                  <span className="new-tab-host-copy">
                    <span className="new-tab-host-name">{host.name || host.id}</span>
                    <span className="new-tab-host-subtitle">{address}</span>
                  </span>
                </span>
                <span className="new-tab-host-address">{address}</span>
                <span className="new-tab-host-group">{host.group || '未分组'}</span>
                <span className="new-tab-host-meta">SSH</span>
              </button>
            )
          }) : (
            <div className="new-tab-empty">
              <strong>{hosts.length > 0 ? '没有匹配的主机' : '还没有主机'}</strong>
              <p>{hosts.length > 0 ? '换个主机名、地址或用户名试试。' : '先新建一台主机，再从空白标签发起连接。'}</p>
              <button type="button" onClick={onCreateHost}>
                <Plus size={15} />
                新建主机
              </button>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}

export default function NewTabWorkspace({
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onCreateHost,
  hosts,
  onConnect,
  connectingHostIds,
  vaultUnlocked,
}: NewTabWorkspaceProps) {
  return (
    <section className="page-shell workspace-page new-tab-page">
      <main className="content-area content-area-new-tab">
        <section className="new-tab-workbench">
          <header className="new-tab-commandbar">
            <div className="new-tab-command-title">
              <span className="new-tab-command-icon">
                <Server size={16} />
              </span>
              <div>
                <h1>新标签页</h1>
                <p>从保险箱选择主机打开 SSH 会话</p>
              </div>
            </div>

            <div className="new-tab-command-actions">
              <label className="new-tab-search">
                <Search size={15} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder="搜索主机..."
                  aria-label="搜索空白标签主机"
                  aria-keyshortcuts="Control+K Meta+K"
                />
              </label>
              <button
                type="button"
                className="new-tab-primary-button"
                onClick={onCreateHost}
              >
                <Plus size={16} />
                新建主机
              </button>
            </div>
          </header>

          <div className="new-tab-body">
            <NewTabPage
              hosts={hosts}
              searchQuery={searchQuery}
              onConnect={onConnect}
              onCreateHost={onCreateHost}
              connectingHostIds={connectingHostIds}
              vaultUnlocked={vaultUnlocked}
            />
          </div>
        </section>
      </main>
    </section>
  )
}
