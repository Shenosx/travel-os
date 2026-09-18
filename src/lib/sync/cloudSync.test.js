import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPendingOperation, loadSnapshot, saveSnapshot, STORAGE_KEY } from '../../data/storage.js'
import { createSeedSnapshot } from '../../data/seed.js'
import {
  BACKOFF_MS,
  backoffMs,
  classifySyncFailure,
  createCloudSyncCoordinator,
  formatSyncSummary,
  mergeSyncedQueue,
  readOnline,
  runOrQueueCloudMutation,
} from './cloudSync.js'
import {
  inspectableFailedOps,
  isSyncableOp,
  normalizePendingOp,
  pendingOpBelongsToUser,
  pendingOpsForUser,
  sortPendingOps,
  stripSecrets,
  summarizePendingOps,
} from './pendingOps.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const TRIP = '11111111-1111-4111-8111-111111111111'
const PLACE = '22222222-2222-4222-8222-222222222222'
const BOOKING = '33333333-3333-4333-8333-333333333333'
const EXPENSE = '44444444-4444-4444-8444-444444444444'
const DAY = '55555555-5555-4555-8555-555555555555'
const ITEM = '66666666-6666-4666-8666-666666666666'
const TRIP_B = '77777777-7777-4777-8777-777777777777'

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
  }
  return map
}

function op(overrides = {}) {
  return normalizePendingOp({
    id: 'op-1',
    entity: 'place',
    action: 'create',
    cloudTripId: TRIP,
    cloudEntityId: PLACE,
    payload: { name: 'Cafe Central' },
    createdAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  })
}

function createHarness({ ops = [], online = true, session = { user: { id: 'user-1' } }, mutations } = {}) {
  let queue = ops.map((item) => normalizePendingOp(item))
  const calls = []
  let currentSession = session
  let currentOnline = online
  const local = { trips: [{ id: 'trip-vienna', city: 'Vienna' }] }

  const defaults = {
    async createCloudTrip(args) {
      calls.push(['createCloudTrip', args])
      return { trip: { id: args.id, source: 'cloud' }, error: null }
    },
    async updateCloudTrip(args) {
      calls.push(['updateCloudTrip', args])
      return { trip: { id: args.id }, error: null }
    },
    async deleteCloudTrip(args) {
      calls.push(['deleteCloudTrip', args])
      return { ok: true, error: null }
    },
    async createCloudPlace(args) {
      calls.push(['createCloudPlace', args])
      return { place: { id: args.id, name: args.input?.name }, error: null }
    },
    async updateCloudPlace(args) {
      calls.push(['updateCloudPlace', args])
      return { place: { id: args.id }, error: null }
    },
    async deleteCloudPlace(args) {
      calls.push(['deleteCloudPlace', args])
      return { ok: true, error: null }
    },
    async createCloudBooking(args) {
      calls.push(['createCloudBooking', args])
      return { booking: { id: args.id }, error: null }
    },
    async updateCloudBooking(args) {
      calls.push(['updateCloudBooking', args])
      return { booking: { id: args.id }, error: null }
    },
    async deleteCloudBooking(args) {
      calls.push(['deleteCloudBooking', args])
      return { ok: true, error: null }
    },
    async createCloudExpense(args) {
      calls.push(['createCloudExpense', args])
      return { expense: { id: args.id }, error: null }
    },
    async updateCloudExpense(args) {
      calls.push(['updateCloudExpense', args])
      return { expense: { id: args.id }, error: null }
    },
    async deleteCloudExpense(args) {
      calls.push(['deleteCloudExpense', args])
      return { ok: true, error: null }
    },
    async createCloudItineraryDay(args) {
      calls.push(['createCloudItineraryDay', args])
      return { day: { id: args.id }, error: null }
    },
    async updateCloudItineraryDay(args) {
      calls.push(['updateCloudItineraryDay', args])
      return { day: { id: args.id }, error: null }
    },
    async deleteCloudItineraryDay(args) {
      calls.push(['deleteCloudItineraryDay', args])
      return { ok: true, error: null }
    },
    async createCloudItineraryItem(args) {
      calls.push(['createCloudItineraryItem', args])
      return { item: { id: args.id }, error: null }
    },
    async updateCloudItineraryItem(args) {
      calls.push(['updateCloudItineraryItem', args])
      return { item: { id: args.id }, error: null }
    },
    async deleteCloudItineraryItem(args) {
      calls.push(['deleteCloudItineraryItem', args])
      return { ok: true, error: null }
    },
  }

  const coordinator = createCloudSyncCoordinator({
    getOps: () => queue,
    patchOps: (updater) => {
      queue = updater(queue)
    },
    getSession: () => currentSession,
    getOnline: () => currentOnline,
    getClient: () => ({ kind: 'fake-client' }),
    now: () => '2026-09-17T12:00:00.000Z',
    mutations: { ...defaults, ...mutations },
  })

  return {
    coordinator,
    calls,
    local,
    get ops() {
      return queue
    },
    setSession(next) {
      currentSession = next
    },
    setOnline(next) {
      currentOnline = next
    },
  }
}

