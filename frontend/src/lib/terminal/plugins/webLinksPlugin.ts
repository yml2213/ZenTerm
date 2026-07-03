import type { TerminalPlugin } from './types'

const urlPattern = /\bhttps?:\/\/[^\s<>"'`]+/gi
const trailingPunctuationPattern = /[),.;:!?，。；：！？、\]}]+$/

interface LinkMatch {
  text: string
  startIndex: number
}

interface LinkRange {
  start: {
    x: number
    y: number
  }
  end: {
    x: number
    y: number
  }
}

export function findWebLinks(line: string): LinkMatch[] {
  const links: LinkMatch[] = []
  for (const match of line.matchAll(urlPattern)) {
    const rawText = match[0]
    const text = rawText.replace(trailingPunctuationPattern, '')
    if (!text) {
      continue
    }

    links.push({
      text,
      startIndex: match.index ?? 0,
    })
  }

  return links
}

function createLinkRange(bufferLineNumber: number, link: LinkMatch): LinkRange {
  const startColumn = link.startIndex + 1
  return {
    start: {
      x: startColumn,
      y: bufferLineNumber,
    },
    end: {
      x: startColumn + link.text.length,
      y: bufferLineNumber,
    },
  }
}

export const webLinksPlugin: TerminalPlugin = {
  id: 'web-links',
  name: 'URL 点击打开',

  activate(context) {
    const linkProvider = context.terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        if (!context.getPreferences().webLinksEnabled) {
          callback(undefined)
          return
        }

        const line = context.terminal.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true)
        if (!line) {
          callback(undefined)
          return
        }

        const links = findWebLinks(line).map((link) => ({
          text: link.text,
          range: createLinkRange(bufferLineNumber, link),
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate: () => {
            context.openExternalURL(link.text).catch(context.reportError)
          },
        }))

        callback(links.length > 0 ? links : undefined)
      },
    })

    return () => linkProvider.dispose()
  },

  onPreferencesChange(_preferences, context) {
    context.terminal.refresh(0, Math.max(0, context.terminal.rows - 1))
  },
}
