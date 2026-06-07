import { quickEditPlugin } from './quickEditPlugin'
import type { TerminalPlugin } from './types'

export const builtinTerminalPlugins: TerminalPlugin[] = [
  quickEditPlugin,
]

export type { TerminalPlugin, TerminalPluginContext, TerminalSessionMeta } from './types'
