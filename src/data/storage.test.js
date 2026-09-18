import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSeedSnapshot } from './seed.js'
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  createPendingOperation,
  loadSnapshot,
  saveSnapshot,
} from './storage.js'
import { getBalances, getExpenseActorIds, getSettlements } from '../lib/expenses.js'

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

function reload(seed = createSeedSnapshot()) {
  return loadSnapshot(seed)
}

test('storage uses a versioned key', () => {
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  assert.equal(STORAGE_VERSION, 1)
})

test('empty storage hydrates from seed without flicker data', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const loaded = loadSnapshot(seed)
  assert.equal(loaded.version, 1)
  assert.ok(loaded.trips.length)
  assert.ok(loaded.expenses.length)
  assert.ok(loaded.places.length)
  assert.deepEqual(loaded.pendingOps, [])
})

test('saved snapshot is restored on reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const expense = {
    id: 'exp-persist-coffee',
    tripId: seed.trips[0].id,
    amount: 18,
    currency: 'MYR',
    category: 'food',
    date: '2026-09-16',
    description: 'Airport coffee',
    payerId: 'user-jamie',
    shares: [{ userId: 'user-jamie', amount: 18 }],
  }
  saveSnapshot({ ...seed, expenses: [expense, ...seed.expenses] })
  const loaded = reload(createSeedSnapshot())
  assert.equal(loaded.expenses[0].id, 'exp-persist-coffee')
  assert.equal(loaded.expenses[0].description, 'Airport coffee')
})

test('adding, editing, and deleting an expense survives reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const created = {
    id: 'exp-crud',
    tripId: 'trip-bangkok',
    amount: 40,
    currency: 'MYR',
    category: 'food',
    date: '2026-09-16',
    description: 'Mango sticky rice',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 25 },
      { userId: 'user-sofia', amount: 15 },
    ],
  }
  saveSnapshot({ ...seed, expenses: [created, ...seed.expenses] })
  let loaded = reload()
  assert.ok(loaded.expenses.some((item) => item.id === 'exp-crud'))

  saveSnapshot({
    ...loaded,
    expenses: loaded.expenses.map((item) =>
      item.id === 'exp-crud' ? { ...item, description: 'Mango sticky rice, extra coconut' } : item,
    ),
  })
  loaded = reload()
  assert.equal(loaded.expenses.find((item) => item.id === 'exp-crud').description, 'Mango sticky rice, extra coconut')

  saveSnapshot({
    ...loaded,
    expenses: loaded.expenses.filter((item) => item.id !== 'exp-crud'),
  })
  loaded = reload()
  assert.equal(loaded.expenses.some((item) => item.id === 'exp-crud'), false)
})

test('adding, editing, and deleting a place survives reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const place = {
    id: 'place-crud',
    tripId: 'trip-vienna',
    name: 'Café Sperl',
    category: 'Food',
    status: 'saved',
  }
  saveSnapshot({ ...seed, places: [place, ...seed.places] })
  let loaded = reload()
  assert.equal(loaded.places[0].name, 'Café Sperl')

  saveSnapshot({
    ...loaded,
    places: loaded.places.map((item) => (item.id === 'place-crud' ? { ...item, status: 'planned' } : item)),
  })
  loaded = reload()
  assert.equal(loaded.places.find((item) => item.id === 'place-crud').status, 'planned')

  saveSnapshot({
    ...loaded,
    places: loaded.places.filter((item) => item.id !== 'place-crud'),
  })
  loaded = reload()
  assert.equal(loaded.places.some((item) => item.id === 'place-crud'), false)
})

