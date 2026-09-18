import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLACE_STATUSES } from '../places.js'
import {
  CLOUD_PLACE_COLUMNS,
  CLOUD_PLACE_FORBIDDEN_WRITE_COLUMNS,
  cloudPlaceInsertPayload,
  cloudPlaceUpdatePayload,
  cloudPlaceVisitedChanges,
  createCloudPlace,
  deleteCloudPlace,
  getCloudTripPlaces,
  mapCloudPlace,
  updateCloudPlace,
} from './places.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const otherTripId = '22222222-2222-2222-2222-222222222222'
const placeId = '44444444-4444-4444-4444-444444444444'
const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'

function thenable(result, extra = {}) {
  const promise = Promise.resolve(result)
  return {
    ...extra,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

function mockReadClient({ data = [], error = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return thenable(
                { data, error },
                {
                  order(orderColumn, options) {
                    calls.push(['order', orderColumn, options])
                    return Promise.resolve({ data, error })
                  },
                },
              )
            },
          }
        },
        insert() {
          throw new Error('client must not insert during read')
        },
        update() {
          throw new Error('client must not update during read')
        },
        delete() {
          throw new Error('client must not delete during read')
        },
      }
    },
  }
}

function mockWriteClient({ insert, update, remove } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        insert(payload) {
          calls.push(['insert', payload])
          return {
            select(columns) {
              calls.push(['select', columns])
              return {
                single() {
                  calls.push(['single'])
                  return Promise.resolve(insert ?? { data: null, error: null })
                },
              }
            },
          }
        },
        update(payload) {
          calls.push(['update', payload])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                select(columns) {
                  calls.push(['select', columns])
                  return {
                    maybeSingle() {
                      calls.push(['maybeSingle'])
                      return Promise.resolve(update ?? { data: null, error: null })
                    },
                  }
                },
              }
            },
          }
        },
        delete() {
          calls.push(['delete'])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                select(columns) {
                  calls.push(['select', columns])
                  return {
                    maybeSingle() {
                      calls.push(['maybeSingle'])
                      return Promise.resolve(remove ?? { data: { id: value }, error: null })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
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

const row = {
  id: placeId,
  trip_id: tripId,
  name: 'Naschmarkt',
  category: 'Food',
  address: 'Wienzeile',
  area: 'Mariahilf',
  latitude: 48.1986,
  longitude: 16.359,
  notes: 'Saturday morning',
  website: null,
  opening_hours: '06:00–18:00',
  estimated_cost: '18.00',
  currency: 'EUR',
  rating: '4.50',
  status: 'planned',
  planned_day: '2026-10-12',
  map_x: 42,
  map_y: 58,
  created_by: you,
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
}

const createInput = {
  tripId,
  name: 'Naschmarkt',
  category: 'Food',
  address: 'Wienzeile',
  notes: 'Saturday morning',
  estimatedCost: 18,
  currency: 'EUR',
  rating: 4.5,
  status: 'planned',
  plannedDay: '2026-10-12',
  latitude: 48.1986,
  longitude: 16.359,
  created_by: alex,
  createdBy: alex,
  owner_id: alex,
  id: 'should-not-send',
}

test('place read returns an error when supabase is not configured', async () => {
  const result = await getCloudTripPlaces({ client: null, session, tripId })
  assert.deepEqual(result.places, [])
  assert.match(result.error, /not connected/)
})

test('place read requires an authenticated session', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudTripPlaces({ client, session: null, tripId })
  assert.deepEqual(result.places, [])
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('place read maps one trip and does not filter by user id', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudTripPlaces({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.places[0], mapCloudPlace(row))
  assert.equal(result.places[0].name, 'Naschmarkt')
  assert.equal(result.places[0].tripId, tripId)
  assert.equal(result.places[0].latitude, 48.1986)
  assert.equal(result.places[0].longitude, 16.359)
  assert.equal(result.places[0].plannedDay, '2026-10-12')
  assert.equal(result.places[0].status, 'planned')
  assert.equal(result.places[0].createdBy, you)
  assert.equal(result.places[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'places'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_PLACE_COLUMNS])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.equal(
    client.calls.some((call) => call[0] === 'eq' && call[1] === 'created_by'),
    false,
  )
})

test('empty place result stays empty', async () => {
  const client = mockReadClient({ data: [] })
  const result = await getCloudTripPlaces({ client, session, tripId })
  assert.deepEqual(result, { places: [], error: null })
})

test('place read maps RLS and network errors without leaking codes', async () => {
  const rls = await getCloudTripPlaces({
    client: mockReadClient({ error: { message: 'new row violates row-level security policy', code: '42501' } }),
    session,
    tripId,
  })
  assert.deepEqual(rls.places, [])
  assert.match(rls.error, /not available/)
  assert.equal(rls.error.includes('42501'), false)
  assert.equal(rls.error.includes('violates'), false)

  const network = await getCloudTripPlaces({
    client: mockReadClient({ error: { message: 'Failed to fetch' } }),
    session,
    tripId,
  })
  assert.match(network.error, /could not reach/i)
})

test('create place requires authentication', async () => {
  const client = mockWriteClient()
  const result = await createCloudPlace({ client, session: null, tripId, input: createInput })
  assert.equal(result.place, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('create place inserts an explicit payload and maps the returned row', async () => {
  const client = mockWriteClient({ insert: { data: row, error: null } })
  const result = await createCloudPlace({ client, session, tripId, input: createInput })
  assert.equal(result.error, null)
  assert.equal(result.place.id, placeId)
  assert.equal(result.place.source, 'cloud')
  const payload = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(payload.trip_id, tripId)
  assert.equal(payload.name, 'Naschmarkt')
  assert.equal(payload.status, 'planned')
  assert.equal(payload.planned_day, '2026-10-12')
  assert.equal(payload.latitude, 48.1986)
  assert.equal(payload.estimated_cost, 18)
  assert.deepEqual(client.calls[0], ['from', 'places'])
})

test('create payload only sends allowed place columns', () => {
  const payload = cloudPlaceInsertPayload(createInput, { tripId })
  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      'address',
      'category',
      'currency',
      'estimated_cost',
      'latitude',
      'longitude',
      'name',
      'notes',
      'planned_day',
      'rating',
      'status',
      'trip_id',
    ].sort(),
  )
  for (const key of CLOUD_PLACE_FORBIDDEN_WRITE_COLUMNS) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key)
  }
})

test('created_by is not client supplied on insert', async () => {
  const payload = cloudPlaceInsertPayload(
    { ...createInput, created_by: alex, createdBy: alex, owner_id: alex },
    { tripId },
  )
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'createdBy'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'owner_id'), false)

  const client = mockWriteClient({ insert: { data: row, error: null } })
  await createCloudPlace({
    client,
    session,
    tripId,
    input: { ...createInput, created_by: alex, createdBy: alex },
  })
  const inserted = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(inserted, 'created_by'), false)
  assert.equal(inserted.created_by, undefined)
})

test('create place maps database errors without leaking postgres text', async () => {
  const client = mockWriteClient({
    insert: { data: null, error: { message: 'duplicate key value violates unique constraint "places_pkey"', code: '23505' } },
  })
  const result = await createCloudPlace({ client, session, tripId, input: createInput })
  assert.equal(result.place, null)
  assert.match(result.error, /could not be saved/)
  assert.equal(result.error.includes('places_pkey'), false)
  assert.equal(result.error.includes('23505'), false)
})

test('update place returns the updated cloud place', async () => {
  const updatedRow = { ...row, name: 'Naschmarkt Hall', status: 'visited', planned_day: '2026-10-12' }
  const client = mockWriteClient({ update: { data: updatedRow, error: null } })
  const result = await updateCloudPlace({
    client,
    session,
    id: placeId,
    changes: { name: 'Naschmarkt Hall', status: 'visited', plannedDay: '2026-10-12' },
  })
  assert.equal(result.error, null)
  assert.equal(result.place.name, 'Naschmarkt Hall')
  assert.equal(result.place.status, 'visited')
  assert.equal(result.place.plannedDay, '2026-10-12')
  assert.equal(result.place.source, 'cloud')
  const payload = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(payload.name, 'Naschmarkt Hall')
  assert.deepEqual(client.calls.find((call) => call[0] === 'eq'), ['eq', 'id', placeId])
})

test('update cannot change trip_id', async () => {
  const payload = cloudPlaceUpdatePayload({
    trip_id: otherTripId,
    tripId: otherTripId,
    name: 'Moved',
  })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'trip_id'), false)
  assert.equal(payload.name, 'Moved')

  const client = mockWriteClient({ update: { data: { ...row, name: 'Moved' }, error: null } })
  await updateCloudPlace({
    client,
    session,
    id: placeId,
    changes: { trip_id: otherTripId, tripId: otherTripId, name: 'Moved' },
  })
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'trip_id'), false)
})

