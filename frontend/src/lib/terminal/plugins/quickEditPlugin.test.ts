import { describe, expect, it, vi } from 'vitest'
import type { MouseEvent } from 'react'
import type { Terminal } from '@xterm/xterm'
import {
  DEFAULT_TERMINAL_PREFERENCES,
  type TerminalPreferences,
} from '../../../contexts/TerminalPreferencesProvider'
import { quickEditPlugin } from './quickEditPlugin'
import type { TerminalPluginContext } from './types'

function createContext(options: {
  quickEditEnabled?: boolean
  hasSelection?: boolean
  selection?: string
  clipboardText?: string
  activeSessionId?: string | null
} = {}) {
  const preferences: TerminalPreferences = {
    ...DEFAULT_TERMINAL_PREFERENCES,
    quickEditEnabled: options.quickEditEnabled ?? true,
    webLinksEnabled: true,
  }
  const terminal = {
    options: {
      rightClickSelectsWord: true,
    },
    hasSelection: vi.fn(() => options.hasSelection ?? false),
    getSelection: vi.fn(() => options.selection ?? ''),
    clearSelection: vi.fn(),
    focus: vi.fn(),
    paste: vi.fn(),
  } as unknown as Terminal
  const context: TerminalPluginContext = {
    terminal,
    container: document.createElement('div'),
    getActiveSessionId: () => options.activeSessionId ?? 'session-1',
    getSessions: () => [],
    getPreferences: () => preferences,
    readClipboardText: vi.fn(async () => options.clipboardText ?? ''),
    writeClipboardText: vi.fn(async () => true),
    openExternalURL: vi.fn(async () => {}),
    reportError: vi.fn(),
  }

  return {
    context,
    preferences,
    terminal: terminal as Terminal & {
      options: { rightClickSelectsWord: boolean }
      hasSelection: ReturnType<typeof vi.fn>
      getSelection: ReturnType<typeof vi.fn>
      clearSelection: ReturnType<typeof vi.fn>
      focus: ReturnType<typeof vi.fn>
      paste: ReturnType<typeof vi.fn>
    },
  }
}

function createContextMenuEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent<HTMLDivElement>
}

describe('quickEditPlugin', () => {
  it('启用时关闭右键选词，并在停用后恢复默认值', () => {
    const { context, preferences, terminal } = createContext({ quickEditEnabled: true })

    const dispose = quickEditPlugin.activate?.(context)

    expect(terminal.options.rightClickSelectsWord).toBe(false)

    preferences.quickEditEnabled = false
    quickEditPlugin.onPreferencesChange?.(preferences, context)

    expect(terminal.options.rightClickSelectsWord).toBe(true)

    if (typeof dispose === 'function') {
      dispose()
    }

    expect(terminal.options.rightClickSelectsWord).toBe(true)
  })

  it('有选区时右键复制选中文本', async () => {
    const { context, terminal } = createContext({
      hasSelection: true,
      selection: 'ls -la',
    })
    const event = createContextMenuEvent()

    const consumed = await quickEditPlugin.onContextMenu?.(event, context)

    expect(consumed).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(context.writeClipboardText).toHaveBeenCalledWith('ls -la')
    expect(terminal.clearSelection).toHaveBeenCalled()
    expect(terminal.focus).toHaveBeenCalled()
  })

  it('无选区时右键粘贴剪贴板文本', async () => {
    const { context, terminal } = createContext({
      hasSelection: false,
      clipboardText: 'pwd\n',
    })
    const event = createContextMenuEvent()

    const consumed = await quickEditPlugin.onContextMenu?.(event, context)

    expect(consumed).toBe(true)
    expect(context.readClipboardText).toHaveBeenCalled()
    expect(terminal.paste).toHaveBeenCalledWith('pwd\n')
    expect(terminal.focus).toHaveBeenCalled()
  })
})
