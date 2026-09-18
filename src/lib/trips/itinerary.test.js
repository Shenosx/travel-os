import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUD_ITINERARY_CATEGORIES,
  CLOUD_ITINERARY_DAY_COLUMNS,
  CLOUD_ITINERARY_FORBIDDEN_WRITE_COLUMNS,
  CLOUD_ITINERARY_ITEM_COLUMNS,
  assembleCloudItinerary,
  cloudItineraryAttribution,
  cloudItineraryDayInsertPayload,
  cloudItineraryItemInsertPayload,
  cloudItineraryItemUpdatePayload,
  cloudItineraryReorderPlan,
  createCloudItineraryDay,
  createCloudItineraryItem,
  deleteCloudItineraryDay,
  deleteCloudItineraryItem,
  formatCloudItineraryError,
  getCloudItineraryDays,
  getCloudItineraryItems,
  mapCloudItineraryDay,
  mapCloudItineraryItem,
  moveCloudItineraryItem,
  reorderCloudItineraryItems,
  updateCloudItineraryDay,
  updateCloudItineraryItem,
} from './itinerary.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const otherTripId = '22222222-2222-2222-2222-222222222222'
const dayId = '66666666-6666-6666-6666-666666666666'
const itemId = '77777777-7777-7777-7777-777777777777'
const itemIdB = '88888888-8888-8888-8888-888888888888'
const itemIdC = '99999999-9999-9999-9999-999999999999'
const placeId = '44444444-4444-4444-4444-444444444444'
const bookingId = '55555555-5555-5555-5555-555555555555'
const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'
const maya = '00000000-0000-0000-0000-000000000004'

function thenable(result, extra = {}) {
  const promise = Promise.resolve(result)
  return {
    ...extra,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

function mockReadClient({ table, data = [], error = null } = {}) {
  const calls = []
  return {
    calls,
    from(name) {
      calls.push(['from', name])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                order(orderColumn, options) {
                  calls.push(['order', orderColumn, options])
                  return thenable(
                    { data, error },
                    {
                      order(nextColumn, nextOptions) {
                        calls.push(['order', nextColumn, nextOptions])
                        return Promise.resolve({ data, error })
                      },
                    },
                  )
                },
              }
            },
          }
        },
      }
    },
  }
}

