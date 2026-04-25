import { useEffect, useEffectEvent, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { onRuntimeEvent } from '../lib/backend.js'

function readPixelValue(style, property) {
  const value = Number.parseFloat(style.getPropertyValue(property))
  return Number.isFinite(value) ? value : 0
}

function measureTerminalGeometry(terminal, container, fitAddon) {
  const bounds = container.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const core = terminal._core
  const cell = core?._renderService?.dimensions?.css?.cell
  if (!cell || cell.width <= 0 || cell.height <= 0) {
    return fitAddon.proposeDimensions() || null
  }

  const style = window.getComputedStyle(container)
  const availableWidth = bounds.width
    - readPixelValue(style, 'padding-left')
    - readPixelValue(style, 'padding-right')
    - (terminal.options.scrollback === 0 ? 0 : (core?.viewport?.scrollBarWidth || 0))
  const availableHeight = bounds.height
    - readPixelValue(style, 'padding-top')
    - readPixelValue(style, 'padding-bottom')

  return {
    cols: Math.max(2, Math.floor(availableWidth / cell.width)),
    rows: Math.max(1, Math.floor(availableHeight / cell.height)),
  }
}

export default function TerminalPane({
  sessions,
  activeSessionId,
  activeSessionTitle,
  onSendInput,
  onResize,
  onSessionClosed,
  onError,
}) {
  const terminalContainerRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)
  const activeSessionIdRef = useRef(null)
  const fitFrameRef = useRef(null)
  const buffersRef = useRef(new Map())
  const unsubscribeMapRef = useRef(new Map())

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
      cursorBlink: false,
      cursorStyle: 'bar',
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      theme: {
        background: '#141526',
        foreground: '#dfe8f2',
        cursor: '#6ee7b7',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(terminalContainerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

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
    resizeObserver.observe(terminalContainerRef.current)

    return () => {
      if (fitFrameRef.current) {
        window.cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }

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
  }, [handleInput, scheduleSyncSize])

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
      <div ref={terminalContainerRef} className="terminal-surface" />
    </section>
  )
}
