import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findRelevantPendingOps } from './pendingOps.js'
import { SYNC_FIRST_MESSAGE } from './types.js'
import { pendingOpsBlockReason } from './pendingOps.js'

const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000099'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000099'

test('relevant pending ops for the target Cloud trip block migration', () => {
  const relevant = findRelevantPendingOps({
    pendingOps: [{ id: 'op-1', status: 'pending', cloudTripId: TARGET, localEntityId: null }],
    targetCloudTripId: TARGET,
    sourceTripId: 'trip-tokyo',
    localTrip: { id: 'trip-tokyo' },
    places: [],
  })
  assert.equal(relevant.length, 1)
  assert.equal(pendingOpsBlockReason(relevant), SYNC_FIRST_MESSAGE)
})

test('pending ops for the source local trip block even without a Cloud target', () => {
  const relevant = findRelevantPendingOps({
    pendingOps: [
      { id: 'op-2', status: 'failed', cloudTripId: null, localEntityId: 'place-1', payload: { tripId: 'trip-tokyo' } },
    ],
    sourceTripId: 'trip-tokyo',
    localTrip: { id: 'trip-tokyo' },
    places: [{ id: 'place-1' }],
  })
  assert.equal(relevant.length, 1)
})

test('unrelated pending ops do not block', () => {
  const relevant = findRelevantPendingOps({
    pendingOps: [{ id: 'op-3', status: 'pending', cloudTripId: OTHER, localEntityId: 'place-other' }],
    targetCloudTripId: TARGET,
    sourceTripId: 'trip-tokyo',
    localTrip: { id: 'trip-tokyo' },
    places: [{ id: 'place-1' }],
  })
  assert.equal(relevant.length, 0)
  assert.equal(pendingOpsBlockReason(relevant), null)
})
