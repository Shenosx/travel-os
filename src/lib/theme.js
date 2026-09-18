export const THEME_STORAGE_KEY = 'travel-os-theme'

export function readStoredTheme() {
  try {
    if (typeof localStorage === 'undefined') return null
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    return null
  } catch {
    return null
  }
}

export function writeStoredTheme(theme) {
  try {
    if (typeof localStorage === 'undefined') return
    if (theme === 'light' || theme === 'dark') {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveTheme(stored, prefersDark) {
  if (stored === 'light' || stored === 'dark') return stored
  return prefersDark ? 'dark' : 'light'
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#11100f' : '#ffffff')
}
