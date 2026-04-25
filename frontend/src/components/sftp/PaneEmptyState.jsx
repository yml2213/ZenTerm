import { HardDrive } from 'lucide-react'

export default function PaneEmptyState({
  sourceLabel,
  sourceIcon: SourceIcon,
  title,
  description,
  actions = null,
  extra = null,
}) {
  return (
    <section className="sftp-pane">
      <header className="sftp-pane-topbar">
        <div className="sftp-pane-topbar-main">
          <div className="sftp-pane-source">
            <span className="sftp-pane-source-icon">
              <SourceIcon size={15} />
            </span>
            <div className="sftp-pane-source-copy">
              <strong>{sourceLabel}</strong>
              <span>文件浏览器</span>
            </div>
          </div>
        </div>
      </header>

      <div className="sftp-pane-toolbar sftp-pane-toolbar-placeholder" aria-hidden="true" />

      <div className="sftp-empty-state">
        <div className="sftp-empty-icon">
          <HardDrive size={24} />
        </div>
        <div className="sftp-empty-copy">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        {actions}
        {extra}
      </div>
    </section>
  )
}
