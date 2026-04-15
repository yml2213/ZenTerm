import {
  ChevronRight,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  List,
  MonitorSmartphone,
  RefreshCw,
  Search,
  Star,
} from 'lucide-react'

const localEntries = [
  { name: '..', modifiedAt: '--', size: '--', type: 'Folder', parent: true },
  { name: 'Applications', modifiedAt: '2026-04-12 22:56', size: '--', type: 'Folder' },
  { name: 'codes', modifiedAt: '2026-04-15 10:31', size: '--', type: 'Folder' },
  { name: 'Desktop', modifiedAt: '2026-04-15 10:09', size: '--', type: 'Folder' },
  { name: 'Documents', modifiedAt: '2026-04-13 20:32', size: '--', type: 'Folder' },
  { name: 'Downloads', modifiedAt: '2026-04-15 16:07', size: '--', type: 'Folder' },
  { name: 'go', modifiedAt: '2026-04-15 12:13', size: '--', type: 'Folder' },
  { name: 'Library', modifiedAt: '2026-04-13 20:41', size: '--', type: 'Folder' },
  { name: 'Movies', modifiedAt: '2026-04-13 05:54', size: '--', type: 'Folder' },
  { name: 'Music', modifiedAt: '2026-04-12 17:57', size: '--', type: 'Folder' },
  { name: 'Pictures', modifiedAt: '2026-04-12 17:44', size: '--', type: 'Folder' },
  { name: 'Public', modifiedAt: '2026-04-12 17:44', size: '--', type: 'Folder' },
]

const toolbarActions = [
  { label: '收藏', icon: Star },
  { label: '列表', icon: List },
  { label: '搜索', icon: Search },
  { label: '新建文件夹', icon: FolderPlus },
  { label: '新建文件', icon: FilePlus2 },
  { label: '刷新', icon: RefreshCw },
]

export default function SftpWorkspace({
  hosts,
  selectedHost,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
}) {
  const hasHosts = hosts.length > 0

  return (
    <section className="sftp-shell" aria-label="SFTP 工作区">
      <div className="sftp-browser">
        <section className="sftp-pane sftp-pane-local">
          <header className="sftp-pane-topbar">
            <button type="button" className="sftp-source-tab active">
              <MonitorSmartphone size={14} />
              <span>Local</span>
            </button>
            <button type="button" className="sftp-close-tab" aria-label="关闭本地标签">
              ×
            </button>
            <button type="button" className="sftp-add-tab" aria-label="新增 SFTP 标签">
              +
            </button>
          </header>

          <div className="sftp-local-toolbar">
            <div className="sftp-breadcrumb">
              <Home size={14} />
              <ChevronRight size={14} />
              <span>Users</span>
              <ChevronRight size={14} />
              <strong>yml</strong>
            </div>

            <div className="sftp-toolbar-actions">
              {toolbarActions.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    type="button"
                    className="sftp-toolbar-btn"
                    aria-label={action.label}
                    title={action.label}
                  >
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="sftp-file-table">
            <div className="sftp-file-head">
              <span>名称 ↑</span>
              <span>修改时间</span>
              <span>大小</span>
              <span>类型</span>
            </div>

            <div className="sftp-file-body">
              {localEntries.map((entry) => (
                <div key={entry.name} className={`sftp-file-row${entry.parent ? ' is-parent' : ''}`}>
                  <div className="sftp-file-name">
                    <span className="sftp-file-icon">
                      {entry.parent ? <FolderOpen size={16} /> : <Folder size={16} />}
                    </span>
                    <strong>{entry.name}</strong>
                  </div>
                  <span>{entry.modifiedAt}</span>
                  <span>{entry.size}</span>
                  <span>{entry.type}</span>
                </div>
              ))}
            </div>
          </div>

          <footer className="sftp-pane-footer">
            <span>{localEntries.length} 个项目</span>
            <span>/Users/yml</span>
          </footer>
        </section>

        <section className="sftp-pane sftp-pane-remote">
          {selectedHost ? (
            <div className="sftp-empty-state has-host">
              <div className="sftp-empty-icon">
                <HardDrive size={24} />
              </div>
              <div className="sftp-empty-copy">
                <strong>{selectedHost.name || selectedHost.id}</strong>
                <p>{selectedHost.username}@{selectedHost.address}:{selectedHost.port || 22}</p>
                <small>SFTP 远端目录浏览器是下一步接入的能力，这里先保留完整工作区结构与主机上下文。</small>
              </div>

              <div className="sftp-host-meta">
                <span className="pill subtle">远端浏览器待接入</span>
                <span className="pill subtle">{selectedHost.known_hosts ? '已信任主机' : '首次连接需校验指纹'}</span>
              </div>

              <div className="sftp-empty-actions">
                <button type="button" className="primary-button" onClick={onChooseHost}>
                  切换主机
                </button>
                <button type="button" className="ghost-button" onClick={onBackToVaults}>
                  返回 Vaults
                </button>
              </div>
            </div>
          ) : (
            <div className="sftp-empty-state">
              <div className="sftp-empty-icon">
                <HardDrive size={24} />
              </div>
              <div className="sftp-empty-copy">
                <strong>先选择一个主机</strong>
                <p>选择要浏览的本地或远端文件系统</p>
              </div>

              <div className="sftp-empty-actions">
                {hasHosts ? (
                  <button type="button" className="primary-button" onClick={onChooseHost}>
                    选择主机
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={onCreateHost}>
                    新建主机
                  </button>
                )}
              </div>

              {hasHosts ? (
                <div className="sftp-host-picker">
                  {hosts.slice(0, 4).map((host) => (
                    <button
                      key={host.id}
                      type="button"
                      className="sftp-host-chip"
                      onClick={() => onChooseHost(host.id)}
                    >
                      <span>{host.name || host.id}</span>
                      <small>{host.username}@{host.address}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
