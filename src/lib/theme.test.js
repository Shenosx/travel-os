import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEME_STORAGE_KEY, readStoredTheme, resolveTheme, writeStoredTheme } from './theme.js'

function installStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
}

test('theme preference persists across reload', () => {
  installStorage()
  assert.equal(THEME_STORAGE_KEY, 'travel-os-theme')
  writeStoredTheme('dark')
  assert.equal(readStoredTheme(), 'dark')
  assert.equal(resolveTheme(readStoredTheme(), false), 'dark')
})

test('missing theme falls back to system preference', () => {
  installStorage()
  assert.equal(readStoredTheme(), null)
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(null, false), 'light')
})

test('system preference stays stored and resolves from the device', () => {
  installStorage()
  writeStoredTheme('system')
  assert.equal(readStoredTheme(), 'system')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})
