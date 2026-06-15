import { useEffect, useEffectEvent, useRef, type MouseEvent } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { browserOpenURL, onRuntimeEvent, readClipboardText, writeClipboardText } from '../lib/backend'
import { measureTerminalGeometry } from '../lib/terminalGeometry'
import { useTerminalPreferences, type TerminalPreferences } from '../contexts/TerminalPreferencesProvider'
import { builtinTerminalPlugins, type TerminalPluginContext, type TerminalSessionMeta } from '../lib/terminal/plugins/builtin'
import { createTerminalPluginRuntime, type TerminalPluginRuntime } from '../lib/terminal/pluginRuntime'

const MAX_SESSION_BUFFER_CHARS = 1_000_000
const TRUNCATED_BUFFER_NOTICE = '\x1b[33m[earlier output truncated]\x1b[0m\r\n'
// 分块渲染阈值：超大缓冲一次性 write 会阻塞主线程，按 32KB 分块异步写入，让出主线程响应输入 / chunked render threshold: writing a huge buffer in one shot blocks the UI thread, so write in 32KB slices and yield between them.
const RENDER_CHUNK_SIZE = 32 * 1024

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
    webLinksEnabled: terminalPreferences.webLinksEnabled,
  })
  const pluginRuntimeRef = useRef<TerminalPluginRuntime | null>(null)
  const renderTokenRef = useRef(0)
  // 正在分块渲染的 session 与已写入游标；渲染期间 appendChunk 不再直接 write，而是由渲染循环持续追赶 buffer 末尾，避免实时输出被插到旧快照中间 / the session being chunk-rendered and how far we've written; during render appendChunk does not write directly — the render loop chases the buffer tail so live output lands in order rather than ahead of the replayed backlog.
  const renderingSessionRef = useRef<string | null>(null)
  const renderingOffsetRef = useRef(0)

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

    // 每次渲染自增 token，让上一轮未完成的分块写入循环自行作废，避免标签快速切换时新旧输出叠加 / bump the token so an in-progress chunked write from a previous render cancels itself, preventing overlapping output when tabs switch quickly.
    const token = ++renderTokenRef.current
    renderingSessionRef.current = null
    renderingOffsetRef.current = 0

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

    // 小缓冲直接写入并立即完成；大缓冲进入追赶循环：每次写一块后重读 buffer 长度，如果远端在此期间追加输出，循环会继续追到新末尾，保证实时输出顺序正确 / small buffers write in one shot; larger ones enter a chase loop: after each slice we re-read the buffer length, so live output appended during replay gets written in order at the tail.
    if (output.length <= RENDER_CHUNK_SIZE) {
      terminal.write(output)
      terminal.focus()
      scheduleSyncSize()
      return
    }

    renderingSessionRef.current = activeSessionId
    renderingOffsetRef.current = 0

    const writeNext = () => {
      if (token !== renderTokenRef.current) {
        // 渲染被新 token 取代：清空渲染标记，appendChunk 恢复直接写入 / a newer render superseded us; drop the rendering marker so appendChunk writes directly again.
        if (renderingSessionRef.current === activeSessionId) {
          renderingSessionRef.current = null
          renderingOffsetRef.current = 0
        }
        return
      }
      const sessionId = activeSessionId
      const current = buffersRef.current.get(sessionId) || ''
      const offset = renderingOffsetRef.current
      if (offset >= current.length) {
        // 已追上 buffer 末尾：渲染完成，恢复 appendChunk 直接写入 / caught up to the buffer tail; render is done, let appendChunk write directly again.
        renderingSessionRef.current = null
        renderingOffsetRef.current = 0
        terminal.focus()
        scheduleSyncSize()
        return
      }
      const end = Math.min(offset + RENDER_CHUNK_SIZE, current.length)
      terminal.write(current.slice(offset, end))
      renderingOffsetRef.current = end
      setTimeout(writeNext, 0)
    }
    writeNext()
  })

  const appendChunk = useEffectEvent((sessionId: string, chunk: unknown) => {
    const text = typeof chunk === 'string' ? chunk : String(chunk ?? '')
    notifyPluginOutput(sessionId, text)

    const previous = buffersRef.current.get(sessionId) || ''
    const next = trimSessionBuffer(previous + text)
    buffersRef.current.set(sessionId, next)

    // 当前 session 正在分块追赶时跳过直接写入：buffer 已更新，渲染循环会按顺序把新内容写到末尾，避免实时输出插到旧回放内容中间 / when the active session is mid-chunk-replay, skip the direct write — the buffer is already updated and the render loop will tail-chase the new content in order, preventing live output from landing ahead of the backlog.
    if (sessionId === renderingSessionRef.current) {
      return
    }
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

    const rootStyles = getComputedStyle(document.documentElement)
    const terminalTheme = {
      background: rootStyles.getPropertyValue('--terminal-bg').trim() || '#111111',
      foreground: rootStyles.getPropertyValue('--terminal-fg').trim() || '#e5e5e5',
      cursor: rootStyles.getPropertyValue('--terminal-cursor').trim() || '#6ee7b7',
    }

    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: false,
      cursorStyle: 'bar',
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      scrollback: 10000,
      theme: terminalTheme,
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
      openExternalURL: browserOpenURL,
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
    const currentRenderToken = renderTokenRef.current

    return () => {
      if (fitFrameRef.current) {
        window.cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }
      // 作废任何未完成的分块渲染循环，避免在已卸载的 terminal 上继续写入 / invalidate any in-flight chunked render loop so it stops writing to the disposed terminal.
      renderTokenRef.current = currentRenderToken + 1
      renderingSessionRef.current = null
      renderingOffsetRef.current = 0

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
      webLinksEnabled: terminalPreferences.webLinksEnabled,
    }
    preferencesRef.current = nextPreferences
    notifyPluginPreferencesChange(nextPreferences)
  }, [terminalPreferences.quickEditEnabled, terminalPreferences.webLinksEnabled])

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