function mockWriteClient({ table, insert, update, remove } = {}) {
  const calls = []
  return {
    calls,
    from(name) {
      calls.push(['from', name])
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
                      const resolved =
                        typeof update === 'function' ? update(payload, value) : update ?? { data: null, error: null }
                      return Promise.resolve(resolved)
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

const dayRow = {
  id: dayId,
  trip_id: tripId,
  date: '2026-12-12',
  day_number: 1,
  title: 'Arrival',
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
}

const itemRow = {
  id: itemId,
  trip_id: tripId,
  day_id: dayId,
  item_date: '2026-12-12',
  sort_order: 0,
  time: '09:30',
  start_time: '09:30',
  end_time: '11:00',
  title: 'Schönbrunn',
  category: 'sight',
  place_label: 'Schönbrunn Palace',
  notes: 'Morning',
  place_id: placeId,
  booking_id: bookingId,
  created_by: you,
  updated_by: you,
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
}

const itemInput = {
  tripId,
  itemDate: '2026-12-12',
  sortOrder: 0,
  time: '09:30',
  title: 'Schönbrunn',
  category: 'sight',
  notes: 'Morning',
  placeId,
  bookingId,
  created_by: alex,
  createdBy: alex,
  updated_by: alex,
  updatedBy: alex,
  id: 'should-not-send',
}

test('itinerary read returns an error when supabase is not configured', async () => {
  const days = await getCloudItineraryDays({ client: null, session, tripId })
  const items = await getCloudItineraryItems({ client: null, session, tripId })
  assert.deepEqual(days.days, [])
  assert.deepEqual(items.items, [])
  assert.match(days.error, /not connected/)
  assert.match(items.error, /not connected/)
})

test('itinerary read requires an authenticated session', async () => {
  const client = mockReadClient({ data: [dayRow] })
  const days = await getCloudItineraryDays({ client, session: null, tripId })
  const items = await getCloudItineraryItems({ client, session: null, tripId })
  assert.match(days.error, /sign in/i)
  assert.match(items.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('itinerary days read maps one trip and does not filter by user id', async () => {
  const client = mockReadClient({ data: [dayRow] })
  const result = await getCloudItineraryDays({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.days[0], mapCloudItineraryDay(dayRow))
  assert.equal(result.days[0].dayNumber, 1)
  assert.equal(result.days[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'itinerary_days'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_ITINERARY_DAY_COLUMNS])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.equal(client.calls.some((call) => call[0] === 'eq' && call[1] === 'created_by'), false)
})

test('itinerary items read maps one trip ordered by date and sort_order', async () => {
  const client = mockReadClient({ data: [itemRow] })
  const result = await getCloudItineraryItems({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.items[0], mapCloudItineraryItem(itemRow))
  assert.equal(result.items[0].placeId, placeId)
  assert.equal(result.items[0].bookingId, bookingId)
  assert.equal(result.items[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'itinerary_items'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_ITINERARY_ITEM_COLUMNS])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.deepEqual(client.calls[3], ['order', 'item_date', { ascending: true }])
  assert.deepEqual(client.calls[4], ['order', 'sort_order', { ascending: true }])
})

test('empty itinerary result stays empty', async () => {
  const days = await getCloudItineraryDays({ client: mockReadClient({ data: [] }), session, tripId })
  const items = await getCloudItineraryItems({ client: mockReadClient({ data: [] }), session, tripId })
  assert.deepEqual(days, { days: [], error: null })
  assert.deepEqual(items, { items: [], error: null })
})

test('itinerary read maps RLS and network errors without leaking codes', async () => {
  const rls = await getCloudItineraryItems({
    client: mockReadClient({ error: { message: 'new row violates row-level security policy', code: '42501' } }),
    session,
    tripId,
  })
  assert.deepEqual(rls.items, [])
  assert.match(rls.error, /not available/)
  assert.equal(rls.error.includes('42501'), false)

  const network = await getCloudItineraryDays({
    client: mockReadClient({ error: { message: 'Failed to fetch' } }),
    session,
    tripId,
  })
  assert.match(network.error, /could not reach/i)
})

test('foreign key errors stay short and do not leak constraint names', () => {
  const error = formatCloudItineraryError(
    {
      code: '23503',
      message:
        'insert or update on table "itinerary_items" violates foreign key constraint "itinerary_items_place_trip_fkey"',
    },
    'create',
  )
  assert.equal(error, 'That place, booking, or day could not be linked.')
  assert.equal(error.includes('place_trip_fkey'), false)
})

test('create itinerary item requires authentication', async () => {
  const client = mockWriteClient()
  const result = await createCloudItineraryItem({ client, session: null, tripId, input: itemInput })
  assert.equal(result.item, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('create itinerary day inserts an explicit payload', async () => {
  const client = mockWriteClient({ insert: { data: dayRow, error: null } })
  const result = await createCloudItineraryDay({
    client,
    session,
    tripId,
    input: { date: '2026-12-12', dayNumber: 1, title: 'Arrival', created_by: alex },
  })
  assert.equal(result.error, null)
  assert.equal(result.day.id, dayId)
  assert.equal(result.day.dayNumber, 1)
  const payload = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(payload.trip_id, tripId)
  assert.equal(payload.date, '2026-12-12')
  assert.equal(payload.day_number, 1)
  assert.deepEqual(client.calls[0], ['from', 'itinerary_days'])
})

test('create itinerary item inserts an explicit payload and maps the returned row', async () => {
  const client = mockWriteClient({ insert: { data: itemRow, error: null } })
  const result = await createCloudItineraryItem({ client, session, tripId, input: itemInput })
  assert.equal(result.error, null)
  assert.equal(result.item.id, itemId)
  assert.equal(result.item.source, 'cloud')
  const payload = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(payload.trip_id, tripId)
  assert.equal(payload.title, 'Schönbrunn')
  assert.equal(payload.place_id, placeId)
  assert.equal(payload.booking_id, bookingId)
  assert.deepEqual(client.calls[0], ['from', 'itinerary_items'])
})

test('create payloads only send allowed columns', () => {
  const dayPayload = cloudItineraryDayInsertPayload(
    { tripId, date: '2026-12-12', dayNumber: 1, title: 'Arrival', id: 'x', created_by: alex },
    { tripId },
  )
  assert.deepEqual(Object.keys(dayPayload).sort(), ['date', 'day_number', 'title', 'trip_id'].sort())

  const itemPayload = cloudItineraryItemInsertPayload(itemInput, { tripId })
  for (const key of CLOUD_ITINERARY_FORBIDDEN_WRITE_COLUMNS) {
    assert.equal(Object.prototype.hasOwnProperty.call(itemPayload, key), false, key)
  }
  assert.equal(itemPayload.place_id, placeId)
  assert.equal(itemPayload.booking_id, bookingId)
  assert.equal(Object.prototype.hasOwnProperty.call(itemPayload, 'place'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(itemPayload, 'booking'), false)
})

test('created_by and updated_by are not client supplied on insert', async () => {
  const payload = cloudItineraryItemInsertPayload(itemInput, { tripId })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'updated_by'), false)

  const client = mockWriteClient({ insert: { data: itemRow, error: null } })
  await createCloudItineraryItem({ client, session, tripId, input: itemInput })
  const inserted = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(inserted.created_by, undefined)
  assert.equal(inserted.updated_by, undefined)
})

test('update itinerary day returns the updated cloud day', async () => {
  const client = mockWriteClient({ update: { data: { ...dayRow, title: 'Landed' }, error: null } })
  const result = await updateCloudItineraryDay({ client, session, id: dayId, changes: { title: 'Landed' } })
  assert.equal(result.error, null)
  assert.equal(result.day.title, 'Landed')
  assert.equal(result.day.source, 'cloud')
})

test('update itinerary item returns the updated cloud item', async () => {
  const client = mockWriteClient({ update: { data: { ...itemRow, title: 'Palace grounds' }, error: null } })
  const result = await updateCloudItineraryItem({
    client,
    session,
    id: itemId,
    changes: { title: 'Palace grounds' },
  })
  assert.equal(result.error, null)
  assert.equal(result.item.title, 'Palace grounds')
  assert.equal(result.item.id, itemId)
})

test('update cannot change trip_id', async () => {
  const payload = cloudItineraryItemUpdatePayload({ trip_id: otherTripId, tripId: otherTripId, title: 'Moved' })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'trip_id'), false)
  const client = mockWriteClient({ update: { data: { ...itemRow, title: 'Moved' }, error: null } })
  await updateCloudItineraryItem({
    client,
    session,
    id: itemId,
    changes: { trip_id: otherTripId, tripId: otherTripId, title: 'Moved' },
  })
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'trip_id'), false)
})

test('update cannot change created_by', async () => {
  const payload = cloudItineraryItemUpdatePayload({ created_by: alex, updated_by: alex, notes: 'x' })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'updated_by'), false)
  const client = mockWriteClient({ update: { data: { ...itemRow, notes: 'x' }, error: null } })
  await updateCloudItineraryItem({
    client,
    session,
    id: itemId,
    changes: { created_by: alex, updatedBy: alex, notes: 'x' },
  })
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'updated_by'), false)
})

test('update maps RLS errors without leaking codes', async () => {
  const client = mockWriteClient({
    update: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
  })
  const result = await updateCloudItineraryItem({ client, session, id: itemId, changes: { title: 'Hidden' } })
  assert.equal(result.item, null)
  assert.match(result.error, /could not be saved/)
  assert.equal(result.error.includes('42501'), false)
})

test('delete itinerary item succeeds for a cloud uuid', async () => {
  const client = mockWriteClient({ remove: { data: { id: itemId }, error: null } })
  const result = await deleteCloudItineraryItem({ client, session, id: itemId })
  assert.deepEqual(result, { ok: true, error: null })
  assert.deepEqual(client.calls[0], ['from', 'itinerary_items'])
  assert.equal(client.calls.some((call) => call[0] === 'from' && call[1] === 'places'), false)
  assert.equal(client.calls.some((call) => call[0] === 'from' && call[1] === 'bookings'), false)
  assert.equal(client.calls.some((call) => call[0] === 'from' && call[1] === 'expenses'), false)
})

test('delete itinerary day succeeds for a cloud uuid', async () => {
  const client = mockWriteClient({ remove: { data: { id: dayId }, error: null } })
  const result = await deleteCloudItineraryDay({ client, session, id: dayId })
  assert.deepEqual(result, { ok: true, error: null })
  assert.deepEqual(client.calls[0], ['from', 'itinerary_days'])
})

test('delete maps RLS errors without leaking codes', async () => {
  const client = mockWriteClient({
    remove: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
  })
  const result = await deleteCloudItineraryItem({ client, session, id: itemId })
  assert.equal(result.ok, false)
  assert.match(result.error, /could not be deleted/)
  assert.equal(result.error.includes('42501'), false)
})

test('sort_order is preserved on create and assemble', () => {
  const payload = cloudItineraryItemInsertPayload({ tripId, title: 'Stop', itemDate: '2026-12-12', sortOrder: 3 }, { tripId })
  assert.equal(payload.sort_order, 3)
  const itinerary = assembleCloudItinerary(
    [mapCloudItineraryDay(dayRow)],
    [
      mapCloudItineraryItem({ ...itemRow, id: itemIdC, sort_order: 2, title: 'C' }),
      mapCloudItineraryItem({ ...itemRow, id: itemId, sort_order: 0, title: 'A' }),
      mapCloudItineraryItem({ ...itemRow, id: itemIdB, sort_order: 1, title: 'B' }),
    ],
  )
  assert.deepEqual(
    itinerary.days[0].items.map((item) => item.title),
    ['A', 'B', 'C'],
  )
  assert.equal(itinerary.days[0].dayNumber, 1)
})

test('reorder plan is deterministic and applied as sequential sort_order updates', async () => {
  const plan = cloudItineraryReorderPlan([itemIdC, itemId, itemIdB])
  assert.deepEqual(plan, [
    { id: itemIdC, sort_order: 0 },
    { id: itemId, sort_order: 1 },
    { id: itemIdB, sort_order: 2 },
  ])
  const client = mockWriteClient({
    update: (payload, id) => ({ data: { ...itemRow, id, sort_order: payload.sort_order }, error: null }),
  })
  const result = await reorderCloudItineraryItems({ client, session, orderedIds: [itemIdC, itemId, itemIdB] })
  assert.equal(result.error, null)
  const updates = client.calls.filter((call) => call[0] === 'update').map((call) => call[1].sort_order)
  assert.deepEqual(updates, [0, 1, 2])
  assert.deepEqual(
    result.items.map((item) => item.id),
    [itemIdC, itemId, itemIdB],
  )
})

test('move item between days preserves identity', async () => {
  const client = mockWriteClient({
    update: { data: { ...itemRow, item_date: '2026-12-13', sort_order: 0, day_id: null }, error: null },
  })
  const result = await moveCloudItineraryItem({
    client,
    session,
    id: itemId,
    itemDate: '2026-12-13',
    sortOrder: 0,
    dayId: null,
  })
  assert.equal(result.item.id, itemId)
  assert.equal(result.item.itemDate, '2026-12-13')
  const payload = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(payload.item_date, '2026-12-13')
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'id'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'trip_id'), false)
})

