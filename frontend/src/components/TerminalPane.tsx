import { useEffect, useEffectEvent, useRef, type MouseEvent } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { onRuntimeEvent, readClipboardText, writeClipboardText } from '../lib/backend'
import { measureTerminalGeometry } from '../lib/terminalGeometry'
import { useTerminalPreferences, type TerminalPreferences } from '../contexts/TerminalPreferencesProvider'
import { builtinTerminalPlugins, type TerminalPluginContext, type TerminalSessionMeta } from '../lib/terminal/plugins/builtin'
import { createTerminalPluginRuntime, type TerminalPluginRuntime } from '../lib/terminal/pluginRuntime'

const MAX_SESSION_BUFFER_CHARS = 1_000_000
const TRUNCATED_BUFFER_NOTICE = '\x1b[33m[earlier output truncated]\x1b[0m\r\n'

type Session = TerminalSessionMeta

interface TerminalPaneProps {
  sessions: Session[]
  activeSessionId: string | null
  activeSessionTitle: string
  activeSessionMeta?: Session | null
  visible: boolean
  onSendInput: (sessionId: string, data: string) => Promise<void>
  onResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  onSessionClosed: (sessionId: string) => void
  onError: (error: unknown) => void
}

function trimSessionBuffer(content: string): string {
  if (content.length <= MAX_SESSION_BUFFER_CHARS) {
    return content
  }

  return TRUNCATED_BUFFER_NOTICE + content.slice(-MAX_SESSION_BUFFER_CHARS)
}

