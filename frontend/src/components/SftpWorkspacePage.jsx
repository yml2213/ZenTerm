import { Suspense, lazy } from 'react'

let sftpWorkspaceModulePromise

function loadSftpWorkspace() {
  if (!sftpWorkspaceModulePromise) {
    sftpWorkspaceModulePromise = import('./SftpWorkspace.jsx')
  }
  return sftpWorkspaceModulePromise
}

export function preloadSftpWorkspace() {
  void loadSftpWorkspace()
}

const SftpWorkspace = lazy(loadSftpWorkspace)

function SftpWorkspaceFallback() {
  return (
    <section className="sftp-shell sftp-shell-loading" aria-label="正在加载 SFTP 工作区">
      <div className="sftp-browser">
        {['Local', 'Remote'].map((label) => (
          <section key={label} className={`sftp-pane${label === 'Local' ? ' sftp-pane-local' : ''}`}>
            <header className="sftp-pane-topbar">
              <div className="sftp-pane-tabbar">
                <div className="sftp-pane-tab">
                  <span className="sftp-loading-block" />
                  <span>{label}</span>
                </div>
              </div>
            </header>
            <div className="sftp-file-table">
              <div className="sftp-file-head" aria-hidden="true" />
              <div className="sftp-file-body" aria-hidden="true" />
            </div>
            <footer className="sftp-pane-footer" aria-hidden="true" />
          </section>
        ))}
      </div>
    </section>
  )
}

export default function SftpWorkspacePage({
  hosts,
  selectedHost,
  vaultUnlocked,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
  onError,
}) {
  return (
    <section className="page-shell workspace-page sftp-page">
      <main className="content-area content-area-flush">
        <Suspense fallback={<SftpWorkspaceFallback />}>
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