test('place_id is preserved as a UUID reference', () => {
  const item = mapCloudItineraryItem(itemRow)
  assert.equal(item.placeId, placeId)
  const payload = cloudItineraryItemInsertPayload({ ...itemInput, place: { id: placeId, name: 'Palace' } }, { tripId })
  assert.equal(payload.place_id, placeId)
})

test('booking_id is preserved as a UUID reference', () => {
  const item = mapCloudItineraryItem(itemRow)
  assert.equal(item.bookingId, bookingId)
  const payload = cloudItineraryItemInsertPayload({ ...itemInput, booking: { id: bookingId, title: 'Flight' } }, { tripId })
  assert.equal(payload.booking_id, bookingId)
})

test('place object is not copied into the itinerary payload', () => {
  const payload = cloudItineraryItemInsertPayload(
    { ...itemInput, place: { id: placeId, name: 'Palace', latitude: 48.1 } },
    { tripId },
  )
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'place'), false)
  assert.equal(typeof payload.place_id, 'string')
})

test('booking object is not copied into the itinerary payload', () => {
  const payload = cloudItineraryItemInsertPayload(
    { ...itemInput, booking: { id: bookingId, title: 'Flight', confirmationNumber: 'X' } },
    { tripId },
  )
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'booking'), false)
  assert.equal(typeof payload.booking_id, 'string')
})

