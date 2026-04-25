import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Palette, ShieldCheck, X } from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getSessionTranscript } from '../lib/backend.js'
import { measureTerminalGeometry } from '../lib/terminalGeometry.js'

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function LogWorkspace({
  activeLogTab,
  onCloseLog,
  onError,
}) {
  const surfaceRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)
  const fitFrameRef = useRef(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    if (!surfaceRef.current) {
      return undefined
    }

    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: false,
      disableStdin: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      scrollback: 10000,
      theme: {
        background: '#0d1522',
        foreground: '#dfe8f2',
        cursor: '#6ee7b7',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(surfaceRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const fit = () => {
      const surface = surfaceRef.current
      if (!surface) {
        return
      }

      const geometry = measureTerminalGeometry(terminal, surface, fitAddon)
      if (!geometry) {
        return
      }

      try {
        if (terminal.cols !== geometry.cols || terminal.rows !== geometry.rows) {
          terminal.resize(geometry.cols, geometry.rows)
        }
      } catch {
        // xterm may report zero-sized cells during the first paint.
      }
    }
    const scheduleFit = () => {
      if (fitFrameRef.current) {
        window.cancelAnimationFrame(fitFrameRef.current)
      }
      fitFrameRef.current = window.requestAnimationFrame(() => {
        fitFrameRef.current = window.requestAnimationFrame(() => {
          fitFrameRef.current = null
          fit()
        })
      })
    }
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(scheduleFit)
      : null
    resizeObserver?.observe(surfaceRef.current)
    scheduleFit()

    if (document.fonts?.ready) {
      void document.fonts.ready.then(scheduleFit)
    }

    return () => {
      if (fitFrameRef.current) {
        window.cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = null
      }
      resizeObserver?.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    let disposed = false

    async function loadTranscript() {
      if (!activeLogTab?.logId) {
        setContent('')
        setMeta(null)
        return
      }

      setLoading(true)
      try {
        const transcript = await getSessionTranscript(activeLogTab.logId)
        if (disposed) return
        setContent(transcript?.content || '')
        setMeta(transcript)
      } catch (err) {
        if (disposed) return
        setContent('暂无终端内容')
        setMeta(null)
        onError?.(err)
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void loadTranscript()
    return () => {
      disposed = true
    }
  }, [activeLogTab, onError])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.reset()
    terminal.clear()
    terminal.write(loading ? '正在读取终端日志...' : content || '暂无终端内容')
    window.requestAnimationFrame(() => {
      const fitAddon = fitAddonRef.current
      const surface = surfaceRef.current
      if (!fitAddon || !surface) return
      const geometry = measureTerminalGeometry(terminal, surface, fitAddon)
      if (geometry && (terminal.cols !== geometry.cols || terminal.rows !== geometry.rows)) {
        terminal.resize(geometry.cols, geometry.rows)
      }
    })
  }, [content, loading])

  const title = activeLogTab?.hostTitle || activeLogTab?.title || '连接日志'
  const timeRange = [
    formatTime(activeLogTab?.startedAt),
    formatTime(activeLogTab?.endedAt),
  ].filter(Boolean).join(' - ')
  const filename = `${title}-${activeLogTab?.logId || 'session'}.log`.replace(/[\\/:*?"<>|]/g, '_')

  return (
    <section className="page-shell workspace-page log-page">
      <header className="log-view-header">
        <span className="log-view-icon"><FileText size={17} /></span>
        <div className="log-view-title">
          <strong>{title}</strong>
          <span>
            {formatDateTime(activeLogTab?.startedAt)}
            {activeLogTab?.sshUsername ? ` · ${activeLogTab.sshUsername}` : ''}
            {activeLogTab?.localUsername ? `@${activeLogTab.localUsername}` : ''}
          </span>
        </div>
        <div className="log-view-actions">
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => downloadText(filename, content)}
            disabled={!content || loading}
          >
            <Download size={15} />
            导出
          </button>
          <button type="button" className="ghost-button compact">
            <Palette size={15} />
            外观
          </button>
          <span className="log-view-readonly">
            <ShieldCheck size={14} />
            只读
          </span>
          <button type="button" className="icon-button" aria-label="关闭日志标签页" onClick={onCloseLog}>
            <X size={16} />
          </button>
        </div>
      </header>
      <main className="log-view-body">
        <div className="log-view-meta">
          <span>{activeLogTab?.remoteAddr || '未知地址'}</span>
          {timeRange ? <span>{timeRange}</span> : null}
          {meta?.size_bytes ? <span>{meta.size_bytes} bytes</span> : null}
        </div>
        <div ref={surfaceRef} className="log-terminal-surface" />
      </main>
    </section>
  )
}