test('adding, editing, and deleting a booking survives reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const booking = {
    id: 'book-crud',
    tripId: 'trip-vienna',
    type: 'flight',
    title: 'KUL → VIE extra',
    status: 'confirmed',
    startDate: '2026-12-12',
  }
  saveSnapshot({ ...seed, bookings: [booking, ...seed.bookings] })
  let loaded = reload()
  assert.equal(loaded.bookings[0].title, 'KUL → VIE extra')

  saveSnapshot({
    ...loaded,
    bookings: loaded.bookings.map((item) =>
      item.id === 'book-crud' ? { ...item, title: 'KUL → VIE extra (moved)' } : item,
    ),
  })
  loaded = reload()
  assert.equal(loaded.bookings.find((item) => item.id === 'book-crud').title, 'KUL → VIE extra (moved)')

  saveSnapshot({
    ...loaded,
    bookings: loaded.bookings.filter((item) => item.id !== 'book-crud'),
  })
  loaded = reload()
  assert.equal(loaded.bookings.some((item) => item.id === 'book-crud'), false)
})

test('adding and editing an itinerary item survives reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const itineraries = seed.itineraries.map((entry) => {
    if (entry.tripId !== 'trip-vienna') return entry
    const days = entry.days.map((day, index) =>
      index === 0
        ? {
            ...day,
            items: [...day.items, { id: 'item-crud', title: 'Evening walk', category: 'free', placeId: day.items[0]?.placeId }],
          }
        : day,
    )
    return { ...entry, days }
  })
  saveSnapshot({ ...seed, itineraries })
  let loaded = reload()
  const vienna = loaded.itineraries.find((entry) => entry.tripId === 'trip-vienna')
  const created = vienna.days[0].items.find((item) => item.id === 'item-crud')
  assert.equal(created.title, 'Evening walk')
  assert.ok(!created.bookingId)
  if (created.placeId) assert.equal(typeof created.placeId, 'string')

  const edited = loaded.itineraries.map((entry) => {
    if (entry.tripId !== 'trip-vienna') return entry
    return {
      ...entry,
      days: entry.days.map((day) => ({
        ...day,
        items: day.items.map((item) => (item.id === 'item-crud' ? { ...item, title: 'Evening walk by the canal' } : item)),
      })),
    }
  })
  saveSnapshot({ ...loaded, itineraries: edited })
  loaded = reload()
  const updated = loaded.itineraries
    .find((entry) => entry.tripId === 'trip-vienna')
    .days[0].items.find((item) => item.id === 'item-crud')
  assert.equal(updated.title, 'Evening walk by the canal')
})

test('trips and shared members persist across reload', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const trip = {
    id: 'trip-lisbon',
    city: 'Lisbon',
    country: 'Portugal',
    destination: 'Lisbon, Portugal',
    startDate: '2027-04-02',
    endDate: '2027-04-08',
    budgetAmount: 5000,
    currency: 'MYR',
    visibility: 'shared',
    ownerId: 'user-jamie',
    members: [
      { userId: 'user-jamie', role: 'owner' },
      { userId: 'user-alex', role: 'editor' },
    ],
    inviteCode: 'lisbon-x1',
    notes: '',
  }
  saveSnapshot({ ...seed, trips: [trip, ...seed.trips] })
  const loaded = reload()
  const stored = loaded.trips.find((item) => item.id === 'trip-lisbon')
  assert.equal(stored.city, 'Lisbon')
  assert.deepEqual(
    stored.members.map((member) => member.userId),
    ['user-jamie', 'user-alex'],
  )
})

test('malformed JSON falls back to seed without throwing', () => {
  const map = installStorage()
  map.set(STORAGE_KEY, '{not-json')
  const seed = createSeedSnapshot()
  const loaded = loadSnapshot(seed)
  assert.equal(loaded.trips[0].id, seed.trips[0].id)
  assert.ok(loaded.expenses.length)
})

test('corrupt expenses keep valid trips', () => {
  installStorage()
  const seed = createSeedSnapshot()
  saveSnapshot({
    ...seed,
    trips: seed.trips,
    expenses: 'broken',
  })
  const loaded = reload(createSeedSnapshot())
  assert.ok(loaded.trips.some((trip) => trip.id === seed.trips[0].id))
  assert.deepEqual(loaded.expenses, [])
})

