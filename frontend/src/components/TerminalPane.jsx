import { useEffect, useEffectEvent, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Activity, Server } from 'lucide-react'
import { onRuntimeEvent } from '../lib/backend.js'

export default function TerminalPane({
  sessions,
  activeSessionId,
  activeSessionTitle,
  activeSessionMeta,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
}) {
  const terminalContainerRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)
  const activeSessionIdRef = useRef(null)
  const buffersRef = useRef(new Map())
  const unsubscribeMapRef = useRef(new Map())

  const syncSize = useEffectEvent(async () => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    const sessionId = activeSessionIdRef.current

    if (!terminal || !fitAddon) {
      return
    }

    fitAddon.fit()

    if (sessionId && terminal.cols > 0 && terminal.rows > 0) {
      try {
        await onResize(sessionId, terminal.cols, terminal.rows)
      } catch (error) {
        onError(error)
      }
    }
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
      return
    }

    const output = buffersRef.current.get(activeSessionId) || `\x1b[32mConnected:\x1b[0m ${activeSessionTitle}\r\n`
    buffersRef.current.set(activeSessionId, output)
    terminal.write(output)
    void syncSize()
  })

  const appendChunk = useEffectEvent((sessionId, chunk) => {
    const text = typeof chunk === 'string' ? chunk : String(chunk ?? '')
    const previous = buffersRef.current.get(sessionId) || ''
    const next = previous + text
    buffersRef.current.set(sessionId, next)

    if (sessionId === activeSessionIdRef.current && terminalRef.current) {
      terminalRef.current.write(text)
    }
  })

  const appendError = useEffectEvent((sessionId, message) => {
    const text = `\r\n\x1b[31m[error]\x1b[0m ${String(message ?? '')}`
    appendChunk(sessionId, text)

    if (sessionId === activeSessionIdRef.current) {
      onError(message)
    }
  })

  const appendClosed = useEffectEvent((sessionId) => {
    appendChunk(sessionId, '\r\n\x1b[33m[session closed]\x1b[0m\r\n')
    onSessionClosed(sessionId)
  })

  const handleInput = useEffectEvent(async (data) => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) {
      return
    }

    try {
      await onSendInput(sessionId, data)
    } catch (error) {
      onError(error)
    }
  })

  useEffect(() => {
    if (!terminalContainerRef.current) {
      return undefined
    }

    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0a1220',
        foreground: '#d8e4f0',
        cursor: '#4fd1c5',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
    } catch {
      terminal.writeln('[ZenTerm] WebGL addon unavailable, fallback to canvas renderer.')
    }

    terminal.open(terminalContainerRef.current)
    terminal.write('\x1b[1;32mZenTerm\x1b[0m workspace ready.\r\n')
    terminal.write('Select a host card and start a new tab to open your shell.\r\n')
    fitAddon.fit()

    const disposable = terminal.onData((data) => {
      void handleInput(data)
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      void syncSize()
    })
    resizeObserver.observe(terminalContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      disposable.dispose()

      for (const [, unsubscribe] of unsubscribeMapRef.current) {
        unsubscribe()
      }
      unsubscribeMapRef.current.clear()
      buffersRef.current.clear()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [handleInput, syncSize])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
    renderActiveBuffer()
  }, [activeSessionId, activeSessionTitle, renderActiveBuffer])

  useEffect(() => {
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
  }, [appendChunk, appendClosed, appendError, sessions])

  return (
    <section className="panel terminal-panel">
      <div className="terminal-toolbar">
        <div className="terminal-toolbar-main">
          <span className="panel-kicker">Live Session</span>
          <h2>{activeSessionId ? activeSessionTitle : 'Zen Console'}</h2>
          <p>{activeSessionId ? (activeSessionMeta?.remoteAddr || activeSessionMeta?.hostID || '会话已连接') : '当前没有活跃终端，连接主机后会在这里显示 shell。'}</p>
        </div>
        <div className="terminal-toolbar-side">
          <span className={`terminal-status ${activeSessionId ? 'online' : 'idle'}`}>
            <Activity size={12} />
            {activeSessionId ? 'Connected' : 'Idle'}
          </span>
          <span className="terminal-status subtle">
            <Server size={12} />
            {sessions.length} Tabs
          </span>
        </div>
      </div>

      <div ref={terminalContainerRef} className="terminal-surface" />
    </section>
  )
}
