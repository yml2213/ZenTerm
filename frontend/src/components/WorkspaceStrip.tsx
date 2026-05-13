import { FolderLock, FolderOpen, Plus } from 'lucide-react'
import SessionTabs from './SessionTabs.jsx'

export default function WorkspaceStrip({
  activeWorkspace,
  workspaceTabs,
  activeWorkspaceTabId,
  onWorkspaceChange,
  onWorkspaceStripDoubleClick,
  onWorkspaceTabSelect,
  onWorkspaceTabClose,
  onOpenNewTab,
  onCycleTheme,
  onPreloadSftp,
  themeIcon: ThemeIcon,
  vaultsLabel,
  sftpLabel,
}) {
  return (
    <section className="workspace-strip" onDoubleClick={onWorkspaceStripDoubleClick}>
      <div className="workspace-modules">
        <button
          type="button"
          className={`workspace-module${activeWorkspace === 'vaults' ? ' active' : ''}`}
          onClick={() => onWorkspaceChange('vaults')}
          aria-pressed={activeWorkspace === 'vaults'}
        >
          <FolderLock size={15} />
          {vaultsLabel}
        </button>
        <button
          type="button"
          className={`workspace-module${activeWorkspace === 'sftp' ? ' active' : ''}`}
          onFocus={onPreloadSftp}
          onMouseEnter={onPreloadSftp}
          onClick={() => onWorkspaceChange('sftp')}
          aria-pressed={activeWorkspace === 'sftp'}
        >
          <FolderOpen size={15} />
          {sftpLabel}
        </button>
      </div>
      <div className={`workspace-tab-strip${workspaceTabs.length > 0 ? ' has-tabs' : ''}`}>
        {workspaceTabs.length > 0 ? (
          <SessionTabs
            className="workspace-tabs"
            sessions={workspaceTabs}
            activeSessionId={activeWorkspaceTabId}
            onSelect={onWorkspaceTabSelect}
            onClose={onWorkspaceTabClose}
            emptyLabel="还没有打开的 SSH 终端标签"
            emptyDescription="连接任意主机后，打开的 SSH 会话会显示在这条顶部工作条里。"
          />
        ) : null}
        <button
          type="button"
          className="workspace-new-tab-btn"
          onClick={onOpenNewTab}
          aria-label="新增标签页"
        >
          <Plus size={18} />
        </button>
      </div>
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={onCycleTheme}
        aria-label="切换主题"
      >
        <ThemeIcon size={15} />
      </button>
    </section>
  )
}