test('unversioned snapshot migrates to v1', () => {
  installStorage()
  const seed = createSeedSnapshot()
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      trips: seed.trips,
      expenses: seed.expenses,
      users: seed.users,
      itineraries: seed.itineraries,
      places: seed.places,
      bookings: seed.bookings,
      invitations: seed.invitations,
      activities: seed.activities,
      polls: seed.polls,
    }),
  )
  const loaded = reload(createSeedSnapshot())
  assert.equal(loaded.version, 1)
  assert.deepEqual(loaded.pendingOps, [])
  assert.ok(loaded.trips.length)
})

test('settlement is unchanged after reload, including unequal shares and a member who left', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const leftover = {
    id: 'exp-left-member',
    tripId: 'trip-bangkok',
    amount: 90,
    currency: 'MYR',
    category: 'food',
    date: '2026-08-07',
    description: 'Dinner with someone who left',
    payerId: 'user-oliver',
    shares: [
      { userId: 'user-jamie', amount: 30 },
      { userId: 'user-sofia', amount: 30 },
      { userId: 'user-oliver', amount: 30 },
    ],
  }
  const expenses = [leftover, ...seed.expenses.filter((item) => item.tripId === 'trip-bangkok')]
  saveSnapshot({ ...seed, expenses: [...expenses, ...seed.expenses.filter((item) => item.tripId !== 'trip-bangkok')] })

  const beforeIds = getExpenseActorIds(expenses, ['user-jamie', 'user-sofia'])
  const before = getSettlements(getBalances(expenses, beforeIds))

  const loaded = reload()
  const restored = loaded.expenses.filter((item) => item.tripId === 'trip-bangkok')
  const afterIds = getExpenseActorIds(restored, ['user-jamie', 'user-sofia'])
  const after = getSettlements(getBalances(restored, afterIds))

  assert.ok(afterIds.includes('user-oliver'))
  assert.deepEqual(after, before)
  assert.ok(after.length)
})

test('pending operations are stored for future sync, not required to mutate locally', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const op = createPendingOperation('expense', 'create', { id: 'exp-offline' })
  saveSnapshot({ ...seed, pendingOps: [op] })
  const loaded = reload()
  assert.equal(loaded.pendingOps[0].status, 'pending')
  assert.equal(loaded.pendingOps[0].entity, 'expense')
})

test('tripMigrations persist locally without changing the storage key', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const migration = {
    id: 'mig-tokyo',
    localTripId: 'trip-tokyo',
    cloudTripId: '22222222-2222-4222-8222-222222222222',
    path: 'create',
    status: 'completed',
    identityMappings: {
      'user-jamie': { type: 'self', cloudUserId: '11111111-1111-4111-8111-111111111111' },
    },
    mappings: {
      trip: '22222222-2222-4222-8222-222222222222',
      places: { 'place-1': '33333333-3333-4333-8333-333333333333' },
    },
    access_token: 'secret-should-drop',
    skipped: [],
    blocked: [],
    errors: [],
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  }
  saveSnapshot({ ...seed, tripMigrations: [migration] })
  const loaded = reload()
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  assert.equal(loaded.version, 1)
  assert.equal(loaded.tripMigrations[0].localTripId, 'trip-tokyo')
  assert.equal(loaded.tripMigrations[0].mappings.places['place-1'], '33333333-3333-4333-8333-333333333333')
  assert.equal(loaded.tripMigrations[0].access_token, undefined)
  assert.equal(loaded.trips.find((trip) => trip.id === 'trip-tokyo')?.id, 'trip-tokyo')
})

test('legacy snapshots without tripMigrations hydrate an empty collection', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const { tripMigrations: _ignored, ...without } = seed
  saveSnapshot(without)
  const loaded = reload(createSeedSnapshot())
  assert.deepEqual(loaded.tripMigrations, [])
})