test('empty queue is a no-op', async () => {
  const harness = createHarness({ ops: [] })
  const result = await harness.coordinator.syncNow()
  assert.equal(result.synced, 0)
  assert.equal(harness.calls.length, 0)
  assert.deepEqual(harness.ops, [])
})

test('offline leaves the queue untouched', async () => {
  const queued = op()
  const harness = createHarness({ ops: [queued], online: false })
  const result = await harness.coordinator.syncNow()
  assert.equal(result.reason, 'offline')
  assert.equal(result.synced, 0)
  assert.equal(harness.ops.length, 1)
  assert.equal(harness.calls.length, 0)
})

test('unauthenticated Cloud ops remain queued', async () => {
  const harness = createHarness({ ops: [op()], session: null })
  const result = await harness.coordinator.syncNow()
  assert.equal(result.reason, 'auth')
  assert.equal(harness.ops[0].status, 'pending')
  assert.equal(harness.calls.length, 0)
})

test('Cloud-linked place create syncs successfully and is removed', async () => {
  const harness = createHarness({ ops: [op()] })
  const result = await harness.coordinator.syncNow()
  assert.equal(result.synced, 1)
  assert.equal(harness.ops.length, 0)
  assert.equal(harness.calls[0][0], 'createCloudPlace')
  assert.equal(harness.calls[0][1].id, PLACE)
  assert.equal(harness.calls[0][1].tripId, TRIP)
})

test('local-only operations are not uploaded', async () => {
  const harness = createHarness({
    ops: [op({ id: 'op-local', cloudTripId: null, localEntityId: 'place-vienna', payload: { name: 'Local cafe' } })],
  })
  const result = await harness.coordinator.syncNow()
  assert.equal(result.synced, 0)
  assert.equal(harness.ops.length, 1)
  assert.equal(harness.calls.length, 0)
})

