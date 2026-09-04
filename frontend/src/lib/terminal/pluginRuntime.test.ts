import { describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { DEFAULT_TERMINAL_PREFERENCES } from '../../contexts/TerminalPreferencesProvider'
import { createTerminalPluginRuntime } from './pluginRuntime'
import type { TerminalPlugin, TerminalPluginContext } from './plugins/builtin'

function createContext(): TerminalPluginContext {
  return {
    terminal: {} as Terminal,
    container: document.createElement('div'),
    getActiveSessionId: () => 'session-1',
    getSessions: () => [],
    getPreferences: () => ({ ...DEFAULT_TERMINAL_PREFERENCES }),
    readClipboardText: vi.fn(async () => ''),
    writeClipboardText: vi.fn(async () => true),
    openExternalURL: vi.fn(async () => {}),
    reportError: vi.fn(),
  }
}

describe('createTerminalPluginRuntime', () => {
  it('按顺序处理输入并允许插件改写数据', async () => {
    const firstPlugin: TerminalPlugin = {
      id: 'first',
      name: 'first',
      onInput: (data) => `${data} first`,
    }
    const secondPlugin: TerminalPlugin = {
      id: 'second',
      name: 'second',
      onInput: (data) => `${data} second`,
    }
    const runtime = createTerminalPluginRuntime([firstPlugin, secondPlugin], createContext())

    await expect(runtime.handleInput('echo')).resolves.toBe('echo first second')
  })

  it('插件返回 false 时停止输入传播', async () => {
    const blockedPlugin: TerminalPlugin = {
      id: 'blocked',
      name: 'blocked',
      onInput: () => false,
    }
    const skippedPlugin: TerminalPlugin = {
      id: 'skipped',
      name: 'skipped',
      onInput: vi.fn((data) => data),
    }
    const runtime = createTerminalPluginRuntime([blockedPlugin, skippedPlugin], createContext())

    await expect(runtime.handleInput('rm')).resolves.toBe(false)
    expect(skippedPlugin.onInput).not.toHaveBeenCalled()
  })

  it('插件异常会转交给错误处理器', () => {
    const context = createContext()
    const plugin: TerminalPlugin = {
      id: 'broken',
      name: 'broken',
      onOutput: () => {
        throw new Error('broken plugin')
      },
    }
    const runtime = createTerminalPluginRuntime([plugin], context)

    runtime.handleOutput('session-1', 'output')

    expect(context.reportError).toHaveBeenCalledWith(expect.any(Error))
  })
})
