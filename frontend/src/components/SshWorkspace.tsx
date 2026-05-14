import { Suspense, lazy, type ComponentType } from 'react'

const TerminalPane = lazy(() => import('./TerminalPane'))

interface Session {
  sessionId: string
  title: string
}

interface SshWorkspaceProps {
  sessionTabs: Session[]
  activeSessionId: string | null
  activeSession: Session | null
  onSendInput: (sessionId: string, data: string) => Promise<void>
  onResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  onSessionClosed: (sessionId: string) => void
  onError: (error: unknown) => void
  PanelFallback: ComponentType<{
    className?: string
    kicker?: string
    title?: string
    description?: string
  }>
}

export default function SshWorkspace({
  sessionTabs,
  activeSessionId,
  activeSession,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
  PanelFallback,
}: SshWorkspaceProps) {
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
