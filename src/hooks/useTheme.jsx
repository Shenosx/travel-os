import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { applyTheme, readStoredTheme, resolveTheme, writeStoredTheme } from '../lib/theme.js'

const ThemeContext = createContext(null)

function prefersDarkScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getStoredPreference() {
  return readStoredTheme() ?? 'system'
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(getStoredPreference)
  const [theme, setThemeResolved] = useState(() => resolveTheme(getStoredPreference(), prefersDarkScheme()))

  useEffect(() => {
    writeStoredTheme(preference)
    const resolved = resolveTheme(preference, prefersDarkScheme())
    setThemeResolved(resolved)
    applyTheme(resolved)
  }, [preference])

  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined' || !window.matchMedia) return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange() {
      const resolved = resolveTheme('system', media.matches)
      setThemeResolved(resolved)
      applyTheme(resolved)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const value = useMemo(
    () => ({
      theme,
      preference,
      setTheme: setPreference,
      toggleTheme: () =>
        setPreference((current) => {
          const resolved = resolveTheme(current, prefersDarkScheme())
          return resolved === 'dark' ? 'light' : 'dark'
        }),
    }),
    [preference, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
