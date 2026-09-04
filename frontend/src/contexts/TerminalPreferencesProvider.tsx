import { createContext, useContext, useState, type ReactNode } from 'react'

export type CursorStyle = 'bar' | 'block' | 'underline'

export interface TerminalPreferences {
  quickEditEnabled: boolean
  webLinksEnabled: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
}

interface TerminalPreferencesContextValue extends TerminalPreferences {
  setQuickEditEnabled: (enabled: boolean) => void
  setWebLinksEnabled: (enabled: boolean) => void
  setFontFamily: (fontFamily: string) => void
  setFontSize: (fontSize: number) => void
  setLineHeight: (lineHeight: number) => void
  setCursorStyle: (cursorStyle: CursorStyle) => void
  setCursorBlink: (cursorBlink: boolean) => void
  setScrollback: (scrollback: number) => void
  resetTerminalPreferences: () => void
}

const TerminalPreferencesContext = createContext<TerminalPreferencesContextValue | undefined>(undefined)

const QUICK_EDIT_KEY = 'zenterm-terminal-quick-edit'
const WEB_LINKS_KEY = 'zenterm-terminal-web-links'
const FONT_FAMILY_KEY = 'zenterm-terminal-font-family'
const FONT_SIZE_KEY = 'zenterm-terminal-font-size'
const LINE_HEIGHT_KEY = 'zenterm-terminal-line-height'
const CURSOR_STYLE_KEY = 'zenterm-terminal-cursor-style'
const CURSOR_BLINK_KEY = 'zenterm-terminal-cursor-blink'
const SCROLLBACK_KEY = 'zenterm-terminal-scrollback'

export const DEFAULT_FONT_FAMILY = 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace'
export const DEFAULT_FONT_SIZE = 14
export const DEFAULT_LINE_HEIGHT = 1.35
export const DEFAULT_CURSOR_STYLE: CursorStyle = 'bar'
export const DEFAULT_CURSOR_BLINK = false
export const DEFAULT_SCROLLBACK = 10000

export const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  quickEditEnabled: false,
  webLinksEnabled: true,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  lineHeight: DEFAULT_LINE_HEIGHT,
  cursorStyle: DEFAULT_CURSOR_STYLE,
  cursorBlink: DEFAULT_CURSOR_BLINK,
  scrollback: DEFAULT_SCROLLBACK,
}

function loadQuickEditPreference(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(QUICK_EDIT_KEY) === 'true'
}

function loadWebLinksPreference(): boolean {
  if (typeof window === 'undefined') return true
  const saved = window.localStorage.getItem(WEB_LINKS_KEY)
  return saved === null ? true : saved === 'true'
}

function loadFontFamilyPreference(): string {
  if (typeof window === 'undefined') return DEFAULT_FONT_FAMILY
  return window.localStorage.getItem(FONT_FAMILY_KEY) || DEFAULT_FONT_FAMILY
}

function loadFontSizePreference(): number {
  if (typeof window === 'undefined') return DEFAULT_FONT_SIZE
  const saved = window.localStorage.getItem(FONT_SIZE_KEY)
  const parsed = Number(saved)
  return Number.isFinite(parsed) && parsed >= 10 && parsed <= 32 ? parsed : DEFAULT_FONT_SIZE
}

function loadLineHeightPreference(): number {
  if (typeof window === 'undefined') return DEFAULT_LINE_HEIGHT
  const saved = window.localStorage.getItem(LINE_HEIGHT_KEY)
  const parsed = Number(saved)
  return Number.isFinite(parsed) && parsed >= 1.0 && parsed <= 2.2 ? parsed : DEFAULT_LINE_HEIGHT
}

function loadCursorStylePreference(): CursorStyle {
  if (typeof window === 'undefined') return DEFAULT_CURSOR_STYLE
  const saved = window.localStorage.getItem(CURSOR_STYLE_KEY)
  if (saved === 'block' || saved === 'underline' || saved === 'bar') {
    return saved
  }
  return DEFAULT_CURSOR_STYLE
}

