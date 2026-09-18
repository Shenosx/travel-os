import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTripMigration, emptyMappings, ensureMappedId, sanitizeTripMigration } from './mappings.js'
import { isClientRowId } from '../trips/clientRowId.js'

const CLOUD = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
const LOCAL = 'place-local-1'

test('empty mappings never copy local ids into UUID slots', () => {
  const mappings = emptyMappings()
  assert.equal(mappings.trip, null)
  assert.deepEqual(mappings.places, {})
})

test('sanitize keeps Cloud UUIDs and drops local ids from UUID maps', () => {
  const sanitized = sanitizeTripMigration({
    localTripId: 'trip-tokyo',
    cloudTripId: CLOUD,
    mappings: {
      trip: CLOUD,
      places: { [LOCAL]: CLOUD, bad: 'place-local-1' },
      bookings: { 'booking-1': 'not-a-uuid' },
    },
    identityMappings: {
      'user-jamie': { type: 'self', cloudUserId: CLOUD },
      'user-alex': { type: 'self', cloudUserId: 'user-alex' },
    },
    access_token: 'secret',
    refresh_token: 'secret',
  })
  assert.equal(sanitized.mappings.trip, CLOUD)
  assert.equal(sanitized.mappings.places[LOCAL], CLOUD)
  assert.equal(sanitized.mappings.places.bad, undefined)
  assert.deepEqual(sanitized.mappings.bookings, {})
  assert.equal(sanitized.identityMappings['user-jamie'].cloudUserId, CLOUD)
  assert.equal(sanitized.identityMappings['user-alex'], undefined)
  assert.equal(sanitized.access_token, undefined)
  assert.equal(isClientRowId(sanitized.cloudTripId), true)
})

test('ensureMappedId reuses a generated Cloud UUID on resume', () => {
  const map = {}
  let calls = 0
  const generateId = () => {
    calls += 1
    return CLOUD
  }
  const first = ensureMappedId(map, LOCAL, generateId)
  const second = ensureMappedId(map, LOCAL, generateId)
  assert.equal(first, CLOUD)
  assert.equal(second, CLOUD)
  assert.equal(calls, 1)
})

test('createTripMigration starts with empty entity maps', () => {
  const state = createTripMigration({ localTripId: 'trip-tokyo', path: 'create' })
  assert.equal(state.mappings.trip, null)
  assert.equal(state.status, 'preview')
})
