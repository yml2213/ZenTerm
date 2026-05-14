import TerminalPane from './TerminalPane'

interface Session {
  sessionId: string
  title: string
  hostID?: string
  remoteAddr?: string
  connectedAt?: string
}

interface SshWorkspaceProps {
  sessionTabs: Session[]
  activeSessionId: string | null
  activeSession: Session | null
  onSendInput: (sessionId: string, data: string) => Promise<void>
  onResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  onSessionClosed: (sessionId: string) => void
  onError: (error: unknown) => void
}

export default function SshWorkspace({
  sessionTabs,
  activeSessionId,
  activeSession,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
}: SshWorkspaceProps) {
  return (
    <section className="page-shell workspace-page ssh-page">
      <main className="content-area content-area-terminal">
        <section className="ssh-stage">
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
        </section>
      </main>
    </section>
  )
}
