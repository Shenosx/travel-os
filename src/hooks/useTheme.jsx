import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { applyTheme, readStoredTheme, resolveTheme, writeStoredTheme } from '../lib/theme.js'

const ThemeContext = createContext(null)

function getPreferredTheme() {
  if (typeof window === 'undefined') return 'light'
  return resolveTheme(readStoredTheme(), window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getPreferredTheme)

  useEffect(() => {
    applyTheme(theme)
    writeStoredTheme(theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
