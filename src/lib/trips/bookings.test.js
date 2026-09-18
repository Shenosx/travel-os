import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKING_STATUSES, BOOKING_TYPES } from '../bookings.js'
import { cloudExpenseRpcPayload } from './expenses.js'
import {
  CLOUD_BOOKING_COLUMNS,
  CLOUD_BOOKING_FORBIDDEN_WRITE_COLUMNS,
  CLOUD_BOOKING_STATUSES,
  CLOUD_BOOKING_TYPES,
  cloudBookingInsertPayload,
  cloudBookingUpdatePayload,
  createCloudBooking,
  deleteCloudBooking,
  getCloudTripBookings,
  isCloudBookingId,
  mapCloudBooking,
  updateCloudBooking,
} from './bookings.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const otherTripId = '22222222-2222-2222-2222-222222222222'
const bookingId = '55555555-5555-5555-5555-555555555555'
const expenseId = '33333333-3333-3333-3333-333333333333'
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
    storage: {
      from() {
        throw new Error('client must not use Storage')
      },
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
  id: bookingId,
  trip_id: tripId,
  type: 'flight',
  title: 'KUL → VIE',
  provider: 'Malaysia Airlines',
  confirmation_number: 'MH0042',
  start_date: '2026-12-12',
  start_time: '01:05',
  end_date: '2026-12-12',
  end_time: '07:40',
  location: 'KUL',
  cost: '1800.00',
  currency: 'MYR',
  notes: 'Window seat',
  status: 'confirmed',
  expense_id: null,
  created_by: you,
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
}

const createInput = {
  tripId,
  type: 'flight',
  title: 'KUL → VIE',
  provider: 'Malaysia Airlines',
  confirmationNumber: 'MH0042',
  startDate: '2026-12-12',
  startTime: '01:05',
  endDate: '2026-12-12',
  endTime: '07:40',
  location: 'KUL',
  cost: 1800,
  currency: 'MYR',
  notes: 'Window seat',
  status: 'confirmed',
  created_by: alex,
  createdBy: alex,
  owner_id: alex,
  expense_id: expenseId,
  id: 'should-not-send',
}

test('booking read returns an error when supabase is not configured', async () => {
  const result = await getCloudTripBookings({ client: null, session, tripId })
  assert.deepEqual(result.bookings, [])
  assert.match(result.error, /not connected/)
})

test('booking read requires an authenticated session', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudTripBookings({ client, session: null, tripId })
  assert.deepEqual(result.bookings, [])
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('booking read maps one trip and does not filter by user id', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudTripBookings({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.bookings[0], mapCloudBooking(row))
  assert.equal(result.bookings[0].title, 'KUL → VIE')
  assert.equal(result.bookings[0].type, 'flight')
  assert.equal(result.bookings[0].confirmationNumber, 'MH0042')
  assert.equal(result.bookings[0].createdBy, you)
  assert.equal(result.bookings[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'bookings'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_BOOKING_COLUMNS])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.equal(
    client.calls.some((call) => call[0] === 'eq' && call[1] === 'created_by'),
    false,
  )
})

test('empty booking result stays empty', async () => {
  const client = mockReadClient({ data: [] })
  const result = await getCloudTripBookings({ client, session, tripId })
  assert.deepEqual(result, { bookings: [], error: null })
})

test('booking read maps RLS and network errors without leaking codes', async () => {
  const rls = await getCloudTripBookings({
    client: mockReadClient({ error: { message: 'new row violates row-level security policy', code: '42501' } }),
    session,
    tripId,
  })
  assert.deepEqual(rls.bookings, [])
  assert.match(rls.error, /not available/)
  assert.equal(rls.error.includes('42501'), false)
  assert.equal(rls.error.includes('violates'), false)

  const network = await getCloudTripBookings({
    client: mockReadClient({ error: { message: 'Failed to fetch' } }),
    session,
    tripId,
  })
  assert.match(network.error, /could not reach/i)
})

test('create booking requires authentication', async () => {
  const client = mockWriteClient()
  const result = await createCloudBooking({ client, session: null, tripId, input: createInput })
  assert.equal(result.booking, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('create booking inserts an explicit payload and maps the returned row', async () => {
  const client = mockWriteClient({ insert: { data: row, error: null } })
  const result = await createCloudBooking({ client, session, tripId, input: createInput })
  assert.equal(result.error, null)
  assert.equal(result.booking.id, bookingId)
  assert.equal(result.booking.source, 'cloud')
  const payload = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(payload.trip_id, tripId)
  assert.equal(payload.title, 'KUL → VIE')
  assert.equal(payload.type, 'flight')
  assert.equal(payload.confirmation_number, 'MH0042')
  assert.equal(payload.status, 'confirmed')
  assert.deepEqual(client.calls[0], ['from', 'bookings'])
})

test('create payload only sends allowed booking columns', () => {
  const payload = cloudBookingInsertPayload(createInput, { tripId })
  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      'confirmation_number',
      'cost',
      'currency',
      'end_date',
      'end_time',
      'location',
      'notes',
      'provider',
      'start_date',
      'start_time',
      'status',
      'title',
      'trip_id',
      'type',
    ].sort(),
  )
  for (const key of CLOUD_BOOKING_FORBIDDEN_WRITE_COLUMNS) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false, key)
  }
})

