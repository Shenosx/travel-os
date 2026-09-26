import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAccountExport,
  clearLocalAccountSnapshot,
  exportHasSecrets,
  guestAccountDestination,
  planClearLocalData,
} from './account.js'
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

test('authenticated user stays on account', () => {
  assert.equal(guestAccountDestination({ session: { user: { id: 'u1' } } }), null)
})

test('unauthenticated user is sent to public home', () => {
  assert.equal(guestAccountDestination({ session: null }), '/')
  assert.equal(guestAccountDestination({}), '/')
})

test('join continuation and confirmation stay on account', () => {
  assert.equal(guestAccountDestination({ session: null, next: '/join/abc/token' }), null)
  assert.equal(guestAccountDestination({ session: null, pendingConfirmationEmail: 'a@b.com' }), null)
})

test('export produces the current local snapshot without secrets', () => {
  installStorage()
  const userId = '11111111-1111-4111-8111-111111111111'
  const empty = loadSnapshotForAuthUser(userId).snapshot
  saveSnapshot(
    {
      ...empty,
      trips: [{ id: 'trip-1', destination: 'Vienna', members: [] }],
      expenses: [
        {
          id: 'exp-1',
          tripId: 'trip-1',
          amount: 12,
          currency: 'EUR',
          shares: [{ userId: 'user-jamie', amount: 12 }],
        },
      ],
    },
    getUserStorageKey(userId),
  )
  const payload = buildAccountExport(userId)
  assert.equal(payload.kind, 'travel-os-local')
  assert.equal(payload.data.trips[0].id, 'trip-1')
  assert.equal(payload.data.expenses[0].amount, 12)
  assert.equal(exportHasSecrets(payload), false)
})

test('clear local data requires confirmation and then empties the snapshot', () => {
  installStorage()
  const userId = '11111111-1111-4111-8111-111111111111'
  const empty = loadSnapshotForAuthUser(userId).snapshot
  saveSnapshot(
    {
      ...empty,
      trips: [{ id: 'trip-1', destination: 'Vienna', members: [] }],
    },
    getUserStorageKey(userId),
  )
  assert.deepEqual(planClearLocalData(false), { ok: false, reason: 'confirmation-required' })
  assert.equal(loadSnapshotForAuthUser(userId).snapshot.trips.length, 1)
  assert.equal(planClearLocalData(true).ok, true)
  clearLocalAccountSnapshot(userId)
  assert.equal(loadSnapshotForAuthUser(userId).snapshot.trips.length, 0)
})
