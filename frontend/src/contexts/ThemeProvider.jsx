import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(undefined)

const THEME_KEY = 'zenterm-theme'

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider meow~')
  }
  return context
}

export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(THEME_KEY) || 'auto'
    }
    return 'auto'
  })

  const [resolvedTheme, setResolvedTheme] = useState('dark')

  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

    function resolveTheme() {
      let resolved
      if (theme === 'auto') {
        resolved = systemDark.matches ? 'dark' : 'light'
      } else {
        resolved = theme
      }
      setResolvedTheme(resolved)
      root.setAttribute('data-theme', resolved)
    }

    resolveTheme()

    const handler = () => resolveTheme()
    systemDark.addEventListener('change', handler)
    return () => systemDark.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (newTheme) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_KEY, newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
