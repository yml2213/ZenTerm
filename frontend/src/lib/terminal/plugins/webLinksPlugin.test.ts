import { describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { findWebLinks, webLinksPlugin } from './webLinksPlugin'
import type { TerminalPluginContext } from './types'

function createContext(lineText: string, webLinksEnabled = true) {
  let registeredProvider: {
    provideLinks: (bufferLineNumber: number, callback: (links: Array<{ text: string; activate: () => void }> | undefined) => void) => void
  } | null = null

  const terminal = {
    rows: 24,
    refresh: vi.fn(),
    registerLinkProvider: vi.fn((provider) => {
      registeredProvider = provider
      return {
        dispose: vi.fn(),
      }
    }),
    buffer: {
      active: {
        getLine: vi.fn(() => ({
          translateToString: vi.fn(() => lineText),
        })),
      },
    },
  } as unknown as Terminal

  const context: TerminalPluginContext = {
    terminal,
    container: document.createElement('div'),
    getActiveSessionId: () => 'session-1',
    getSessions: () => [],
    getPreferences: () => ({
      quickEditEnabled: false,
      webLinksEnabled,
    }),
    readClipboardText: vi.fn(async () => ''),
    writeClipboardText: vi.fn(async () => true),
    openExternalURL: vi.fn(async () => {}),
    reportError: vi.fn(),
  }

  return {
    context,
    terminal,
    getProvider: () => registeredProvider,
  }
}

describe('webLinksPlugin', () => {
  it('识别 http 和 https 链接并去掉末尾标点', () => {
    expect(findWebLinks('打开 https://example.com/path, 然后看 http://localhost:3000.')).toEqual([
      { text: 'https://example.com/path', startIndex: 3 },
      { text: 'http://localhost:3000', startIndex: 33 },
    ])
  })

  it('注册 xterm 链接提供器并打开链接', async () => {
    const { context, getProvider } = createContext('文档 https://example.com/docs')

    webLinksPlugin.activate?.(context)

    const provider = getProvider()
    expect(provider).not.toBeNull()

    await new Promise<void>((resolve) => {
      provider?.provideLinks(1, (links) => {
        expect(links).toHaveLength(1)
        expect(links?.[0].text).toBe('https://example.com/docs')
        links?.[0].activate()
        resolve()
      })
    })

    expect(context.openExternalURL).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('关闭偏好时不提供链接', async () => {
    const { context, getProvider } = createContext('https://example.com', false)

    webLinksPlugin.activate?.(context)

    await new Promise<void>((resolve) => {
      getProvider()?.provideLinks(1, (links) => {
        expect(links).toBeUndefined()
        resolve()
      })
    })
  })
})
