import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PREFS_STORAGE_KEY,
  getPrefsStorageKey,
  readPreferences,
  writePreferences,
} from './preferences.js'
import { getUserStorageKey, loadSnapshotForAuthUser, saveSnapshot } from '../data/storage.js'

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
  return map
}

test('default currency persists for one account', () => {
  installStorage()
  const userId = '11111111-1111-4111-8111-111111111111'
  assert.equal(getPrefsStorageKey(userId), `${PREFS_STORAGE_KEY}:user:${userId}`)
  assert.equal(readPreferences(userId).defaultCurrency, 'MYR')
  writePreferences(userId, { defaultCurrency: 'EUR' })
  assert.equal(readPreferences(userId).defaultCurrency, 'EUR')
})

test('writing default currency does not change stored expenses', () => {
  installStorage()
  const userId = '11111111-1111-4111-8111-111111111111'
  const key = getUserStorageKey(userId)
  const empty = loadSnapshotForAuthUser(userId).snapshot
  saveSnapshot(
    {
      ...empty,
      expenses: [
        {
          id: 'exp-1',
          tripId: 'trip-1',
          amount: 40,
          currency: 'JPY',
          convertedAmount: 1.14,
          convertedCurrency: 'MYR',
          shares: [{ userId: 'user-jamie', amount: 40 }],
        },
      ],
    },
    key,
  )
  writePreferences(userId, { defaultCurrency: 'USD' })
  const loaded = loadSnapshotForAuthUser(userId).snapshot
  assert.equal(loaded.expenses[0].currency, 'JPY')
  assert.equal(loaded.expenses[0].convertedCurrency, 'MYR')
  assert.equal(readPreferences(userId).defaultCurrency, 'USD')
})

test('invalid currency is ignored', () => {
  installStorage()
  const next = writePreferences('user-a', { defaultCurrency: 'XYZ' })
  assert.equal(next.defaultCurrency, 'MYR')
})
