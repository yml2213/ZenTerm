import type { Terminal } from '@xterm/xterm'
import type { TerminalPlugin, TerminalPluginContext } from './types'

const defaultRightClickSelectsWord = new WeakMap<Terminal, boolean>()

function rememberDefaultRightClickSelectsWord(terminal: Terminal) {
  if (!defaultRightClickSelectsWord.has(terminal)) {
    defaultRightClickSelectsWord.set(terminal, Boolean(terminal.options.rightClickSelectsWord))
  }
}

function applyQuickEditOption(context: TerminalPluginContext) {
  rememberDefaultRightClickSelectsWord(context.terminal)
  context.terminal.options.rightClickSelectsWord = context.getPreferences().quickEditEnabled
    ? false
    : defaultRightClickSelectsWord.get(context.terminal)
}

export const quickEditPlugin: TerminalPlugin = {
  id: 'quick-edit',
  name: '快速编辑模式',

  activate(context) {
    rememberDefaultRightClickSelectsWord(context.terminal)
    applyQuickEditOption(context)

    return () => {
      const defaultValue = defaultRightClickSelectsWord.get(context.terminal)
      if (typeof defaultValue === 'boolean') {
        context.terminal.options.rightClickSelectsWord = defaultValue
      }
      defaultRightClickSelectsWord.delete(context.terminal)
    }
  },

  onPreferencesChange(_preferences, context) {
    applyQuickEditOption(context)
  },

  async onContextMenu(event, context) {
    if (!context.getPreferences().quickEditEnabled) {
      return false
    }

    event.preventDefault()
    event.stopPropagation()

    const { terminal } = context
    const selection = terminal.hasSelection() ? terminal.getSelection() : ''
    if (selection) {
      try {
        await context.writeClipboardText(selection)
        terminal.clearSelection()
        terminal.focus()
      } catch (error) {
        context.reportError(error)
      }
      return true
    }

    if (!context.getActiveSessionId()) {
      terminal.focus()
      return true
    }

    try {
      const clipboardText = await context.readClipboardText()
      if (clipboardText) {
        terminal.paste(clipboardText)
      }
      terminal.focus()
    } catch (error) {
      context.reportError(error)
    }

    return true
  },
}
