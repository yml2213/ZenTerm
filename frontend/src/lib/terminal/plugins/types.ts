import type { MouseEvent } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { TerminalPreferences } from '../../../contexts/TerminalPreferencesProvider'

export interface TerminalSessionMeta {
  sessionId: string
  title: string
  hostID?: string
  remoteAddr?: string
  connectedAt?: string
}

export interface TerminalPluginContext {
  terminal: Terminal
  container: HTMLElement
  getActiveSessionId: () => string | null
  getSessions: () => TerminalSessionMeta[]
  getPreferences: () => TerminalPreferences
  readClipboardText: () => Promise<string>
  writeClipboardText: (text: string) => Promise<boolean>
  openExternalURL: (url: string) => Promise<void>
  reportError: (error: unknown) => void
}

export interface TerminalPlugin {
  id: string
  name: string
  activate?: (context: TerminalPluginContext) => void | (() => void)
  onInput?: (data: string, context: TerminalPluginContext) => string | false | void | Promise<string | false | void>
  onOutput?: (sessionId: string, chunk: string, context: TerminalPluginContext) => void
  onContextMenu?: (event: MouseEvent<HTMLDivElement>, context: TerminalPluginContext) => boolean | void | Promise<boolean | void>
  onSessionChange?: (sessionId: string | null, context: TerminalPluginContext) => void
  onPreferencesChange?: (preferences: TerminalPreferences, context: TerminalPluginContext) => void
}
