import { Suspense, lazy } from 'react'

const TerminalPane = lazy(() => import('./TerminalPane.jsx'))

export default function SshWorkspace({
  sessionTabs,
  activeSessionId,
  activeSession,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
  PanelFallback,
}) {
  return (
    <section className="page-shell workspace-page ssh-page">
      <main className="content-area content-area-terminal">
        <section className="ssh-stage">
          <Suspense
            fallback={(
              <PanelFallback
                className="panel terminal-panel"
                kicker="Console"
                title="正在加载终端工作区"
                description="SSH 会话会在这里作为独立界面展示。"
              />
            )}
          >
            <TerminalPane
              sessions={sessionTabs}
              activeSessionId={activeSessionId}
              activeSessionTitle={activeSession?.title || 'Zen Console'}
              activeSessionMeta={activeSession}
              onSendInput={onSendInput}
              onResize={onResize}
              onSessionClosed={onSessionClosed}
              onError={onError}
            />
          </Suspense>
        </section>
      </main>
    </section>
  )
}
