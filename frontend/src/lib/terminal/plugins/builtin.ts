import { quickEditPlugin } from './quickEditPlugin'
import { webLinksPlugin } from './webLinksPlugin'
import type { TerminalPlugin } from './types'

export const builtinTerminalPlugins: TerminalPlugin[] = [
  quickEditPlugin,
  webLinksPlugin,
]

export type { TerminalPlugin, TerminalPluginContext, TerminalSessionMeta } from './types'