function loadCursorBlinkPreference(): boolean {
  if (typeof window === 'undefined') return DEFAULT_CURSOR_BLINK
  return window.localStorage.getItem(CURSOR_BLINK_KEY) === 'true'
}

function loadScrollbackPreference(): number {
  if (typeof window === 'undefined') return DEFAULT_SCROLLBACK
  const saved = window.localStorage.getItem(SCROLLBACK_KEY)
  const parsed = Number(saved)
  return Number.isFinite(parsed) && parsed >= 500 && parsed <= 100000 ? parsed : DEFAULT_SCROLLBACK
}

export function useTerminalPreferences() {
  const context = useContext(TerminalPreferencesContext)
  if (!context) {
    throw new Error('useTerminalPreferences must be used within TerminalPreferencesProvider')
  }
  return context
}

export default function TerminalPreferencesProvider({ children }: { children: ReactNode }) {
  const [quickEditEnabled, setQuickEditEnabledState] = useState(loadQuickEditPreference)
  const [webLinksEnabled, setWebLinksEnabledState] = useState(loadWebLinksPreference)
  const [fontFamily, setFontFamilyState] = useState(loadFontFamilyPreference)
  const [fontSize, setFontSizeState] = useState(loadFontSizePreference)
  const [lineHeight, setLineHeightState] = useState(loadLineHeightPreference)
  const [cursorStyle, setCursorStyleState] = useState<CursorStyle>(loadCursorStylePreference)
  const [cursorBlink, setCursorBlinkState] = useState(loadCursorBlinkPreference)
  const [scrollback, setScrollbackState] = useState(loadScrollbackPreference)

  function setQuickEditEnabled(enabled: boolean) {
    setQuickEditEnabledState(enabled)
    window.localStorage.setItem(QUICK_EDIT_KEY, enabled ? 'true' : 'false')
  }

  function setWebLinksEnabled(enabled: boolean) {
    setWebLinksEnabledState(enabled)
    window.localStorage.setItem(WEB_LINKS_KEY, enabled ? 'true' : 'false')
  }

  function setFontFamily(val: string) {
    setFontFamilyState(val)
    window.localStorage.setItem(FONT_FAMILY_KEY, val)
  }

  function setFontSize(val: number) {
    setFontSizeState(val)
    window.localStorage.setItem(FONT_SIZE_KEY, String(val))
  }

  function setLineHeight(val: number) {
    setLineHeightState(val)
    window.localStorage.setItem(LINE_HEIGHT_KEY, String(val))
  }

  function setCursorStyle(val: CursorStyle) {
    setCursorStyleState(val)
    window.localStorage.setItem(CURSOR_STYLE_KEY, val)
  }

  function setCursorBlink(val: boolean) {
    setCursorBlinkState(val)
    window.localStorage.setItem(CURSOR_BLINK_KEY, val ? 'true' : 'false')
  }

  function setScrollback(val: number) {
    setScrollbackState(val)
    window.localStorage.setItem(SCROLLBACK_KEY, String(val))
  }

  function resetTerminalPreferences() {
    setQuickEditEnabled(false)
    setWebLinksEnabled(true)
    setFontFamily(DEFAULT_FONT_FAMILY)
    setFontSize(DEFAULT_FONT_SIZE)
    setLineHeight(DEFAULT_LINE_HEIGHT)
    setCursorStyle(DEFAULT_CURSOR_STYLE)
    setCursorBlink(DEFAULT_CURSOR_BLINK)
    setScrollback(DEFAULT_SCROLLBACK)
  }

  return (
    <TerminalPreferencesContext.Provider
      value={{
        quickEditEnabled,
        webLinksEnabled,
        fontFamily,
        fontSize,
        lineHeight,
        cursorStyle,
        cursorBlink,
        scrollback,
        setQuickEditEnabled,
        setWebLinksEnabled,
        setFontFamily,
        setFontSize,
        setLineHeight,
        setCursorStyle,
        setCursorBlink,
        setScrollback,
        resetTerminalPreferences,
      }}
    >
      {children}
    </TerminalPreferencesContext.Provider>
  )
}
