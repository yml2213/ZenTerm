import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { windowSetBackgroundColour } from '../lib/backend'

type ThemeName = 'auto' | 'light' | 'dark'
type ResolvedThemeName = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemeName
  resolvedTheme: ResolvedThemeName
  setTheme: (theme: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_KEY = 'zenterm-theme'
const NATIVE_WINDOW_BACKGROUND = {
  dark: [5, 7, 11, 255],
  light: [233, 238, 244, 255],
} satisfies Record<ResolvedThemeName, [number, number, number, number]>

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider meow~')
  }
  return context
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_KEY)
      return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
    }
    return 'auto'
  })

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedThemeName>('dark')

  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

    function resolveTheme() {
      let resolved: ResolvedThemeName
      if (theme === 'auto') {
        resolved = systemDark.matches ? 'dark' : 'light'
      } else {
        resolved = theme
      }
      setResolvedTheme(resolved)
      root.setAttribute('data-theme', resolved)
      windowSetBackgroundColour(...NATIVE_WINDOW_BACKGROUND[resolved]).catch(() => {})
    }

    resolveTheme()

    const handler = () => resolveTheme()
    systemDark.addEventListener('change', handler)
    return () => systemDark.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_KEY, newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
