import { createContext, useContext, useState, type ReactNode } from 'react'

export interface TerminalPreferences {
  quickEditEnabled: boolean
}

interface TerminalPreferencesContextValue extends TerminalPreferences {
  setQuickEditEnabled: (enabled: boolean) => void
}

const TerminalPreferencesContext = createContext<TerminalPreferencesContextValue | undefined>(undefined)

const QUICK_EDIT_KEY = 'zenterm-terminal-quick-edit'

function loadQuickEditPreference(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(QUICK_EDIT_KEY) === 'true'
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

  function setQuickEditEnabled(enabled: boolean) {
    setQuickEditEnabledState(enabled)
    window.localStorage.setItem(QUICK_EDIT_KEY, enabled ? 'true' : 'false')
  }

  return (
    <TerminalPreferencesContext.Provider value={{ quickEditEnabled, setQuickEditEnabled }}>
      {children}
    </TerminalPreferencesContext.Provider>
  )
}