test('update cannot change created_by', async () => {
  const payload = cloudPlaceUpdatePayload({ created_by: alex, createdBy: alex, owner_id: alex, notes: 'x' })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'owner_id'), false)
  assert.equal(payload.notes, 'x')

  const client = mockWriteClient({ update: { data: { ...row, notes: 'x' }, error: null } })
  await updateCloudPlace({
    client,
    session,
    id: placeId,
    changes: { created_by: alex, createdBy: alex, notes: 'x' },
  })
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'created_by'), false)
})

test('update maps RLS errors without leaking codes', async () => {
  const client = mockWriteClient({
    update: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
  })
  const result = await updateCloudPlace({ client, session, id: placeId, changes: { name: 'Hidden' } })
  assert.equal(result.place, null)
  assert.match(result.error, /could not be saved/)
  assert.equal(result.error.includes('42501'), false)
})

test('delete place succeeds for a cloud uuid', async () => {
  const client = mockWriteClient({ remove: { data: { id: placeId }, error: null } })
  const result = await deleteCloudPlace({ client, session, id: placeId })
  assert.deepEqual(result, { ok: true, error: null })
  assert.deepEqual(client.calls[0], ['from', 'places'])
  assert.equal(client.calls.some((call) => call[0] === 'from' && call[1] === 'itinerary_items'), false)
  assert.deepEqual(client.calls.find((call) => call[0] === 'eq'), ['eq', 'id', placeId])
})

