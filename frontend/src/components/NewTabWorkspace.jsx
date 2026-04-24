import { Plus, Search, TerminalSquare } from 'lucide-react'
import { matchesHost, sortHosts } from '../lib/appHostUtils.js'

function NewTabPage({
  hosts,
  searchQuery,
  onConnect,
  onCreateHost,
  connectingHostIds,
  vaultUnlocked,
}) {
  const filteredHosts = sortHosts(hosts.filter((host) => matchesHost(host, searchQuery)))

  return (
    <section className="new-tab-surface">
      <section className="new-tab-card" aria-label="最近连接">
        <header className="new-tab-card-head">
          <h2>最近连接</h2>
          <div className="new-tab-card-actions">
            <button type="button" onClick={onCreateHost}>
              新建主机
            </button>
            <button type="button" disabled>
              恢复会话
            </button>
          </div>
        </header>

        <div className="new-tab-host-list">
          {filteredHosts.length > 0 ? (
            filteredHosts.map((host) => {
              const connecting = connectingHostIds.includes(host.id)

              return (
                <button
                  type="button"
                  key={host.id}
                  className="new-tab-host-row"
                  onClick={() => onConnect(host.id)}
                  disabled={!vaultUnlocked || connecting}
                >
                  <span className="new-tab-host-icon">
                    <TerminalSquare size={15} />
                  </span>
                  <span className="new-tab-host-copy">
                    <span className="new-tab-host-name">{host.name || host.id}</span>
                    <span className="new-tab-host-subtitle">{host.username}@{host.address}:{host.port || 22}</span>
                  </span>
                  <span className="new-tab-host-meta">SSH</span>
                </button>
              )
            })
          ) : (
            <div className="new-tab-empty">
              <strong>{hosts.length > 0 ? '没有匹配的主机' : '还没有主机'}</strong>
              <p>{hosts.length > 0 ? '换个主机名、地址或用户名试试。' : '先新建一台主机，再从空白标签发起连接。'}</p>
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
}) {
  return (
    <section className="page-shell workspace-page new-tab-page">
      <header className="page-toolbar">
        <div className="page-toolbar-main">
          <div className="page-intro-copy page-toolbar-copy">
            <span className="panel-kicker">Vaults</span>
            <h1>新标签页</h1>
            <p>选择一台保险箱中的主机来打开 SSH 会话，或先新建主机。</p>
          </div>
        </div>

        <div className="page-toolbar-actions hosts">
          <div className="page-toolbar-search-slot">
            <label className="search-bar search-bar-compact">
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
          </div>
          <div className="page-toolbar-meta hosts">
            <button
              type="button"
              className="toolbar-btn primary"
              onClick={onCreateHost}
            >
              <Plus size={16} />
              新建主机
            </button>
          </div>
        </div>
      </header>
      <main className="content-area content-area-new-tab">
        <NewTabPage
          hosts={hosts}
          searchQuery={searchQuery}
          onConnect={onConnect}
          onCreateHost={onCreateHost}
          connectingHostIds={connectingHostIds}
          vaultUnlocked={vaultUnlocked}
        />
      </main>
    </section>
  )
}