test('created_by is not client supplied on insert', async () => {
  const payload = cloudBookingInsertPayload(
    { ...createInput, created_by: alex, createdBy: alex, owner_id: alex },
    { tripId },
  )
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'createdBy'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'owner_id'), false)

  const client = mockWriteClient({ insert: { data: row, error: null } })
  await createCloudBooking({
    client,
    session,
    tripId,
    input: { ...createInput, created_by: alex, createdBy: alex },
  })
  const inserted = client.calls.find((call) => call[0] === 'insert')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(inserted, 'created_by'), false)
  assert.equal(inserted.created_by, undefined)
})

test('create booking maps database errors without leaking postgres text', async () => {
  const client = mockWriteClient({
    insert: {
      data: null,
      error: { message: 'duplicate key value violates unique constraint "bookings_pkey"', code: '23505' },
    },
  })
  const result = await createCloudBooking({ client, session, tripId, input: createInput })
  assert.equal(result.booking, null)
  assert.match(result.error, /could not be saved/)
  assert.equal(result.error.includes('bookings_pkey'), false)
  assert.equal(result.error.includes('23505'), false)
})

test('update booking returns the updated cloud booking', async () => {
  const updatedRow = { ...row, title: 'KUL → VIE overnight', status: 'pending' }
  const client = mockWriteClient({ update: { data: updatedRow, error: null } })
  const result = await updateCloudBooking({
    client,
    session,
    id: bookingId,
    changes: { title: 'KUL → VIE overnight', status: 'pending' },
  })
  assert.equal(result.error, null)
  assert.equal(result.booking.title, 'KUL → VIE overnight')
  assert.equal(result.booking.status, 'pending')
  assert.equal(result.booking.source, 'cloud')
  const payload = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(payload.title, 'KUL → VIE overnight')
  assert.deepEqual(client.calls.find((call) => call[0] === 'eq'), ['eq', 'id', bookingId])
})

test('update cannot change trip_id', async () => {
  const payload = cloudBookingUpdatePayload({
    trip_id: otherTripId,
    tripId: otherTripId,
    title: 'Moved',
  })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'trip_id'), false)
  assert.equal(payload.title, 'Moved')

  const client = mockWriteClient({ update: { data: { ...row, title: 'Moved' }, error: null } })
  await updateCloudBooking({
    client,
    session,
    id: bookingId,
    changes: { trip_id: otherTripId, tripId: otherTripId, title: 'Moved' },
  })
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'trip_id'), false)
})

test('update cannot change created_by', async () => {
  const payload = cloudBookingUpdatePayload({ created_by: alex, createdBy: alex, owner_id: alex, notes: 'x' })
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'owner_id'), false)
  assert.equal(payload.notes, 'x')

  const client = mockWriteClient({ update: { data: { ...row, notes: 'x' }, error: null } })
  await updateCloudBooking({
    client,
    session,
    id: bookingId,
    changes: { created_by: alex, createdBy: alex, notes: 'x' },
  })
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.equal(Object.prototype.hasOwnProperty.call(updated, 'created_by'), false)
})

test('update maps RLS errors without leaking codes', async () => {
  const client = mockWriteClient({
    update: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
  })
  const result = await updateCloudBooking({ client, session, id: bookingId, changes: { title: 'Hidden' } })
  assert.equal(result.booking, null)
  assert.match(result.error, /could not be saved/)
  assert.equal(result.error.includes('42501'), false)
})

test('delete booking succeeds for a cloud uuid', async () => {
  const client = mockWriteClient({ remove: { data: { id: bookingId }, error: null } })
  const result = await deleteCloudBooking({ client, session, id: bookingId })
  assert.deepEqual(result, { ok: true, error: null })
  assert.deepEqual(client.calls[0], ['from', 'bookings'])
  assert.equal(client.calls.some((call) => call[0] === 'from' && call[1] === 'itinerary_items'), false)
  assert.equal(client.calls.some((call) => call[0] === 'from' && call[1] === 'expenses'), false)
  assert.deepEqual(client.calls.find((call) => call[0] === 'eq'), ['eq', 'id', bookingId])
})

