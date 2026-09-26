import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUD_TRIP_COLUMNS,
  CLOUD_TRIP_FORBIDDEN_WRITE_COLUMNS,
  cloudTripInsertPayload,
  cloudTripUpdatePayload,
  cloudTripWriteDiagnostic,
  cloudTripsForSignedOut,
  createCloudTrip,
  deleteCloudTrip,
  formatCloudTripError,
  getCloudTrips,
  isCloudTripId,
  mapCloudTrip,
  updateCloudTrip,
} from './cloud.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function mockClient({ data = [], error = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            order(column, options) {
              calls.push(['order', column, options])
              return Promise.resolve({ data, error })
            },
            eq(column, value) {
              calls.push(['eq', column, value])
              throw new Error('client must not filter trips by a user-controlled id')
            },
          }
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
                    single() {
                      calls.push(['single'])
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
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
  return { map, writes }
}

const row = {
  id: '11111111-1111-1111-1111-111111111111',
  owner_id: '00000000-0000-0000-0000-000000000001',
  city: 'Lisbon',
  country: 'Portugal',
  destination: 'Lisbon, Portugal',
  start_date: '2027-04-02',
  end_date: '2027-04-08',
  budget_amount: '3200.00',
  currency: 'MYR',
  visibility: 'private',
  notes: 'Keep the first morning free.',
  timezone: 'Europe/Lisbon',
  invite_code: 'lisbon-a1',
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
}

const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }

const createInput = {
  destination: 'Lisbon, Portugal',
  startDate: '2027-04-02',
  endDate: '2027-04-08',
  budgetAmount: 3200,
  currency: 'MYR',
  visibility: 'private',
  notes: 'Keep the first morning free.',
  timezone: 'Europe/Lisbon',
  owner_id: 'should-not-be-sent',
  created_by: 'should-not-be-sent',
  id: 'should-not-be-sent',
}

test('returns an empty list when supabase is not configured', async () => {
  const result = await getCloudTrips({ client: null, session })
  assert.deepEqual(result, { trips: [], error: null })
})

test('returns an empty list when there is no authenticated user', async () => {
  const client = mockClient({ data: [row] })
  const result = await getCloudTrips({ client, session: null })
  assert.deepEqual(result, { trips: [], error: null })
  assert.equal(client.calls.length, 0)
})

test('queries trips and maps rows without an owner_id filter', async () => {
  const client = mockClient({ data: [row] })
  const result = await getCloudTrips({ client, session })
  assert.equal(result.error, null)
  assert.equal(result.trips.length, 1)
  assert.deepEqual(result.trips[0], mapCloudTrip(row))
  assert.equal(result.trips[0].startDate, '2027-04-02')
  assert.equal(result.trips[0].budgetAmount, 3200)
  assert.equal(result.trips[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'trips'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_TRIP_COLUMNS])
  assert.equal(client.calls.some((call) => call[0] === 'eq'), false)
})

test('empty cloud result is not replaced with local data', async () => {
  const client = mockClient({ data: [] })
  const result = await getCloudTrips({ client, session })
  assert.deepEqual(result, { trips: [], error: null })
})

test('supabase and RLS errors stay user-facing and keep trips empty', async () => {
  const rls = await getCloudTrips({
    client: mockClient({ error: { message: 'new row violates row-level security policy', code: '42501' } }),
    session,
  })
  assert.equal(rls.trips.length, 0)
  assert.match(rls.error, /not available/)
  assert.equal(rls.error.includes('42501'), false)

  const network = await getCloudTrips({
    client: mockClient({ error: { message: 'Failed to fetch' } }),
    session,
  })
  assert.equal(network.trips.length, 0)
  assert.match(network.error, /could not reach the cloud/i)
})

test('sign-out clears cloud trip state', () => {
  const cleared = cloudTripsForSignedOut()
  assert.deepEqual(cleared, { trips: [], error: null })
})

test('formatCloudTripError hides schema details', () => {
  assert.equal(
    formatCloudTripError({ message: 'column trips.secret does not exist' }),
    'Cloud trips could not be loaded just now.',
  )
})

test('create returns an error when supabase is not configured', async () => {
  const result = await createCloudTrip({ client: null, session, input: createInput })
  assert.equal(result.trip, null)
  assert.match(result.error, /not connected/)
})

