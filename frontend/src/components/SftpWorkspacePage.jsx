import { Suspense, lazy } from 'react'

const SftpWorkspace = lazy(() => import('./SftpWorkspace.jsx'))

export default function SftpWorkspacePage({
  hosts,
  selectedHost,
  vaultUnlocked,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
  onError,
  PanelFallback,
}) {
  return (
    <section className="page-shell workspace-page sftp-page">
      <main className="content-area content-area-flush">
        <Suspense
          fallback={(
            <PanelFallback
              className="panel"
              kicker="SFTP"
              title="正在加载文件工作区"
              description="SFTP 仅在切换到文件工作区时加载，避免首屏携带文件浏览逻辑。"
            />
          )}
        >
          <SftpWorkspace
            hosts={hosts}
            selectedHost={selectedHost}
            vaultUnlocked={vaultUnlocked}
            onChooseHost={onChooseHost}
            onCreateHost={onCreateHost}
            onBackToVaults={onBackToVaults}
            onError={onError}
          />
        </Suspense>
      </main>
    </section>
  )
}