const PERSONAL_COLLECTIONS = [
  'packingCategories',
  'packingItems',
  'checklistCategories',
  'checklistItems',
  'notes',
  'memories',
]

test('legacy V1 snapshot without personal collections hydrates empty arrays', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const legacy = {
    version: 1,
    users: seed.users,
    trips: seed.trips,
    expenses: seed.expenses,
    itineraries: seed.itineraries,
    places: seed.places,
    bookings: seed.bookings,
    invitations: seed.invitations,
    activities: seed.activities,
    polls: seed.polls,
    pendingOps: seed.pendingOps,
    tripMigrations: seed.tripMigrations,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))
  const loaded = loadSnapshot(createSeedSnapshot())

  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  assert.equal(loaded.version, 1)
  for (const name of PERSONAL_COLLECTIONS) {
    assert.equal(Object.hasOwn(legacy, name), false)
    assert.deepEqual(loaded[name], [])
  }
  assert.deepEqual(loaded.trips, seed.trips)
  assert.deepEqual(loaded.expenses, seed.expenses)
  assert.deepEqual(loaded.places, seed.places)
  assert.deepEqual(loaded.bookings, seed.bookings)
  assert.deepEqual(loaded.itineraries, seed.itineraries)
  assert.deepEqual(loaded.users, seed.users)
  assert.deepEqual(loaded.polls, seed.polls)
  assert.deepEqual(loaded.invitations, seed.invitations)
  assert.deepEqual(loaded.activities, seed.activities)
})

test('round-trip save/load preserves the six empty personal collections', () => {
  installStorage()
  const seed = createSeedSnapshot()
  for (const name of PERSONAL_COLLECTIONS) {
    assert.deepEqual(seed[name], [])
  }
  saveSnapshot(seed)
  const loaded = reload(createSeedSnapshot())
  for (const name of PERSONAL_COLLECTIONS) {
    assert.deepEqual(loaded[name], [])
  }
  const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY))
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  for (const name of PERSONAL_COLLECTIONS) {
    assert.deepEqual(persisted[name], [])
  }
})

test('snapshot serialization does not contain Blob/File/objectURL data', () => {
  installStorage()
  const seed = createSeedSnapshot()
  saveSnapshot({
    ...seed,
    memories: [
      {
        id: 'mem-strip',
        tripId: 'trip-vienna',
        userId: 'user-jamie',
        caption: 'Quiet street',
        date: '2026-12-13',
        createdAt: '2026-12-13T10:00:00.000Z',
        updatedAt: '2026-12-13T10:00:00.000Z',
        blob: { fake: true },
        src: 'blob:https://example.test/1',
        objectURL: 'blob:https://example.test/2',
        file: { name: 'photo.jpg' },
      },
    ],
  })
  const raw = localStorage.getItem(STORAGE_KEY)
  const persisted = JSON.parse(raw)
  const memory = persisted.memories[0]
  assert.equal(raw.includes('blob:'), false)
  assert.equal(memory.caption, 'Quiet street')
  assert.equal(Object.hasOwn(memory, 'blob'), false)
  assert.equal(Object.hasOwn(memory, 'src'), false)
  assert.equal(Object.hasOwn(memory, 'objectURL'), false)
  assert.equal(Object.hasOwn(memory, 'file'), false)
})

test('pendingOps persist the Cloud user stamp without secrets', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const op = createPendingOperation(
    'place',
    'create',
    { name: 'Cafe', access_token: 'secret-token' },
    {
      cloudTripId: '11111111-1111-4111-8111-111111111111',
      cloudEntityId: '22222222-2222-4222-8222-222222222222',
      authUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  )
  saveSnapshot({ ...seed, pendingOps: [op] })
  const loaded = reload()
  assert.equal(loaded.pendingOps[0].authUserId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(Object.hasOwn(loaded.pendingOps[0].payload, 'access_token'), false)
})