test('create returns an error when there is no authenticated user', async () => {
  const client = mockWriteClient({ insert: { data: row, error: null } })
  const result = await createCloudTrip({ client, session: null, input: createInput })
  assert.equal(result.trip, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('create inserts allowed fields and maps the returned row', async () => {
  const client = mockWriteClient({ insert: { data: row, error: null } })
  const result = await createCloudTrip({ client, session, input: createInput })
  assert.equal(result.error, null)
  assert.deepEqual(result.trip, mapCloudTrip(row))
  const payload = client.calls.find((call) => call[0] === 'insert')[1]
  assert.deepEqual(payload, {
    city: 'Lisbon',
    country: 'Portugal',
    destination: 'Lisbon, Portugal',
    start_date: '2027-04-02',
    end_date: '2027-04-08',
    budget_amount: 3200,
    currency: 'MYR',
    visibility: 'private',
    notes: 'Keep the first morning free.',
    timezone: 'Europe/Lisbon',
  })
  assert.deepEqual(client.calls[0], ['from', 'trips'])
})

test('create payload never includes owner_id', () => {
  const payload = cloudTripInsertPayload(createInput)
  assert.equal(Object.hasOwn(payload, 'owner_id'), false)
  assert.equal(CLOUD_TRIP_FORBIDDEN_WRITE_COLUMNS.includes('owner_id'), true)
})

test('create payload never includes created_by', () => {
  const payload = cloudTripInsertPayload(createInput)
  assert.equal(Object.hasOwn(payload, 'created_by'), false)
  assert.equal(CLOUD_TRIP_FORBIDDEN_WRITE_COLUMNS.includes('created_by'), true)
})

test('create maps database errors to a short user-facing message', async () => {
  const client = mockWriteClient({
    insert: { data: null, error: { message: 'server closed the connection unexpectedly', code: 'XX000' } },
  })
  const result = await createCloudTrip({ client, session, input: createInput })
  assert.equal(result.trip, null)
  assert.equal(result.error, 'That cloud trip could not be created.')
  assert.equal(result.error.includes('XX000'), false)
  assert.equal(result.error.includes('connection unexpectedly'), false)
})

test('create diagnostic exposes supabase error fields without changing the UI message', async () => {
  const supabaseError = {
    message: 'insert or update on table "trips" violates foreign key constraint "trips_owner_id_fkey"',
    code: '23503',
    details: 'Key (owner_id)=(00000000-0000-0000-0000-000000000001) is not present in table "profiles".',
    hint: null,
  }
  const client = mockWriteClient({
    insert: { data: null, error: supabaseError },
  })
  const result = await createCloudTrip({ client, session, input: createInput })
  assert.equal(result.error, 'That cloud trip could not be created.')
  assert.deepEqual(result.diagnostic, cloudTripWriteDiagnostic(supabaseError, 'create'))
  assert.equal(result.diagnostic.table, 'trips')
  assert.equal(result.diagnostic.operation, 'insert')
  assert.equal(result.diagnostic.error.code, '23503')
  assert.equal(result.diagnostic.error.hint, null)
})

test('update returns an error when supabase is not configured', async () => {
  const result = await updateCloudTrip({ client: null, session, id: row.id, changes: { notes: 'Hi' } })
  assert.equal(result.trip, null)
  assert.match(result.error, /not connected/)
})

test('update returns an error when there is no authenticated user', async () => {
  const client = mockWriteClient({ update: { data: row, error: null } })
  const result = await updateCloudTrip({
    client,
    session: null,
    id: row.id,
    changes: { notes: 'Hi' },
  })
  assert.equal(result.trip, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('update writes allowed fields by trip uuid', async () => {
  const updated = { ...row, notes: 'Leave the first morning free.', city: 'Cascais' }
  const client = mockWriteClient({ update: { data: updated, error: null } })
  const result = await updateCloudTrip({
    client,
    session,
    id: row.id,
    changes: {
      notes: 'Leave the first morning free.',
      city: 'Cascais',
      owner_id: 'should-not-be-sent',
      created_by: 'should-not-be-sent',
    },
  })
  assert.equal(result.error, null)
  assert.equal(result.trip.notes, 'Leave the first morning free.')
  assert.equal(result.trip.city, 'Cascais')
  const payload = client.calls.find((call) => call[0] === 'update')[1]
  assert.deepEqual(payload, { city: 'Cascais', notes: 'Leave the first morning free.' })
  assert.deepEqual(
    client.calls.find((call) => call[0] === 'eq'),
    ['eq', 'id', row.id],
  )
  assert.equal(
    client.calls.some((call) => call[0] === 'eq' && call[1] === 'owner_id'),
    false,
  )
})

test('update payload cannot include owner_id', () => {
  const payload = cloudTripUpdatePayload({
    owner_id: '00000000-0000-0000-0000-000000000099',
    created_by: '00000000-0000-0000-0000-000000000099',
    notes: 'ok',
  })
  assert.equal(Object.hasOwn(payload, 'owner_id'), false)
  assert.equal(Object.hasOwn(payload, 'created_by'), false)
  assert.deepEqual(payload, { notes: 'ok' })
})

test('update maps RLS denial to a short user-facing message', async () => {
  const rls = await updateCloudTrip({
    client: mockWriteClient({
      update: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
    }),
    session,
    id: row.id,
    changes: { notes: 'nope' },
  })
  assert.equal(rls.trip, null)
  assert.equal(rls.error, 'This cloud trip cannot be changed.')
  assert.equal(rls.error.includes('42501'), false)

  const empty = await updateCloudTrip({
    client: mockWriteClient({ update: { data: null, error: null } }),
    session,
    id: row.id,
    changes: { notes: 'nope' },
  })
  assert.equal(empty.trip, null)
  assert.equal(empty.error, 'This cloud trip cannot be changed.')
})

test('delete returns an error when supabase is not configured', async () => {
  const result = await deleteCloudTrip({ client: null, session, id: row.id })
  assert.equal(result.ok, false)
  assert.match(result.error, /not connected/)
})

test('delete returns an error when there is no authenticated user', async () => {
  const client = mockWriteClient()
  const result = await deleteCloudTrip({ client, session: null, id: row.id })
  assert.equal(result.ok, false)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('delete removes the cloud trip by uuid without cascading in the client', async () => {
  const client = mockWriteClient({ remove: { data: { id: row.id }, error: null } })
  const result = await deleteCloudTrip({ client, session, id: row.id })
  assert.equal(result.ok, true)
  assert.equal(result.error, null)
  assert.deepEqual(client.calls[0], ['from', 'trips'])
  assert.deepEqual(client.calls[1], ['delete'])
  assert.deepEqual(client.calls[2], ['eq', 'id', row.id])
  assert.equal(
    client.calls.some((call) => call[0] === 'from' && call[1] !== 'trips'),
    false,
  )
})

test('delete maps RLS denial to a short user-facing message', async () => {
  const rls = await deleteCloudTrip({
    client: mockWriteClient({
      remove: { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } },
    }),
    session,
    id: row.id,
  })
  assert.equal(rls.ok, false)
  assert.equal(rls.error, 'This cloud trip cannot be deleted.')

  const missing = await deleteCloudTrip({
    client: mockWriteClient({ remove: { data: null, error: null } }),
    session,
    id: row.id,
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.error, 'This cloud trip cannot be deleted.')
})

test('cloud ids stay distinct from local trip ids', () => {
  assert.equal(isCloudTripId(row.id), true)
  assert.equal(isCloudTripId('trip-vienna'), false)
})

test('create does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient({ insert: { data: row, error: null } })
  await createCloudTrip({ client, session, input: createInput })
  assert.equal(writes.length, 0)
})

test('delete does not write to local storage or accept local trip ids', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient()
  const local = await deleteCloudTrip({ client, session, id: 'trip-vienna' })
  assert.equal(local.ok, false)
  assert.match(local.error, /could not be found/)
  assert.equal(client.calls.length, 0)

  await deleteCloudTrip({ client, session, id: row.id })
  assert.equal(writes.length, 0)
})

test('local Add Trip still uses the local store', () => {
  const src = readFileSync(join(root, 'src/components/layout/QuickAddButton.jsx'), 'utf8')
  assert.match(src, /addTrip\(/)
  assert.equal(src.includes('createCloudTrip'), false)
  assert.equal(src.includes('deleteCloudTrip'), false)
})

test('cloud creation and deletion stay off the local store', () => {
  const files = [
    'src/lib/trips/cloud.js',
    'src/hooks/useCloudTrips.js',
    'src/components/trips/CloudTripsSection.jsx',
    'src/components/trips/CloudTripCard.jsx',
    'src/components/trips/CloudTripForm.jsx',
    'src/components/trips/CloudTripComposer.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('addTrip('), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('STORAGE_KEY'), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
  }

  const hook = readFileSync(join(root, 'src/hooks/useCloudTrips.js'), 'utf8')
  assert.equal(hook.includes('useAppData'), false)
  assert.match(hook, /createCloudTrip/)
  assert.match(hook, /deleteCloudTrip/)
})
