import { createContext, useContext, useState, type ReactNode } from 'react'

export interface TerminalPreferences {
  quickEditEnabled: boolean
  webLinksEnabled: boolean
}

interface TerminalPreferencesContextValue extends TerminalPreferences {
  setQuickEditEnabled: (enabled: boolean) => void
  setWebLinksEnabled: (enabled: boolean) => void
}

const TerminalPreferencesContext = createContext<TerminalPreferencesContextValue | undefined>(undefined)

const QUICK_EDIT_KEY = 'zenterm-terminal-quick-edit'
const WEB_LINKS_KEY = 'zenterm-terminal-web-links'

function loadQuickEditPreference(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(QUICK_EDIT_KEY) === 'true'
}

function loadWebLinksPreference(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  const saved = window.localStorage.getItem(WEB_LINKS_KEY)
  return saved === null ? true : saved === 'true'
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

  function setQuickEditEnabled(enabled: boolean) {
    setQuickEditEnabledState(enabled)
    window.localStorage.setItem(QUICK_EDIT_KEY, enabled ? 'true' : 'false')
  }

  function setWebLinksEnabled(enabled: boolean) {
    setWebLinksEnabledState(enabled)
    window.localStorage.setItem(WEB_LINKS_KEY, enabled ? 'true' : 'false')
  }

  return (
    <TerminalPreferencesContext.Provider
      value={{
        quickEditEnabled,
        webLinksEnabled,
        setQuickEditEnabled,
        setWebLinksEnabled,
      }}
    >
      {children}
    </TerminalPreferencesContext.Provider>
  )
}
