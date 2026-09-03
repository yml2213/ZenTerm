import { ArrowDown, ArrowUp, CaseSensitive, LoaderCircle, Replace, ReplaceAll, Save, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatSize } from '../sftpUtils'

interface FileEditorDialogProps {
  /** 远端主机 id，local 编辑时为 null */
  hostID: string | null
  scope: 'local' | 'remote'
  path: string
  name: string
  initialContent: string
  onClose: () => void
  onSave: (path: string, content: string) => Promise<void>
  onError: (message: string) => void
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 找出所有匹配的起止位置 / collects [start, end] offsets for every match. */
function collectMatches(content: string, query: string, caseSensitive: boolean): Array<[number, number]> {
  if (!query) {
    return []
  }

  const matches: Array<[number, number]> = []
  const haystack = caseSensitive ? content : content.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  let cursor = 0

  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor)
    if (found < 0) {
      break
    }
    matches.push([found, found + needle.length])
    cursor = found + Math.max(needle.length, 1)
  }

  return matches
}

export default function FileEditorDialog({
  hostID,
  scope,
  path,
  name,
  initialContent,
  onClose,
  onSave,
  onError,
}: FileEditorDialogProps) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchIndex, setMatchIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const dirty = content !== initialContent
  const matches = useMemo(() => collectMatches(content, findText, caseSensitive), [content, findText, caseSensitive])

  const handleClose = useCallback(() => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    onClose()
  }, [dirty, confirmDiscard, onClose])

  const handleSave = useCallback(async () => {
    if (!dirty || saving) {
      return
    }
    setSaving(true)
    try {
      await onSave(path, content)
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [dirty, saving, onSave, path, content, onClose, onError])

  const jumpToMatch = useCallback(
    (index: number) => {
      const textarea = textareaRef.current
      if (!textarea || matches.length === 0) {
        return
      }

      const normalized = ((index % matches.length) + matches.length) % matches.length
      const [start, end] = matches[normalized]
      textarea.focus({ preventScroll: true })
      textarea.setSelectionRange(start, end)

      // 让命中行滚进视口中部（textarea 无法直接 scrollIntoView，按行高估算）
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 18
      const line = (content.slice(0, start).match(/\n/g) || []).length
      textarea.scrollTop = Math.max(0, line * lineHeight - textarea.clientHeight / 2)

      setMatchIndex(normalized)
    },
    [matches, content],
  )

  const stepMatch = useCallback(
    (delta: number) => {
      if (matches.length === 0) {
        return
      }
      jumpToMatch(matchIndex + delta)
    },
    [jumpToMatch, matchIndex, matches.length],
  )

  const openFind = useCallback(
    (withReplace: boolean) => {
      setFindOpen(true)
      if (withReplace) {
        setShowReplace(true)
      }
      // 已有选中文本时，直接作为搜索词
      const textarea = textareaRef.current
      if (textarea && textarea.selectionEnd > textarea.selectionStart) {
        setFindText(content.slice(textarea.selectionStart, textarea.selectionEnd))
      }
    },
    [content],
  )

  useEffect(() => {
    if (findOpen) {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    }
  }, [findOpen])

  // 搜索词变化时回到第一个命中
  useEffect(() => {
    setMatchIndex(0)
    if (findOpen && findText) {
      jumpToMatch(0)
    }
    // jumpToMatch 依赖 matches，findText 变化后 matches 已重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findText, caseSensitive])

  const handleReplaceCurrent = useCallback(() => {
    if (matches.length === 0) {
      return
    }
    const [start, end] = matches[matchIndex]
    setContent((prev) => prev.slice(0, start) + replaceText + prev.slice(end))
    // 替换后同位置继续找下一个（内容变短，索引自动落到后续命中）
    requestAnimationFrame(() => {
      if (matches.length > 1) {
        jumpToMatch(matchIndex)
      }
    })
  }, [matches, matchIndex, replaceText, jumpToMatch])

  const handleReplaceAll = useCallback(() => {
    if (!findText) {
      return
    }
    const pattern = new RegExp(escapeRegExp(findText), caseSensitive ? 'g' : 'gi')
    setContent((prev) => prev.replace(pattern, replaceText))
  }, [findText, replaceText, caseSensitive])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSave()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openFind(false)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        openFind(true)
        return
      }
      if (findOpen && event.key === 'Enter') {
        event.preventDefault()
        if (showReplace && document.activeElement === replaceInputRef.current) {
          handleReplaceCurrent()
          return
        }
        stepMatch(event.shiftKey ? -1 : 1)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (findOpen) {
          setFindOpen(false)
          textareaRef.current?.focus()
          return
        }
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleClose, findOpen, showReplace, openFind, stepMatch, handleReplaceCurrent])

  const matchLabel = matches.length === 0
    ? findText
      ? '无结果'
      : ''
    : `${matchIndex + 1}/${matches.length}`

  return (
    <div className="modal-backdrop">
      <div className="modal-content sftp-editor-modal" role="dialog" aria-label={`编辑 ${name}`}>
        <div className="modal-eyebrow">
          <span className="panel-kicker">SFTP · {scope === 'local' ? '本地' : '远端'}</span>
          {dirty ? <span className="pill warning sftp-editor-dirty">未保存</span> : null}
          <button type="button" className="icon-button" onClick={handleClose} aria-label="关闭编辑器" title={dirty ? '有未保存修改' : '关闭'}>
            <X size={16} />
          </button>
        </div>

        <div className="sftp-editor-head">
          <h3>{name}</h3>
          <span className="sftp-editor-path" title={path}>{path}</span>
          <span className="pill subtle">{formatSize(initialContent.length, false)}</span>
        </div>

        {findOpen ? (
          <div className="sftp-editor-findbar">
            <div className="sftp-editor-find-row">
              <Search size={14} className="sftp-editor-find-icon" />
              <input
                ref={findInputRef}
                className="sftp-editor-find-input"
                value={findText}
                onChange={(event) => setFindText(event.target.value)}
                placeholder="查找内容"
                aria-label="查找内容"
                spellCheck={false}
              />
              <span className="sftp-editor-match-label" aria-live="polite">{matchLabel}</span>
              <button
                type="button"
                className={`icon-button${caseSensitive ? ' active' : ''}`}
                onClick={() => setCaseSensitive((prev) => !prev)}
                aria-label={caseSensitive ? '切换为忽略大小写' : '切换为区分大小写'}
                title={caseSensitive ? '区分大小写' : '忽略大小写'}
              >
                <CaseSensitive size={15} />
              </button>
              <button type="button" className="icon-button" onClick={() => stepMatch(-1)} disabled={matches.length === 0} aria-label="上一个匹配" title="上一个 (Shift+Enter)">
                <ArrowUp size={15} />
              </button>
              <button type="button" className="icon-button" onClick={() => stepMatch(1)} disabled={matches.length === 0} aria-label="下一个匹配" title="下一个 (Enter)">
                <ArrowDown size={15} />
              </button>
              <button type="button" className="icon-button" onClick={() => setShowReplace((prev) => !prev)} aria-label="切换替换输入框" title="替换 (⌘H)">
                <Replace size={15} />
              </button>
            </div>
            {showReplace ? (
              <div className="sftp-editor-find-row">
                <Replace size={14} className="sftp-editor-find-icon" />
                <input
                  ref={replaceInputRef}
                  className="sftp-editor-find-input"
                  value={replaceText}
                  onChange={(event) => setReplaceText(event.target.value)}
                  placeholder="替换为（留空即删除）"
                  aria-label="替换为"
                  spellCheck={false}
                />
                <button type="button" className="ghost-button compact" onClick={handleReplaceCurrent} disabled={matches.length === 0} title="替换当前匹配">
                  替换
                </button>
                <button type="button" className="ghost-button compact" onClick={handleReplaceAll} disabled={matches.length === 0} title="替换全部匹配">
                  <ReplaceAll size={14} />
                  <span>全部</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="sftp-editor-textarea"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          aria-label={`${name} 内容`}
        />

        {confirmDiscard ? (
          <div className="sftp-editor-discard-row" role="alert">
            <span>有未保存的修改，确定丢弃并关闭吗？</span>
            <div className="sftp-editor-discard-actions">
              <button type="button" className="ghost-button" onClick={() => setConfirmDiscard(false)}>
                继续编辑
              </button>
              <button type="button" className="primary-button danger" onClick={onClose}>
                丢弃修改
              </button>
            </div>
          </div>
        ) : null}

        <div className="modal-actions">
          <span className="sftp-editor-hint">
            <kbd>⌘S</kbd> 保存 · <kbd>⌘F</kbd> 查找 · <kbd>Esc</kbd> 关闭
          </span>
          <div className="sftp-editor-actions">
            <button type="button" className="ghost-button" onClick={handleClose} disabled={saving}>
              关闭
            </button>
            <button
              type="button"
              className="primary-button sftp-editor-save"
              onClick={handleSave}
              disabled={!dirty || saving}
              aria-label={hostID ? '保存到远端' : '保存本地文件'}
            >
              {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
              <span>{saving ? '保存中...' : dirty ? '保存修改' : '保存'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
