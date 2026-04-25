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
              <div className="sftp-pane-topbar-main">
                <div className="sftp-pane-source">
                  <span className="sftp-pane-source-icon sftp-loading-block" />
                  <div className="sftp-pane-source-copy">
                    <strong>{label}</strong>
                    <span>文件浏览器</span>
                  </div>
                </div>
              </div>
            </header>
            <div className="sftp-pane-toolbar sftp-pane-toolbar-placeholder" aria-hidden="true" />
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
