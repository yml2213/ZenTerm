import { HardDrive, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface PaneEmptyStateProps {
  sourceLabel: string
  sourceIcon: LucideIcon
  title: string
  description: string
  actions?: ReactNode
  extra?: ReactNode
}

export default function PaneEmptyState({
  sourceLabel,
  sourceIcon: SourceIcon,
  title,
  description,
  actions = null,
  extra = null,
}: PaneEmptyStateProps) {
  return (
    <section className="sftp-pane">
      <header className="sftp-pane-topbar">
        <div className="sftp-pane-tabbar">
          <div className="sftp-pane-tab">
            <SourceIcon size={14} />
            <span>{sourceLabel}</span>
          </div>
        </div>
      </header>

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