test('delete maps RLS errors without leaking codes', async () => {
  const client = mockWriteClient({
    remove: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
  })
  const result = await deleteCloudBooking({ client, session, id: bookingId })
  assert.equal(result.ok, false)
  assert.match(result.error, /could not be deleted/)
  assert.equal(result.error.includes('42501'), false)
})

test('allowed booking types are preserved', () => {
  assert.deepEqual(CLOUD_BOOKING_TYPES, ['flight', 'hotel', 'train', 'bus', 'ticket', 'restaurant', 'other'])
  assert.deepEqual(BOOKING_TYPES, CLOUD_BOOKING_TYPES)
  for (const type of CLOUD_BOOKING_TYPES) {
    const payload = cloudBookingInsertPayload({ tripId, title: 'Stay', type }, { tripId })
    assert.equal(payload.type, type)
    assert.equal(mapCloudBooking({ ...row, type }).type, type)
  }
})

test('allowed booking statuses are preserved', () => {
  assert.deepEqual(CLOUD_BOOKING_STATUSES, ['confirmed', 'pending', 'cancelled'])
  assert.deepEqual(BOOKING_STATUSES, CLOUD_BOOKING_STATUSES)
  for (const status of CLOUD_BOOKING_STATUSES) {
    const payload = cloudBookingInsertPayload({ tripId, title: 'Stay', status }, { tripId })
    assert.equal(payload.status, status)
    assert.equal(mapCloudBooking({ ...row, status }).status, status)
  }
})

test('booking UUID is preserved for future itinerary reference', () => {
  const booking = mapCloudBooking(row)
  assert.equal(isCloudBookingId(booking.id), true)
  assert.equal(booking.id, bookingId)
  assert.equal(booking.source, 'cloud')
})

test('cloud expense booking_id accepts a cloud booking UUID', () => {
  const payload = cloudExpenseRpcPayload({
    tripId,
    amount: 1800,
    currency: 'MYR',
    category: 'flights',
    date: '2026-12-12',
    description: 'KUL → VIE',
    payerId: you,
    shares: [{ userId: you, amount: 1800 }],
    bookingId,
  })
  assert.equal(payload.p_booking_id, bookingId)
  assert.equal(isCloudBookingId(payload.p_booking_id), true)
})

test('cloud expense stores booking_id without copying the booking object', () => {
  const payload = cloudExpenseRpcPayload({
    tripId,
    amount: 1800,
    currency: 'MYR',
    category: 'flights',
    date: '2026-12-12',
    description: 'KUL → VIE',
    payerId: you,
    shares: [{ userId: you, amount: 1800 }],
    bookingId,
    booking: mapCloudBooking(row),
  })
  assert.equal(payload.p_booking_id, bookingId)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'booking'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'p_booking'), false)
  assert.equal(typeof payload.p_booking_id, 'string')
})

test('cloud create does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ insert: { data: row, error: null } })
  await createCloudBooking({ client, session, tripId, input: createInput })
  assert.equal(writes.length, 0)
})

test('cloud delete does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ remove: { data: { id: bookingId }, error: null } })
  await deleteCloudBooking({ client, session, id: bookingId })
  assert.equal(writes.length, 0)
})

test('cloud booking code stays off the local store, Storage, and service role', () => {
  const files = [
    'src/lib/trips/bookings.js',
    'src/hooks/useCloudTripBookings.js',
    'src/components/trips/CloudBookingsSheet.jsx',
    'src/components/trips/CloudBookingForm.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('addBooking('), false, file)
    assert.equal(src.includes('updateBooking('), false, file)
    assert.equal(src.includes('deleteBooking('), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
    assert.equal(src.includes('service_role'), false, file)
    assert.equal(src.includes('.upload('), false, file)
    assert.equal(src.includes('storage.from'), false, file)
    assert.equal(src.includes('createBucket'), false, file)
  }

  const layer = readFileSync(join(root, 'src/lib/trips/bookings.js'), 'utf8')
  assert.match(layer, /from\('bookings'\)/)
  assert.equal(layer.includes('itinerary_items'), false)
  assert.equal(layer.includes('booking_documents'), false)
  assert.match(readFileSync(join(root, 'src/hooks/useCloudTripBookings.js'), 'utf8'), /getCloudTripMembers/)
})
