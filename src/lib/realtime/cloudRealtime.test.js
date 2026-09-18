import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUD_REALTIME_CHANNEL_PREFIX,
  CLOUD_REALTIME_EXCLUDED_TABLES,
  CLOUD_REALTIME_TABLES,
  CLOUD_REALTIME_UNAVAILABLE,
  buildCloudRealtimeBindings,
  buildCloudRealtimeFilter,
  cloudRealtimeChannelName,
  cloudRealtimeLostAccess,
  createCloudRealtimeCoalescer,
  createCloudRealtimeRegistry,
  createCloudRealtimeReload,
  formatCloudRealtimeError,
  mapCloudRealtimeEvent,
  subscribeCloudTripRealtime,
} from './cloudRealtime.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripA = '11111111-1111-1111-1111-111111111111'
const tripB = '22222222-2222-2222-2222-222222222222'

function mockRealtimeClient() {
  const channels = []
  return {
    channels,
    channel(name) {
      const ch = {
        name,
        bindings: [],
        removed: false,
        statusHandler: null,
        on(type, filter, cb) {
          this.bindings.push({ type, filter, cb })
          return this
        },
        subscribe(cb) {
          this.statusHandler = cb
          cb('SUBSCRIBED')
          return this
        },
        unsubscribe() {
          this.removed = true
        },
        emit(table, eventType, extra = {}) {
          for (const binding of this.bindings) {
            if (binding.filter?.table === table) binding.cb({ schema: 'public', table, eventType, ...extra })
          }
        },
      }
      channels.push(ch)
      return ch
    },
    removeChannel(ch) {
      ch.removed = true
    },
  }
}

function immediateRegistry() {
  return createCloudRealtimeRegistry({
    windowMs: 0,
    schedule: (fn) => {
      fn()
      return 0
    },
    cancel() {},
  })
}

function installStorage() {
  const writes = []
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      writes.push([key, String(value)])
      map.set(key, String(value))
    },
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  }
  return { writes }
}

test('unconfigured client does not subscribe', () => {
  const changes = []
  const sub = subscribeCloudTripRealtime({ client: null, tripId: tripA, onChange: (d) => changes.push(d) })
  assert.equal(sub.channel, null)
  assert.deepEqual(sub.bindings, [])
  const registry = immediateRegistry()
  const handle = registry.retain({ client: null, session, tripId: tripA, listener: { onChange() {} } })
  assert.equal(registry.inspect(tripA), null)
  handle.release()
})

test('unauthenticated retain does not subscribe', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  registry.retain({ client, session: null, tripId: tripA, listener: { onChange() {} } })
  assert.equal(client.channels.length, 0)
})

test('invalid trip UUID does not subscribe', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  registry.retain({ client, session, tripId: 'trip-vienna', listener: { onChange() {} } })
  assert.equal(client.channels.length, 0)
  assert.deepEqual(buildCloudRealtimeBindings('trip-vienna'), [])
  assert.equal(buildCloudRealtimeFilter('trip_id', 'not-a-uuid'), null)
})

test('valid trip creates one trip-scoped subscription', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  const info = registry.inspect(tripA)
  assert.equal(info.refCount, 1)
  assert.equal(info.channelName, `${CLOUD_REALTIME_CHANNEL_PREFIX}${tripA}`)
  assert.equal(client.channels.length, 1)
  for (const binding of info.bindings) {
    assert.equal(binding.schema, 'public')
    assert.match(binding.filter, new RegExp(`eq\\.${tripA}$`))
    assert.equal(binding.filter.includes(tripB), false)
  }
  assert.equal(info.bindings.some((item) => item.table === 'poll_votes'), false)
  assert.equal(info.bindings.some((item) => item.table === 'expense_shares'), false)
})

test('unmount releases the channel', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const listener = { onChange() {} }
  const handle = registry.retain({ client, session, tripId: tripA, listener })
  handle.release()
  assert.equal(registry.inspect(tripA), null)
  assert.equal(client.channels[0].removed, true)
})

test('switching from trip A to trip B unsubscribes A first', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const listener = { onChange() {} }
  const first = registry.retain({ client, session, tripId: tripA, listener })
  first.release()
  registry.retain({ client, session, tripId: tripB, listener })
  assert.equal(registry.inspect(tripA), null)
  assert.equal(client.channels[0].removed, true)
  assert.equal(registry.inspect(tripB).channelName, cloudRealtimeChannelName(tripB))
  assert.equal(client.channels.filter((channel) => !channel.removed).length, 1)
})

test('StrictMode-style remount does not leave duplicate subscriptions', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const first = registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  first.release()
  registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  assert.equal(registry.inspect(tripA).refCount, 1)
  assert.equal(client.channels.filter((channel) => !channel.removed).length, 1)
})

test('two listeners share one channel and auth cleanup removes it', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const a = registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  const b = registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  assert.equal(registry.inspect(tripA).refCount, 2)
  assert.equal(client.channels.length, 1)
  a.release()
  assert.equal(registry.inspect(tripA).refCount, 1)
  b.release()
  assert.equal(registry.activeTripIds().length, 0)
})

test('sign-out style release clears all cloud subscriptions', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const handle = registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  handle.release()
  registry.reset()
  assert.deepEqual(registry.activeTripIds(), [])
})

