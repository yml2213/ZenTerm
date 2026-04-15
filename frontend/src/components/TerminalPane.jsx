import { useEffect, useEffectEvent, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'

import { onRuntimeEvent } from '../lib/backend'

export default function TerminalPane({
  sessionId,
  hostLabel,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
}) {
  const terminalContainerRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)

  const syncSize = useEffectEvent(async () => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current

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

  const handleInput = useEffectEvent(async (data) => {
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
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "IBM Plex Mono", "SF Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: 'var(--terminal-bg)',
        foreground: 'var(--terminal-fg)',
        cursor: 'var(--terminal-cursor)',
        black: '#000000',
        blue: '#53c6ff',
        brightBlue: '#8be0ff',
        brightCyan: '#8ef4d6',
        brightGreen: '#b5f28c',
        brightMagenta: '#ffd0a8',
        brightRed: '#ff8d83',
        brightWhite: '#f7fffd',
        brightYellow: '#ffe58a',
        cyan: '#5ddbcc',
        green: '#8fcf63',
        magenta: '#f0b48b',
        red: '#ff6f61',
        white: '#b8d6d1',
        yellow: '#f1cb65',
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
    terminal.write('\x1b[1;32mZenTerm\x1b[0m ready.\r\n')
    terminal.write('Select a host and connect to start your shell.\r\n')
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
      disposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [handleInput, syncSize])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.reset()
    terminal.clear()

    if (!sessionId) {
      terminal.writeln('\x1b[33mNo active session.\x1b[0m')
      terminal.writeln('Connect a host to begin.')
      return
    }

    terminal.writeln(`\x1b[32mConnected:\x1b[0m ${hostLabel}`)
    void syncSize()

    const offData = onRuntimeEvent(`term:data:${sessionId}`, (data) => {
      terminal.write(typeof data === 'string' ? data : String(data ?? ''))
    })
    const offError = onRuntimeEvent(`term:error:${sessionId}`, (message) => {
      terminal.writeln(`\r\n\x1b[31m[error]\x1b[0m ${String(message ?? '')}`)
      onError(message)
    })
    const offClosed = onRuntimeEvent(`term:closed:${sessionId}`, () => {
      terminal.writeln('\r\n\x1b[33m[session closed]\x1b[0m')
      onSessionClosed()
    })

    return () => {
      offData()
      offError()
      offClosed()
    }
  }, [hostLabel, onError, onSessionClosed, sessionId, syncSize])

  return (
    <section className="panel terminal-panel">
      <div className="terminal-toolbar">
        <div>
          <span className="panel-kicker">Live Session</span>
          <h2>{sessionId ? hostLabel : 'Zen Console'}</h2>
        </div>
      </div>

      <div ref={terminalContainerRef} className="terminal-surface" />
    </section>
  )
}