test('created_by and updated_by remain database controlled', () => {
  const item = mapCloudItineraryItem({ ...itemRow, created_by: you, updated_by: maya })
  assert.equal(item.createdBy, you)
  assert.equal(item.updatedBy, maya)
  const members = [
    { userId: you, name: 'Jamie', shortName: 'Jamie' },
    { userId: maya, name: 'Maya Chen', shortName: 'Maya' },
  ]
  assert.equal(cloudItineraryAttribution(item, members, you), 'Updated by Maya')
  assert.equal(cloudItineraryAttribution(item, members, alex), 'Updated by Maya')
  assert.deepEqual(CLOUD_ITINERARY_CATEGORIES, [
    'arrival',
    'departure',
    'lodging',
    'food',
    'sight',
    'transport',
    'free',
  ])
})

test('cloud create does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ insert: { data: itemRow, error: null } })
  await createCloudItineraryItem({ client, session, tripId, input: itemInput })
  assert.equal(writes.length, 0)
})

test('cloud update does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ update: { data: itemRow, error: null } })
  await updateCloudItineraryItem({ client, session, id: itemId, changes: { title: 'x' } })
  assert.equal(writes.length, 0)
})

test('cloud delete does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ remove: { data: { id: itemId }, error: null } })
  await deleteCloudItineraryItem({ client, session, id: itemId })
  assert.equal(writes.length, 0)
})

test('cloud itinerary code stays off the local store and service role', () => {
  const files = [
    'src/lib/trips/itinerary.js',
    'src/hooks/useCloudTripItinerary.js',
    'src/components/trips/CloudItinerarySheet.jsx',
    'src/components/trips/CloudItineraryItemForm.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('addItineraryItem('), false, file)
    assert.equal(src.includes('updateItineraryItem('), false, file)
    assert.equal(src.includes('deleteItineraryItem('), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
    assert.equal(src.includes('service_role'), false, file)
  }
})
