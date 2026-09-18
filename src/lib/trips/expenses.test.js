import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getBalances, getSettlements } from '../expenses.js'
import {
  CLOUD_EXPENSE_COLUMNS,
  cloudExpenseRpcPayload,
  createCloudExpense,
  deleteCloudExpense,
  formatCloudExpenseError,
  getCloudExpenseSettlement,
  getCloudTripExpenses,
  mapCloudExpense,
  peopleForCloudExpenses,
  updateCloudExpense,
} from './expenses.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const expenseId = '33333333-3333-3333-3333-333333333333'
const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'
const jason = '00000000-0000-0000-0000-000000000003'

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
            insert() {
              throw new Error('client must not insert expenses')
            },
            update() {
              throw new Error('client must not update expenses')
            },
            delete() {
              throw new Error('client must not delete expenses')
            },
          }
        },
        insert() {
          throw new Error('client must not insert expenses')
        },
      }
    },
  }
}

function mockRpcClient({ rpc } = {}) {
  const calls = []
  return {
    calls,
    from() {
      throw new Error('client must not write expense tables directly')
    },
    rpc(name, params) {
      calls.push(['rpc', name, params])
      return Promise.resolve(rpc ?? { data: null, error: null })
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
  id: expenseId,
  trip_id: tripId,
  amount: '150.00',
  currency: 'MYR',
  converted_amount: '150.00',
  converted_currency: 'MYR',
  category: 'food',
  date: '2026-09-16',
  description: 'Dinner',
  paid_by: alex,
  booking_id: null,
  place_id: null,
  created_by: you,
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
  expense_shares: [
    { user_id: you, amount: '60.00' },
    { user_id: alex, amount: '40.00' },
    { user_id: jason, amount: '50.00' },
  ],
}

const createInput = {
  tripId,
  amount: 150,
  currency: 'MYR',
  category: 'food',
  date: '2026-09-16',
  description: 'Dinner',
  payerId: alex,
  shares: [
    { userId: you, amount: 60 },
    { userId: alex, amount: 40 },
    { userId: jason, amount: 50 },
  ],
}

test('expense read returns an error when supabase is not configured', async () => {
  const result = await getCloudTripExpenses({ client: null, session, tripId })
  assert.deepEqual(result.expenses, [])
  assert.match(result.error, /not connected/)
})

test('expense read requires an authenticated session', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudTripExpenses({ client, session: null, tripId })
  assert.deepEqual(result.expenses, [])
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('expense read maps headers and shares for one trip', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudTripExpenses({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.expenses[0], mapCloudExpense(row))
  assert.equal(result.expenses[0].amount, 150)
  assert.equal(result.expenses[0].currency, 'MYR')
  assert.equal(result.expenses[0].convertedAmount, 150)
  assert.equal(result.expenses[0].payerId, alex)
  assert.equal(result.expenses[0].createdBy, you)
  assert.equal(result.expenses[0].source, 'cloud')
  assert.deepEqual(result.expenses[0].shares, [
    { userId: you, amount: 60 },
    { userId: alex, amount: 40 },
    { userId: jason, amount: 50 },
  ])
  assert.deepEqual(client.calls[0], ['from', 'expenses'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_EXPENSE_COLUMNS])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.equal(
    client.calls.some((call) => call[0] === 'eq' && call[1] === 'paid_by'),
    false,
  )
})

test('empty expense result stays empty', async () => {
  const client = mockReadClient({ data: [] })
  const result = await getCloudTripExpenses({ client, session, tripId })
  assert.deepEqual(result, { expenses: [], error: null })
})

test('expense read maps RLS errors without leaking codes', async () => {
  const result = await getCloudTripExpenses({
    client: mockReadClient({ error: { message: 'new row violates row-level security policy', code: '42501' } }),
    session,
    tripId,
  })
  assert.deepEqual(result.expenses, [])
  assert.match(result.error, /not available/)
  assert.equal(result.error.includes('42501'), false)
})

test('create expense requires authentication', async () => {
  const client = mockRpcClient({ rpc: { data: expenseId, error: null } })
  const result = await createCloudExpense({ client, session: null, input: createInput })
  assert.equal(result.expense, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('create expense calls save_expense with payer and shares', async () => {
  const client = mockRpcClient({ rpc: { data: expenseId, error: null } })
  const result = await createCloudExpense({
    client,
    session,
    tripCurrency: 'MYR',
    actorIds: [you, alex, jason],
    input: createInput,
  })
  assert.equal(result.error, null)
  assert.equal(result.expense.id, expenseId)
  assert.equal(result.expense.payerId, alex)
  assert.deepEqual(result.expense.shares, [
    { userId: you, amount: 60 },
    { userId: alex, amount: 40 },
    { userId: jason, amount: 50 },
  ])
  const rpc = client.calls[0]
  assert.equal(rpc[0], 'rpc')
  assert.equal(rpc[1], 'save_expense')
  assert.equal(rpc[2].p_trip_id, tripId)
  assert.equal(rpc[2].p_paid_by, alex)
  assert.equal(rpc[2].p_amount, 150)
  assert.deepEqual(rpc[2].p_shares, [
    { user_id: you, amount: 60 },
    { user_id: alex, amount: 40 },
    { user_id: jason, amount: 50 },
  ])
  assert.equal(Object.hasOwn(rpc[2], 'p_created_by'), false)
  assert.equal(Object.hasOwn(rpc[2], 'created_by'), false)
  assert.equal(Object.hasOwn(rpc[2], 'p_id'), false)
})

test('save payload never includes created_by', () => {
  const payload = cloudExpenseRpcPayload({ ...createInput, created_by: you, createdBy: you })
  assert.equal(Object.hasOwn(payload, 'created_by'), false)
  assert.equal(Object.hasOwn(payload, 'p_created_by'), false)
  assert.equal(payload.p_paid_by, alex)
})

test('create expense never inserts into expense tables', async () => {
  const client = mockRpcClient({ rpc: { data: expenseId, error: null } })
  await createCloudExpense({ client, session, tripCurrency: 'MYR', actorIds: [you, alex, jason], input: createInput })
  assert.equal(
    client.calls.some((call) => call[0] === 'from'),
    false,
  )
})

test('create expense maps RPC errors', async () => {
  const client = mockRpcClient({
    rpc: { data: null, error: { message: 'Expense shares must sum to the expense amount' } },
  })
  const result = await createCloudExpense({
    client,
    session,
    tripCurrency: 'MYR',
    actorIds: [you, alex, jason],
    input: createInput,
  })
  assert.equal(result.expense, null)
  assert.equal(result.error, 'Shares must add up to the total.')
})

test('foreign key errors stay short and do not leak constraint names', () => {
  const placeError = formatCloudExpenseError(
    {
      code: '23503',
      message: 'insert or update on table "expenses" violates foreign key constraint "expenses_place_trip_fkey"',
    },
    'create',
  )
  assert.equal(placeError, "That place doesn't belong to this trip.")
  assert.equal(placeError.includes('place_trip_fkey'), false)

  const bookingError = formatCloudExpenseError(
    {
      code: '23503',
      message: 'insert or update on table "expenses" violates foreign key constraint "expenses_booking_trip_fkey"',
    },
    'update',
  )
  assert.equal(bookingError, "That booking doesn't belong to this trip.")
  assert.equal(bookingError.includes('booking_trip_fkey'), false)
})

test('update expense uses save_expense with the expense id', async () => {
  const client = mockRpcClient({ rpc: { data: expenseId, error: null } })
  const result = await updateCloudExpense({
    client,
    session,
    id: expenseId,
    tripCurrency: 'MYR',
    actorIds: [you, alex, jason],
    input: { ...createInput, amount: 150, description: 'Dinner out' },
  })
  assert.equal(result.error, null)
  assert.equal(client.calls[0][1], 'save_expense')
  assert.equal(client.calls[0][2].p_id, expenseId)
  assert.equal(client.calls[0][2].p_description, 'Dinner out')
  assert.equal(
    client.calls.some((call) => call[0] === 'from'),
    false,
  )
})

test('delete expense uses delete_expense RPC', async () => {
  const client = mockRpcClient({ rpc: { data: null, error: null } })
  const result = await deleteCloudExpense({ client, session, id: expenseId })
  assert.equal(result.ok, true)
  assert.deepEqual(client.calls[0], ['rpc', 'delete_expense', { p_id: expenseId }])
  assert.equal(
    client.calls.some((call) => call[0] === 'from'),
    false,
  )
})

test('participants must be cloud members, not local seed ids', async () => {
  const client = mockRpcClient({ rpc: { data: expenseId, error: null } })
  const result = await createCloudExpense({
    client,
    session,
    tripCurrency: 'MYR',
    actorIds: [you, alex, jason],
    input: {
      ...createInput,
      payerId: 'user-jamie',
      shares: [{ userId: 'user-alex', amount: 150 }],
    },
  })
  assert.equal(result.expense, null)
  assert.match(result.error, /paid|cloud trip/i)
  assert.equal(client.calls.length, 0)

  const outsider = await createCloudExpense({
    client,
    session,
    tripCurrency: 'MYR',
    actorIds: [you, alex, jason],
    input: {
      ...createInput,
      payerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    },
  })
  assert.equal(outsider.expense, null)
  assert.match(outsider.error, /on this cloud trip/)
  assert.equal(client.calls.length, 0)
})

test('cloud create does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockRpcClient({ rpc: { data: expenseId, error: null } })
  await createCloudExpense({ client, session, tripCurrency: 'MYR', actorIds: [you, alex, jason], input: createInput })
  assert.equal(writes.length, 0)
})

test('cloud delete does not write to local storage', async () => {
  const { writes } = installStorage()
  const client = mockRpcClient({ rpc: { data: null, error: null } })
  await deleteCloudExpense({ client, session, id: expenseId })
  assert.equal(writes.length, 0)
})

test('settlement is derived from cloud expenses and not persisted', () => {
  const expenses = [mapCloudExpense(row)]
  const derived = getCloudExpenseSettlement(expenses, [you, alex, jason])
  const expected = getSettlements(getBalances(expenses, [you, alex, jason]))
  assert.deepEqual(derived.transfers, expected)
  assert.equal(derived.balances[you].net, -60)
  assert.equal(derived.balances[alex].net, 110)
  assert.equal(derived.balances[jason].net, -50)
  assert.deepEqual(derived.transfers, [
    { fromId: you, toId: alex, amount: 60 },
    { fromId: jason, toId: alex, amount: 50 },
  ])
})

test('historical actors stay visible after a member leaves', () => {
  const members = [{ userId: you, name: 'Jamie', shortName: 'Jamie', email: 'jamie@travelos.app', initials: 'JL' }]
  const people = peopleForCloudExpenses(members, [mapCloudExpense(row)])
  assert.equal(people.some((person) => person.userId === alex && person.former), true)
  assert.equal(people.some((person) => person.userId === jason && person.former), true)
})

test('cloud expense code stays off the local store and RPC-only for writes', () => {
  const files = [
    'src/lib/trips/expenses.js',
    'src/hooks/useCloudTripExpenses.js',
    'src/components/trips/CloudExpenseSheet.jsx',
    'src/components/trips/CloudExpenseForm.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('addExpense('), false, file)
    assert.equal(src.includes('updateExpense('), false, file)
    assert.equal(src.includes('deleteExpense('), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('peopleForTrip('), false, file)
    assert.equal(src.includes('useAppData'), false, file)
  }

  const layer = readFileSync(join(root, 'src/lib/trips/expenses.js'), 'utf8')
  assert.match(layer, /rpc\('save_expense'/)
  assert.match(layer, /rpc\('delete_expense'/)
  assert.equal(layer.includes('.insert('), false)
  assert.equal(layer.includes('.update('), false)
  assert.equal(layer.includes('.delete('), false)
  assert.match(readFileSync(join(root, 'src/hooks/useCloudTripExpenses.js'), 'utf8'), /getCloudTripMembers/)
})