test('local trip ids are not treated as Cloud targets', async () => {
  const harness = createHarness({
    ops: [op({ cloudTripId: 'trip-vienna', cloudEntityId: 'place-1' })],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.calls.length, 0)
  assert.equal(harness.ops[0].cloudTripId, 'trip-vienna')
})

test('operations are processed by createdAt then original order', async () => {
  const order = []
  const harness = createHarness({
    ops: [
      op({ id: 'op-b', createdAt: '2026-09-17T00:00:02.000Z', cloudEntityId: BOOKING, payload: { name: 'Second' } }),
      op({ id: 'op-a', createdAt: '2026-09-17T00:00:01.000Z', payload: { name: 'First' } }),
    ],
    mutations: {
      async createCloudPlace(args) {
        order.push(args.input.name)
        return { place: { id: args.id }, error: null }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.deepEqual(order, ['First', 'Second'])
})

test('parent create precedes child expense', async () => {
  const order = []
  const harness = createHarness({
    ops: [
      op({
        id: 'op-child',
        entity: 'expense',
        action: 'create',
        createdAt: '2026-09-17T00:00:01.000Z',
        cloudEntityId: EXPENSE,
        payload: { amount: 12, placeId: PLACE },
      }),
      op({
        id: 'op-parent',
        entity: 'place',
        action: 'create',
        createdAt: '2026-09-17T00:00:02.000Z',
        cloudEntityId: PLACE,
        payload: { name: 'Cafe' },
      }),
    ],
    mutations: {
      async createCloudPlace(args) {
        order.push('place')
        return { place: { id: args.id }, error: null }
      },
      async createCloudExpense(args) {
        order.push('expense')
        return { expense: { id: args.id }, error: null }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.deepEqual(order, ['place', 'expense'])
  assert.equal(harness.ops.length, 0)
})

test('same entity create then update keeps creation order', async () => {
  const order = []
  const harness = createHarness({
    ops: [
      op({ id: 'op-upd', action: 'update', createdAt: '2026-09-17T00:00:02.000Z', payload: { name: 'Later' } }),
      op({ id: 'op-new', action: 'create', createdAt: '2026-09-17T00:00:01.000Z', payload: { name: 'First' } }),
    ],
    mutations: {
      async createCloudPlace() {
        order.push('create')
        return { place: { id: PLACE }, error: null }
      },
      async updateCloudPlace() {
        order.push('update')
        return { place: { id: PLACE }, error: null }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.deepEqual(order, ['create', 'update'])
})

test('duplicate syncNow calls share one worker', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let runs = 0
  const harness = createHarness({
    ops: [op()],
    mutations: {
      async createCloudPlace(args) {
        runs += 1
        await gate
        return { place: { id: args.id }, error: null }
      },
    },
  })
  const first = harness.coordinator.syncNow()
  const second = harness.coordinator.syncNow()
  assert.equal(first, second)
  release()
  await first
  assert.equal(runs, 1)
})

test('network failure retains the operation as retryable', async () => {
  const harness = createHarness({
    ops: [op()],
    mutations: {
      async createCloudPlace() {
        return { place: null, error: 'Could not reach the cloud just now. Local trips are unchanged.' }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 1)
  assert.equal(harness.ops[0].status, 'retryable')
  assert.equal(harness.ops[0].attemptCount, 1)
  assert.ok(harness.ops[0].nextAttemptAt)
})

test('retryable failure uses bounded backoff', () => {
  assert.equal(backoffMs(0), BACKOFF_MS[0])
  assert.equal(backoffMs(3), BACKOFF_MS[3])
  assert.equal(backoffMs(99), BACKOFF_MS[BACKOFF_MS.length - 1])
  assert.equal(classifySyncFailure('Could not reach the cloud just now. Local trips are unchanged.'), 'retryable')
})

test('permanent failure is not retried while due', async () => {
  let runs = 0
  const harness = createHarness({
    ops: [op({ entity: 'expense', action: 'create', cloudEntityId: EXPENSE })],
    mutations: {
      async createCloudExpense() {
        runs += 1
        return { expense: null, error: 'You can view expenses on this trip, not change them.' }
      },
    },
  })
  await harness.coordinator.syncNow()
  await harness.coordinator.syncNow()
  assert.equal(runs, 1)
  assert.equal(harness.ops[0].status, 'failed')
  assert.equal(inspectableFailedOps(harness.ops).length, 1)
  assert.equal(inspectableFailedOps(harness.ops)[0].entity, 'expense')
})

test('successful operations are removed from the queue', async () => {
  const harness = createHarness({
    ops: [
      op({ entity: 'booking', action: 'create', cloudEntityId: BOOKING, payload: { title: 'Hotel' } }),
      op({ id: 'op-2', entity: 'expense', action: 'delete', cloudEntityId: EXPENSE, payload: { id: EXPENSE } }),
    ],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 0)
})

test('failed operations remain inspectable without internal ids in the summary', async () => {
  const harness = createHarness({
    ops: [op()],
    mutations: {
      async createCloudPlace() {
        return { place: null, error: "That place doesn't belong to this trip." }
      },
    },
  })
  const result = await harness.coordinator.syncNow()
  assert.equal(result.failed, 1)
  assert.equal(result.message.includes('op-1'), false)
  assert.equal(inspectableFailedOps(harness.ops)[0].error.includes(PLACE), false)
})

test('existing Cloud mutation functions are the default coordinator mutations', () => {
  const src = readFileSync(join(root, 'src/lib/sync/cloudSync.js'), 'utf8')
  assert.match(src, /createCloudPlace/)
  assert.match(src, /createCloudBooking/)
  assert.match(src, /createCloudExpense/)
  assert.match(src, /createCloudItineraryItem/)
  assert.match(src, /updateCloudTrip/)
  assert.equal(src.includes('service_role'), false)
})

test('create replay uses a stable client UUID so a second attempt cannot invent a new row', async () => {
  const ids = []
  const harness = createHarness({
    ops: [op()],
    mutations: {
      async createCloudPlace(args) {
        ids.push(args.id)
        if (ids.length === 1) {
          return { place: null, error: 'Could not reach the cloud just now. Local trips are unchanged.' }
        }
        return { place: { id: args.id }, error: null }
      },
    },
  })
  await harness.coordinator.syncNow()
  harness.ops[0].nextAttemptAt = null
  harness.ops[0].status = 'pending'
  await harness.coordinator.syncNow()
  assert.deepEqual(ids, [PLACE, PLACE])
  assert.equal(harness.ops.length, 0)
})

test('missing parent blocks the dependent operation', async () => {
  const harness = createHarness({
    ops: [
      op({
        id: 'op-parent',
        entity: 'place',
        action: 'create',
        cloudEntityId: PLACE,
        payload: { name: 'Cafe' },
      }),
      op({
        id: 'op-child',
        entity: 'expense',
        action: 'create',
        createdAt: '2026-09-17T00:00:02.000Z',
        cloudEntityId: EXPENSE,
        payload: { amount: 10, placeId: PLACE },
        dependsOn: 'op-parent',
      }),
    ],
    mutations: {
      async createCloudPlace() {
        return { place: null, error: 'You can view expenses on this trip, not change them.' }
      },
      async createCloudExpense() {
        throw new Error('child must not run')
      },
    },
  })
  await harness.coordinator.syncNow()
  const child = harness.ops.find((item) => item.id === 'op-child')
  assert.equal(child.status, 'blocked')
  assert.equal(child.blockedBy, 'op-parent')
})

test('cross-trip Cloud rejection is a permanent failure', async () => {
  const harness = createHarness({
    ops: [op({ entity: 'expense', action: 'create', cloudEntityId: EXPENSE, payload: { placeId: PLACE } })],
    mutations: {
      async createCloudExpense() {
        return { expense: null, error: "That place doesn't belong to this trip." }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops[0].status, 'failed')
})

test('viewer writes stay unauthorized Cloud mutations', async () => {
  const harness = createHarness({
    ops: [op({ payload: { name: 'Cafe', created_by: 'spoof', owner_id: 'spoof' } })],
    mutations: {
      async createCloudPlace(args) {
        assert.equal(Object.hasOwn(args.input, 'created_by'), false)
        assert.equal(Object.hasOwn(args.input, 'owner_id'), false)
        return { place: null, error: 'You can view expenses on this trip, not change them.' }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops[0].status, 'failed')
})

test('sign-out stops Cloud sync and keeps the queue', async () => {
  const harness = createHarness({ ops: [op()], session: null })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 1)
  harness.setSession({ user: { id: 'user-1' } })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 0)
})

test('Realtime is not used to mutate pendingOps', () => {
  const src = readFileSync(join(root, 'src/lib/sync/cloudSync.js'), 'utf8')
  assert.equal(src.includes('cloudRealtime'), false)
  assert.equal(src.includes('postgres_changes'), false)
  assert.equal(src.includes('subscribeCloudTrip'), false)
})

test('sync does not overwrite local entity collections', async () => {
  const harness = createHarness({ ops: [op()] })
  await harness.coordinator.syncNow()
  assert.equal(harness.local.trips[0].id, 'trip-vienna')
  assert.equal(harness.local.trips[0].city, 'Vienna')
})

test('queued operations survive localStorage reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const queued = createPendingOperation('place', 'create', { name: 'Cafe', access_token: 'secret-token' }, {
    cloudTripId: TRIP,
    cloudEntityId: PLACE,
  })
  saveSnapshot({ ...seed, pendingOps: [queued] })
  const loaded = loadSnapshot(seed)
  assert.equal(loaded.pendingOps[0].entity, 'place')
  assert.equal(loaded.pendingOps[0].cloudTripId, TRIP)
  assert.equal(loaded.pendingOps[0].status, 'pending')
  assert.equal(Object.hasOwn(loaded.pendingOps[0].payload, 'access_token'), false)
})

test('manual sync summary is safe', async () => {
  const harness = createHarness({ ops: [op(), op({ id: 'op-2', cloudEntityId: BOOKING })] })
  const result = await harness.coordinator.syncNow('manual')
  assert.equal(result.message, '2 changes synced')
  assert.equal(result.message.includes('op-'), false)
})

test('no secrets are stored in operation payloads', () => {
  const cleaned = stripSecrets({
    name: 'Cafe',
    access_token: 'aaaa',
    refreshToken: 'bbbb',
    password: 'p',
    service_role: 'role',
    signedUrl: 'https://example',
    created_by: 'user',
  })
  assert.equal(cleaned.name, 'Cafe')
  assert.equal(cleaned.access_token, undefined)
  assert.equal(cleaned.created_by, undefined)
})

test('unsupported poll and document ops are not uploaded', async () => {
  const harness = createHarness({
    ops: [
      op({ id: 'op-poll', entity: 'poll', action: 'create', payload: { question: 'Dinner?' } }),
      op({ id: 'op-doc', entity: 'document', action: 'create', payload: { name: 'pass.pdf' } }),
    ],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.calls.length, 0)
  assert.equal(harness.ops.every((item) => item.status === 'failed'), true)
})

test('trip update, booking, expense, and itinerary ops use Cloud mutations', async () => {
  const harness = createHarness({
    ops: [
      op({ id: 't', entity: 'trip', action: 'update', cloudEntityId: TRIP, payload: { city: 'Vienna' } }),
      op({ id: 'b', entity: 'booking', action: 'create', cloudEntityId: BOOKING, createdAt: '2026-09-17T00:00:02.000Z' }),
      op({ id: 'e', entity: 'expense', action: 'update', cloudEntityId: EXPENSE, createdAt: '2026-09-17T00:00:03.000Z' }),
      op({
        id: 'd',
        entity: 'itinerary_day',
        action: 'create',
        cloudEntityId: DAY,
        createdAt: '2026-09-17T00:00:04.000Z',
        payload: { date: '2026-12-12' },
      }),
      op({
        id: 'i',
        entity: 'itinerary_item',
        action: 'create',
        cloudEntityId: ITEM,
        createdAt: '2026-09-17T00:00:05.000Z',
        payload: { title: 'Museum', dayId: DAY },
      }),
    ],
  })
  await harness.coordinator.syncNow()
  assert.deepEqual(
    harness.calls.map((entry) => entry[0]),
    [
      'updateCloudTrip',
      'createCloudBooking',
      'updateCloudExpense',
      'createCloudItineraryDay',
      'createCloudItineraryItem',
    ],
  )
})

test('delete of an already-missing Cloud row is idempotent success', async () => {
  const harness = createHarness({
    ops: [op({ action: 'delete', payload: { id: PLACE } })],
    mutations: {
      async deleteCloudPlace() {
        return { ok: false, error: 'This place could not be deleted.' }
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 0)
})

test('update of a missing Cloud row is a permanent conflict, not a recreate', async () => {
  const harness = createHarness({
    ops: [op({ action: 'update', payload: { name: 'New name' } })],
    mutations: {
      async updateCloudPlace() {
        return { place: null, error: 'This place cannot be changed.' }
      },
      async createCloudPlace() {
        throw new Error('must not recreate')
      },
    },
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops[0].status, 'failed')
})

test('offline queueOrMutate enqueues instead of calling Cloud', async () => {
  const queued = []
  const result = await runOrQueueCloudMutation({
    op: op(),
    online: false,
    session: { user: { id: 'user-1' } },
    enqueue: (item) => queued.push(item),
    mutate: async () => {
      throw new Error('network must not run')
    },
  })
  assert.equal(result.queued, true)
  assert.equal(queued.length, 1)
})

test('readOnline follows navigator.onLine', () => {
  assert.equal(readOnline({ onLine: false }), false)
  assert.equal(readOnline({ onLine: true }), true)
})

test('formatSyncSummary never includes operation ids', () => {
  assert.equal(formatSyncSummary({ synced: 3, waiting: 0, failed: 0 }), '3 changes synced')
  assert.equal(formatSyncSummary({ reason: 'auth', waiting: 2 }), '2 changes waiting for sign-in')
  assert.equal(formatSyncSummary({ failed: 1, synced: 0, waiting: 0 }), 'Sync needs attention')
})

test('sortPendingOps is stable for identical timestamps', () => {
  const sorted = sortPendingOps([
    op({ id: 'op-2', createdAt: '2026-09-17T00:00:00.000Z' }),
    op({ id: 'op-1', createdAt: '2026-09-17T00:00:00.000Z', payload: { name: 'A' } }),
  ])
  assert.equal(sorted[0].id, 'op-2')
  assert.equal(sorted[1].id, 'op-1')
})

test('isSyncableOp requires a Cloud trip UUID', () => {
  assert.equal(isSyncableOp(op()), true)
  assert.equal(isSyncableOp(op({ cloudTripId: null })), false)
  assert.equal(isSyncableOp(op({ entity: 'poll', action: 'create' })), false)
})

test('mergeSyncedQueue keeps ops enqueued during a run', () => {
  const extra = op({ id: 'op-new' })
  const merged = mergeSyncedQueue(
    [op({ id: 'op-1' }), extra],
    new Set(['op-1']),
    new Map(),
    new Set(['op-1']),
  )
  assert.equal(merged.some((item) => item.id === 'op-new'), true)
  assert.equal(merged.some((item) => item.id === 'op-1'), false)
})

test('localStorage key is unchanged', () => {
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
})

test('summarizePendingOps ignores local-only noise in waiting count', () => {
  const summary = summarizePendingOps([
    op({ cloudTripId: null }),
    op({ id: 'op-2' }),
    op({ id: 'op-3', status: 'failed' }),
  ])
  assert.equal(summary.waiting, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.localOnly, 1)
})

test('cross-trip trip id on the op is what Cloud receives, not a spoofed payload trip', async () => {
  const harness = createHarness({
    ops: [op({ payload: { name: 'Cafe', tripId: TRIP_B } })],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.calls[0][1].tripId, TRIP)
})

test('ops tagged for another Cloud user are not executed', async () => {
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const harness = createHarness({
    session: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
    ops: [op({ authUserId: other })],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.calls.length, 0)
  assert.equal(harness.ops[0].status, 'pending')
  assert.equal(harness.ops[0].authUserId, other)
})

test('ops tagged for the signed-in Cloud user still sync', async () => {
  const me = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const harness = createHarness({
    session: { user: { id: me } },
    ops: [op({ authUserId: me })],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 0)
  assert.equal(harness.calls.length, 1)
})

test('untagged legacy ops still sync for the signed-in user', async () => {
  const harness = createHarness({
    ops: [op({ authUserId: null })],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.ops.length, 0)
})

test('a local entity id cannot be used as a Cloud UUID', async () => {
  const harness = createHarness({
    ops: [op({ cloudEntityId: 'place-senso' })],
  })
  await harness.coordinator.syncNow()
  assert.equal(harness.calls.length, 0)
  assert.equal(harness.ops[0].status, 'failed')
})

test('pendingOpsForUser hides another user tagged ops and keeps untagged legacy ops', () => {
  const me = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const scoped = pendingOpsForUser(
    [op({ id: 'mine', authUserId: me }), op({ id: 'theirs', authUserId: other }), op({ id: 'legacy', authUserId: null })],
    me,
  )
  assert.deepEqual(
    scoped.map((item) => item.id),
    ['mine', 'legacy'],
  )
  assert.equal(pendingOpBelongsToUser(op({ authUserId: other }), me), false)
})
