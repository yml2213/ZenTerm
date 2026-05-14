import SftpWorkspace from './SftpWorkspace'
import { main } from '../wailsjs/wailsjs/go/models'

type Host = main.Host

interface SftpWorkspacePageProps {
  hosts: Host[]
  selectedHost: Host | null
  vaultUnlocked: boolean
  onChooseHost: (hostId?: string | null) => void
  onCreateHost: () => void
  onBackToVaults: () => void
  onError: (message: string) => void
}

export default function SftpWorkspacePage({
  hosts,
  selectedHost,
  vaultUnlocked,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
  onError,
}: SftpWorkspacePageProps) {
  return (
    <section className="page-shell workspace-page sftp-page">
      <main className="content-area content-area-flush">
        <SftpWorkspace
          hosts={hosts}
          selectedHost={selectedHost}
          vaultUnlocked={vaultUnlocked}
          onChooseHost={onChooseHost}
          onCreateHost={onCreateHost}
          onBackToVaults={onBackToVaults}
          onError={onError}
        />
      </main>
    </section>
  )
}
