import {
  Clock3,
  FolderOpen,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings2,
  Star,
  Tags,
  TerminalSquare,
} from 'lucide-react'
import { Suspense, lazy } from 'react'
import HostList from './HostList.jsx'

const VaultSettingsPanel = lazy(() => import('./VaultSettingsPanel.jsx'))
const KnownHostsPanel = lazy(() => import('./KnownHostsPanel.jsx'))
const KeychainPanel = lazy(() => import('./KeychainPanel.jsx'))
const SessionLogPanel = lazy(() => import('./SessionLogPanel.jsx'))

export default function VaultWorkspace({
  navigationItems,
  activeSidebarPage,
  onSidebarPageChange,
  isHostsPage,
  hostFilterKey,
  onHostFilterChange,
  hosts,
  favoriteHostCount,
  recentHostCount,
  hostGroups,
  hostTags,
  resolvedPageHeader,
  hostSearchInputRef,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
  hostViewMode,
  onHostViewModeChange,
  onCreateHost,
  newHostLabel,
  filteredHosts,
  selectedHostId,
  sessionCountByHost,
  connectingHostIds,
  onSelectHost,
  onConnectHost,
  onEditHost,
  onDeleteHost,
  onCopyHostAddress,
  onToggleFavorite,
  vaultUnlocked,
  isSettingsPage,
  changeMasterForm,
  changeMasterBusy,
  resetVaultConfirmed,
  resetVaultBusy,
  onChangeMasterField,
  onChangeMasterPassword,
  onResetVaultConfirmedChange,
  onResetVault,
  PanelFallback,
  isKnownHostsPage,
  isKeychainPage,
  isLogsPage,
  keychainStatus,
  keychainLoading,
  vaultInitialized,
  onRefreshKeychainStatus,
  hostDrawer,
}) {
  return (
    <div className={`app-content${hostDrawer ? ' app-content-drawer-open' : ''}`}>
      <aside className="sidebar">
        <section className="sidebar-brand-card">
          <div className="sidebar-brand-icon">
            <TerminalSquare size={18} />
          </div>
          <div className="sidebar-brand-copy">
            <strong>ZenTerm</strong>
            <span>SSH Workbench</span>
          </div>
        </section>

        <nav className="sidebar-nav" aria-label="工作台导航">
          {navigationItems.map((item) => {
            const Icon = item.icon

            return (
              <button
                type="button"
                key={item.id}
                className={`sidebar-nav-item${activeSidebarPage === item.id ? ' active' : ''}`}
                aria-current={activeSidebarPage === item.id ? 'page' : undefined}
                onClick={() => onSidebarPageChange(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {isHostsPage ? (
          <section className="sidebar-filter-section" aria-label="主机筛选">
            <div className="sidebar-filter-head">
              <span className="sidebar-label">Views</span>
              {hostFilterKey !== 'all' ? (
                <button type="button" onClick={() => onHostFilterChange('all')}>清除</button>
              ) : null}
            </div>
            <div className="sidebar-filter-list">
              <button
                type="button"
                className={`sidebar-filter-item${hostFilterKey === 'all' ? ' active' : ''}`}
                onClick={() => onHostFilterChange('all')}
              >
                <LayoutGrid size={14} />
                <span>全部</span>
                <small>{hosts.length}</small>
              </button>
              <button
                type="button"
                className={`sidebar-filter-item${hostFilterKey === 'favorite' ? ' active' : ''}`}
                onClick={() => onHostFilterChange('favorite')}
              >
                <Star size={14} />
                <span>收藏</span>
                <small>{favoriteHostCount}</small>
              </button>
              <button
                type="button"
                className={`sidebar-filter-item${hostFilterKey === 'recent' ? ' active' : ''}`}
                onClick={() => onHostFilterChange('recent')}
              >
                <Clock3 size={14} />
                <span>最近连接</span>
                <small>{recentHostCount}</small>
              </button>
            </div>

            {hostGroups.length > 0 ? (
              <div className="sidebar-filter-group">
                <span className="sidebar-label">Groups</span>
                <div className="sidebar-filter-list">
                  {hostGroups.map((group) => {
                    const filterKey = `group:${group}`
                    const count = hosts.filter((host) => host.group === group).length
                    return (
                      <button
                        type="button"
                        key={filterKey}
                        className={`sidebar-filter-item${hostFilterKey === filterKey ? ' active' : ''}`}
                        onClick={() => onHostFilterChange(filterKey)}
                      >
                        <FolderOpen size={14} />
                        <span>{group}</span>
                        <small>{count}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {hostTags.length > 0 ? (
              <div className="sidebar-filter-group">
                <span className="sidebar-label">Tags</span>
                <div className="sidebar-tag-cloud">
                  {hostTags.map((tag) => {
                    const filterKey = `tag:${tag}`
                    return (
                      <button
                        type="button"
                        key={filterKey}
                        className={hostFilterKey === filterKey ? 'active' : ''}
                        onClick={() => onHostFilterChange(filterKey)}
                      >
                        <Tags size={12} />
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-nav-item${activeSidebarPage === 'settings' ? ' active' : ''}`}
            aria-current={activeSidebarPage === 'settings' ? 'page' : undefined}
            onClick={() => onSidebarPageChange('settings')}
          >
            <Settings2 size={16} />
            <span>设置</span>
          </button>
        </div>
      </aside>

      <section className="page-shell">
        <header className="page-toolbar">
          <div className={`page-toolbar-actions${isHostsPage ? ' hosts' : isKeychainPage ? ' keychain' : isKnownHostsPage ? ' known-hosts' : isLogsPage ? ' logs' : ''}`}>
            {isHostsPage ? (
              <div className="page-toolbar-search-slot">
                <label className="search-bar search-bar-compact">
                  <Search size={15} />
                  <input
                    ref={hostSearchInputRef}
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    placeholder={searchPlaceholder}
                    aria-label="搜索主机"
                    aria-keyshortcuts="Control+K Meta+K"
                  />
                </label>
              </div>
            ) : isKeychainPage ? (
              <div id="keychain-toolbar-slot" className="page-toolbar-keychain-slot" />
            ) : isKnownHostsPage ? (
              <div id="known-hosts-toolbar-slot" className="page-toolbar-known-hosts-slot" />
            ) : isLogsPage ? (
              <div id="session-log-toolbar-slot" className="page-toolbar-session-log-slot" />
            ) : (
              <div className="page-toolbar-main">
                <div className="page-intro-copy page-toolbar-copy">
                  <span className="panel-kicker">{resolvedPageHeader.kicker}</span>
                  <h1>{resolvedPageHeader.title}</h1>
                  {resolvedPageHeader.description ? <p>{resolvedPageHeader.description}</p> : null}
                </div>
              </div>
            )}
            <div className={`page-toolbar-meta${isHostsPage ? ' hosts' : ''}`}>
              {isHostsPage ? (
                <>
                  <div className="view-toggle" aria-label="主机视图切换">
                    <button
                      type="button"
                      className={hostViewMode === 'grid' ? 'active' : ''}
                      aria-pressed={hostViewMode === 'grid'}
                      onClick={() => onHostViewModeChange('grid')}
                    >
                      <LayoutGrid size={15} />
                      卡片
                    </button>
                    <button
                      type="button"
                      className={hostViewMode === 'list' ? 'active' : ''}
                      aria-pressed={hostViewMode === 'list'}
                      onClick={() => onHostViewModeChange('list')}
                    >
                      <List size={15} />
                      列表
                    </button>
                  </div>
                  <button
                    type="button"
                    className="toolbar-btn primary"
                    onClick={onCreateHost}
                  >
                    <Plus size={16} />
                    {newHostLabel}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="content-area">
          {isHostsPage ? (
            <section className="hosts-stage">
              <HostList
                hosts={filteredHosts}
                hasAnyHosts={hosts.length > 0}
                searchQuery={searchQuery}
                viewMode={hostViewMode}
                selectedHostId={selectedHostId}
                sessionCountByHost={sessionCountByHost}
                connectingHostIds={connectingHostIds}
                onSelect={onSelectHost}
                onConnect={onConnectHost}
                onEdit={onEditHost}
                onDelete={onDeleteHost}
                onCopyAddress={onCopyHostAddress}
                onToggleFavorite={onToggleFavorite}
                disabled={!vaultUnlocked}
              />
            </section>
          ) : isSettingsPage ? (
            <Suspense
              fallback={(
                <PanelFallback
                  title="正在加载保险箱设置"
                  description="设置页会在真正访问时加载，避免主流程跟着一起进入首屏包。"
                />
              )}
            >
              <VaultSettingsPanel
                vaultUnlocked={vaultUnlocked}
                changeForm={changeMasterForm}
                changeBusy={changeMasterBusy}
                resetConfirmed={resetVaultConfirmed}
                resetBusy={resetVaultBusy}
                onChangeField={onChangeMasterField}
                onChangePassword={onChangeMasterPassword}
                onResetConfirmedChange={onResetVaultConfirmedChange}
                onResetVault={onResetVault}
              />
            </Suspense>
          ) : isKnownHostsPage ? (
            <Suspense
              fallback={(
                <PanelFallback
                  title="正在加载已知主机"
                  description="可信指纹面板会在切换到该页面后再按需加载。"
                />
              )}
            >
              <KnownHostsPanel hosts={hosts} />
            </Suspense>
          ) : isKeychainPage ? (
            <Suspense
              fallback={(
                <PanelFallback
                  title="正在加载钥匙串"
                  description="凭据中心会在进入对应页面后再拉起，减少主机页初始负担。"
                />
              )}
            >
              <KeychainPanel
                status={keychainStatus}
                loading={keychainLoading}
                vaultInitialized={vaultInitialized}
                vaultUnlocked={vaultUnlocked}
                hostCount={hosts.length}
                onRefresh={onRefreshKeychainStatus}
              />
            </Suspense>
          ) : isLogsPage ? (
            <Suspense
              fallback={(
                <PanelFallback
                  title="正在加载连接日志"
                  description="连接历史会在进入日志页后按需加载。"
                />
              )}
            >
              <SessionLogPanel
                vaultUnlocked={vaultUnlocked}
                onReconnect={onConnectHost}
              />
            </Suspense>
          ) : null}
        </main>
      </section>
      {hostDrawer ? (
        <aside className="host-drawer-shell host-drawer-inline">
          {hostDrawer}
        </aside>
      ) : null}
    </div>
  )
}