test('activity insert refreshes activity and poll vote hint refreshes polls', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'activities', eventType: 'INSERT', new: { type: 'place.add' } }), [
    'activity',
  ])
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'activities', eventType: 'INSERT', new: { type: 'poll.vote' } }), [
    'activity',
    'polls',
  ])
})

test('expense events refresh expenses and share tables are not subscribed', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'expenses', eventType: 'INSERT' }), ['expenses'])
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'expense_shares', eventType: 'INSERT' }), [])
  assert.equal(CLOUD_REALTIME_TABLES.some((item) => item.table === 'expense_shares'), false)
})

test('itinerary bursts coalesce to one refresh', () => {
  const flushes = []
  let queued = null
  const coalescer = createCloudRealtimeCoalescer({
    windowMs: 20,
    schedule: (fn) => {
      queued = fn
      return 1
    },
    cancel() {
      queued = null
    },
    onFlush: (domains) => flushes.push(domains),
  })
  coalescer.queue(['itinerary'])
  coalescer.queue(['itinerary'])
  coalescer.queue(['itinerary'])
  coalescer.queue(['itinerary'])
  coalescer.queue(['itinerary'])
  assert.equal(flushes.length, 0)
  queued()
  assert.equal(flushes.length, 1)
  assert.deepEqual(flushes[0], ['itinerary'])
})

test('place events refresh places and dependent itinerary', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'places', eventType: 'UPDATE' }), ['places', 'itinerary'])
})

test('booking events refresh bookings and dependent itinerary', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'bookings', eventType: 'INSERT' }), ['bookings', 'itinerary'])
})

test('poll and vote-related events refresh polls through authorized domains', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'polls', eventType: 'INSERT' }), ['polls'])
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'poll_votes', eventType: 'INSERT' }), [])
})

test('membership events refresh people and access', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'trip_members', eventType: 'DELETE' }), ['people', 'access'])
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'trip_invitations', eventType: 'INSERT' }), ['people'])
  assert.equal(cloudRealtimeLostAccess([{ userId: session.user.id }], session.user.id), false)
  assert.equal(cloudRealtimeLostAccess([], session.user.id), true)
})

test('trip deletion marks the subscription gone', () => {
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'trips', eventType: 'DELETE' }), ['trip', 'gone'])
  assert.deepEqual(mapCloudRealtimeEvent({ table: 'trips', eventType: 'UPDATE' }), ['trip'])
})

test('registry delivers mapped domains without injecting the payload', () => {
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const received = []
  registry.retain({
    client,
    session,
    tripId: tripA,
    listener: { onChange: (domains) => received.push(domains) },
  })
  client.channels[0].emit('activities', 'INSERT', { new: { type: 'expense.add', title: 'secret' } })
  assert.deepEqual(received, [['activity']])
  assert.equal(JSON.stringify(received).includes('secret'), false)
})

test('realtime errors stay compact and do not break a reload', async () => {
  const error = formatCloudRealtimeError({
    message: 'CHANNEL_ERROR postgres_changes relation activities sqlstate 42501',
    code: '42501',
  })
  assert.equal(error, CLOUD_REALTIME_UNAVAILABLE)
  assert.equal(error.includes('42501'), false)
  assert.equal(error.includes('activities'), false)
  let reloads = 0
  const handle = createCloudRealtimeReload(async () => {
    reloads += 1
    return { members: [{ userId: session.user.id }] }
  })
  await handle(['expenses'])
  assert.equal(reloads, 1)
})

test('reconnect after first subscribe requests an authoritative refresh', () => {
  const client = mockRealtimeClient()
  const refreshes = []
  subscribeCloudTripRealtime({
    client,
    tripId: tripA,
    onChange: (domains) => refreshes.push(domains),
  })
  assert.equal(refreshes.length, 0)
  client.channels[0].statusHandler('SUBSCRIBED')
  assert.equal(refreshes.length, 1)
  assert.equal(refreshes[0].includes('expenses'), true)
  assert.equal(refreshes[0].includes('gone'), false)
})

test('channel error status is user-safe', () => {
  const client = mockRealtimeClient()
  const statuses = []
  subscribeCloudTripRealtime({
    client,
    tripId: tripA,
    onStatus: (status, error) => statuses.push([status, formatCloudRealtimeError(error || status)]),
  })
  client.channels[0].statusHandler('CHANNEL_ERROR', { message: 'websocket closed' })
  assert.equal(statuses.at(-1)[0], 'CHANNEL_ERROR')
  assert.equal(statuses.at(-1)[1], CLOUD_REALTIME_UNAVAILABLE)
})

test('local functions and localStorage are never used', () => {
  const { writes } = installStorage()
  const client = mockRealtimeClient()
  const registry = immediateRegistry()
  const handle = registry.retain({ client, session, tripId: tripA, listener: { onChange() {} } })
  client.channels[0].emit('places', 'INSERT')
  handle.release()
  assert.equal(writes.length, 0)

  const files = [
    'src/lib/realtime/cloudRealtime.js',
    'src/hooks/useCloudTripRealtime.js',
    'src/components/trips/CloudLiveStatus.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
    assert.equal(src.includes('service_role'), false, file)
    assert.equal(src.includes('addExpense('), false, file)
    assert.equal(src.includes('voteOnPoll('), false, file)
  }
  assert.equal(
    CLOUD_REALTIME_EXCLUDED_TABLES.includes('poll_votes'),
    true,
  )
})