export default function TerminalPane({
  sessions,
  activeSessionId,
  activeSessionTitle,
  visible,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
}: TerminalPaneProps) {
  const terminalPreferences = useTerminalPreferences()
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const fitFrameRef = useRef<number | null>(null)
  const buffersRef = useRef(new Map<string, string>())
  const unsubscribeMapRef = useRef(new Map<string, () => void>())
  const sessionsRef = useRef<Session[]>(sessions)
  const preferencesRef = useRef<TerminalPreferences>({
    quickEditEnabled: terminalPreferences.quickEditEnabled,
  })
  const pluginRuntimeRef = useRef<TerminalPluginRuntime | null>(null)

  const syncSize = useEffectEvent(async () => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    const container = terminalContainerRef.current
    const sessionId = activeSessionIdRef.current

    if (!terminal || !fitAddon || !container) {
      return
    }

    const geometry = measureTerminalGeometry(terminal, container, fitAddon)
    if (!geometry) {
      return
    }

    if (terminal.cols !== geometry.cols || terminal.rows !== geometry.rows) {
      terminal.resize(geometry.cols, geometry.rows)
    }

    if (sessionId && terminal.cols > 0 && terminal.rows > 0) {
      try {
        await onResize(sessionId, terminal.cols, terminal.rows)
      } catch (error) {
        onError(error)
      }
    }
  })

  const scheduleSyncSize = useEffectEvent(() => {
    if (fitFrameRef.current) {
      window.cancelAnimationFrame(fitFrameRef.current)
    }

    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = window.requestAnimationFrame(() => {
        fitFrameRef.current = null
        void syncSize()
      })
    })
  })

  const reportPluginError = useEffectEvent((error: unknown) => {
    onError(error)
  })

  const runPluginInput = useEffectEvent(async (data: string) => {
    return pluginRuntimeRef.current?.handleInput(data) ?? data
  })

  const notifyPluginOutput = useEffectEvent((sessionId: string, chunk: string) => {
    pluginRuntimeRef.current?.handleOutput(sessionId, chunk)
  })

  const notifyPluginSessionChange = useEffectEvent((sessionId: string | null) => {
    pluginRuntimeRef.current?.handleSessionChange(sessionId)
  })

  const notifyPluginPreferencesChange = useEffectEvent((preferences: TerminalPreferences) => {
    pluginRuntimeRef.current?.handlePreferencesChange(preferences)
  })

  const renderActiveBuffer = useEffectEvent(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.reset()
    terminal.clear()

    if (!activeSessionId) {
      terminal.writeln('\x1b[33mNo active session.\x1b[0m')
      terminal.writeln('Connect a host to begin.')
      scheduleSyncSize()
      return
    }

    const output = buffersRef.current.get(activeSessionId) || `\x1b[32mConnected:\x1b[0m ${activeSessionTitle}\r\n`
    buffersRef.current.set(activeSessionId, output)
    terminal.write(output)
    terminal.focus()
    scheduleSyncSize()
  })

  const appendChunk = useEffectEvent((sessionId: string, chunk: unknown) => {
    const text = typeof chunk === 'string' ? chunk : String(chunk ?? '')
    notifyPluginOutput(sessionId, text)

    const previous = buffersRef.current.get(sessionId) || ''
    const next = trimSessionBuffer(previous + text)
    buffersRef.current.set(sessionId, next)

    if (sessionId === activeSessionIdRef.current && terminalRef.current) {
      terminalRef.current.write(text)
    }
  })

  const appendError = useEffectEvent((sessionId: string, message: unknown) => {
    const text = `\r\n\x1b[31m[error]\x1b[0m ${String(message ?? '')}`
    appendChunk(sessionId, text)

    if (sessionId === activeSessionIdRef.current) {
      onError(message)
    }
  })

  const appendClosed = useEffectEvent((sessionId: string) => {
    appendChunk(sessionId, '\r\n\x1b[33m[session closed]\x1b[0m\r\n')
    onSessionClosed(sessionId)
  })

  const handleInput = useEffectEvent(async (data: string) => {
    const nextData = await runPluginInput(data)
    if (nextData === false || nextData === '') {
      return
    }

    const sessionId = activeSessionIdRef.current
    if (!sessionId) {
      return
    }

    try {
      await onSendInput(sessionId, nextData)
    } catch (error) {
      onError(error)
    }
  })

  async function handleTerminalContextMenu(event: MouseEvent<HTMLDivElement>) {
    await pluginRuntimeRef.current?.handleContextMenu(event)
  }

  useEffect(() => {
    const terminalContainer = terminalContainerRef.current
    if (!terminalContainer) {
      return undefined
    }

    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'bar',
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      scrollback: 10000,
      theme: {
        background: '#141526',
        foreground: '#dfe8f2',
        cursor: '#6ee7b7',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(terminalContainer)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const pluginContext: TerminalPluginContext = {
      terminal,
      container: terminalContainer,
      getActiveSessionId: () => activeSessionIdRef.current,
      getSessions: () => sessionsRef.current,
      getPreferences: () => preferencesRef.current,
      readClipboardText,
      writeClipboardText,
      reportError: reportPluginError,
    }
    pluginRuntimeRef.current = createTerminalPluginRuntime(builtinTerminalPlugins, pluginContext)

    terminal.write('\x1b[1;32mZenTerm\x1b[0m workspace ready.\r\n')
    terminal.write('Select a host card and start a new tab to open your shell.\r\n')
    scheduleSyncSize()

    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        scheduleSyncSize()
      })
    }

    const disposable = terminal.onData((data) => {
      void handleInput(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      scheduleSyncSize()
    })
    resizeObserver.observe(terminalContainer)

    const unsubscribeMap = unsubscribeMapRef.current
    const buffers = buffersRef.current

    return () => {
      if (fitFrameRef.current) {
        window.cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }

      resizeObserver.disconnect()
      disposable.dispose()

      for (const [, unsubscribe] of unsubscribeMap) {
        unsubscribe()
      }
      unsubscribeMap.clear()
      buffers.clear()
      pluginRuntimeRef.current?.dispose()
      pluginRuntimeRef.current = null
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
    renderActiveBuffer()
    notifyPluginSessionChange(activeSessionId)
  }, [activeSessionId, activeSessionTitle])

  useEffect(() => {
    if (!visible) {
      return
    }

    terminalRef.current?.focus()
    scheduleSyncSize()
  }, [visible])

  useEffect(() => {
    const nextPreferences = {
      quickEditEnabled: terminalPreferences.quickEditEnabled,
    }
    preferencesRef.current = nextPreferences
    notifyPluginPreferencesChange(nextPreferences)
  }, [terminalPreferences.quickEditEnabled])

  useEffect(() => {
    sessionsRef.current = sessions
    const activeIds = new Set(sessions.map((session) => session.sessionId))

    for (const session of sessions) {
      if (!buffersRef.current.has(session.sessionId)) {
        buffersRef.current.set(session.sessionId, `\x1b[32mConnected:\x1b[0m ${session.title}\r\n`)
      }

      if (unsubscribeMapRef.current.has(session.sessionId)) {
        continue
      }

      const offData = onRuntimeEvent(`term:data:${session.sessionId}`, (data) => {
        appendChunk(session.sessionId, data)
      })
      const offError = onRuntimeEvent(`term:error:${session.sessionId}`, (message) => {
        appendError(session.sessionId, message)
      })
      const offClosed = onRuntimeEvent(`term:closed:${session.sessionId}`, () => {
        appendClosed(session.sessionId)
      })

      unsubscribeMapRef.current.set(session.sessionId, () => {
        offData()
        offError()
        offClosed()
      })
    }

    for (const [sessionId, unsubscribe] of unsubscribeMapRef.current) {
      if (activeIds.has(sessionId)) {
        continue
      }

      unsubscribe()
      unsubscribeMapRef.current.delete(sessionId)
      buffersRef.current.delete(sessionId)
    }
  }, [sessions])

  return (
    <section className="panel terminal-panel">
      <div
        ref={terminalContainerRef}
        className="terminal-surface"
        onContextMenu={handleTerminalContextMenu}
      />
    </section>
  )
}