test('delete maps RLS errors without leaking codes', async () => {
  const client = mockWriteClient({
    remove: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
  })
  const result = await deleteCloudPlace({ client, session, id: placeId })
  assert.equal(result.ok, false)
  assert.match(result.error, /could not be deleted/)
  assert.equal(result.error.includes('42501'), false)
})

test('saved, planned, and visited statuses are preserved', () => {
  assert.deepEqual(PLACE_STATUSES, ['saved', 'planned', 'visited'])
  for (const status of PLACE_STATUSES) {
    const payload = cloudPlaceInsertPayload({ tripId, name: 'Cafe', status }, { tripId })
    assert.equal(payload.status, status)
    assert.equal(mapCloudPlace({ ...row, status }).status, status)
  }
})

test('planned_day is preserved when a place is marked visited', () => {
  const place = mapCloudPlace(row)
  const changes = cloudPlaceVisitedChanges(place)
  assert.equal(changes.status, 'visited')
  assert.equal(changes.plannedDay, '2026-10-12')
  const payload = cloudPlaceUpdatePayload(changes)
  assert.equal(payload.status, 'visited')
  assert.equal(payload.planned_day, '2026-10-12')
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'trip_id'), false)
})

test('cloud create does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ insert: { data: row, error: null } })
  await createCloudPlace({ client, session, tripId, input: createInput })
  assert.equal(writes.length, 0)
})

test('cloud delete does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ remove: { data: { id: placeId }, error: null } })
  await deleteCloudPlace({ client, session, id: placeId })
  assert.equal(writes.length, 0)
})

test('cloud place code stays off the local store', () => {
  const files = [
    'src/lib/trips/places.js',
    'src/hooks/useCloudTripPlaces.js',
    'src/components/trips/CloudPlacesSheet.jsx',
    'src/components/trips/CloudPlaceForm.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('addPlace('), false, file)
    assert.equal(src.includes('updatePlace('), false, file)
    assert.equal(src.includes('deletePlace('), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
  }

  const layer = readFileSync(join(root, 'src/lib/trips/places.js'), 'utf8')
  assert.match(layer, /from\('places'\)/)
  assert.equal(layer.includes('itinerary_items'), false)
  assert.equal(layer.includes('service_role'), false)
  assert.match(readFileSync(join(root, 'src/hooks/useCloudTripPlaces.js'), 'utf8'), /getCloudTripMembers/)
})
