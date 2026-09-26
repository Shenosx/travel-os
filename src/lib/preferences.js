/**
 * Account-level preferences. Separate from the trip snapshot store.
 * Scoped like local data: travel-os:prefs:v1:user:${id}
 */

export const PREFS_STORAGE_VERSION = 1
export const PREFS_STORAGE_KEY = `travel-os:prefs:v${PREFS_STORAGE_VERSION}`

export const PREFERRED_CURRENCIES = Object.freeze(['MYR', 'EUR', 'USD', 'JPY', 'GBP'])

export function getPrefsStorageKey(userId) {
  if (!userId) return PREFS_STORAGE_KEY
  return `${PREFS_STORAGE_KEY}:user:${userId}`
}

export function isPreferredCurrency(value) {
  return PREFERRED_CURRENCIES.includes(value)
}

export function emptyPreferences() {
  return {
    version: PREFS_STORAGE_VERSION,
    defaultCurrency: 'MYR',
  }
}

export function readPreferences(userId) {
  try {
    if (typeof localStorage === 'undefined') return emptyPreferences()
    const raw = localStorage.getItem(getPrefsStorageKey(userId))
    if (!raw) return emptyPreferences()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyPreferences()
    return {
      ...emptyPreferences(),
      defaultCurrency: isPreferredCurrency(parsed.defaultCurrency)
        ? parsed.defaultCurrency
        : 'MYR',
    }
  } catch {
    return emptyPreferences()
  }
}

export function writePreferences(userId, patch) {
  const current = readPreferences(userId)
  const next = {
    ...current,
    ...patch,
    version: PREFS_STORAGE_VERSION,
    defaultCurrency: isPreferredCurrency(patch?.defaultCurrency)
      ? patch.defaultCurrency
      : current.defaultCurrency,
  }
  try {
    if (typeof localStorage === 'undefined') return next
    localStorage.setItem(getPrefsStorageKey(userId), JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
  return next
}
