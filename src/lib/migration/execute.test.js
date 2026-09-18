import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigration, assertCloudUuid } from './execute.js'
import { createTripMigration, emptyMappings } from './mappings.js'
import { isClientRowId } from '../trips/clientRowId.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ME = '11111111-1111-4111-8111-111111111111'
const CLOUD_TRIP = '22222222-2222-4222-8222-222222222222'
const OTHER_TRIP = '99999999-9999-4999-8999-999999999999'
const EXISTING_DAY = '55555555-5555-4555-8555-555555555555'

function uuid(n) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
}

function tokyo() {
  return {
    id: 'trip-tokyo',
    city: 'Tokyo',
    country: 'Japan',
    destination: 'Tokyo, Japan',
    startDate: '2027-03-18',
    endDate: '2027-03-28',
    budgetAmount: 8000,
    currency: 'MYR',
    visibility: 'private',
    notes: 'Cherry blossom week.',
    timezone: 'Asia/Tokyo',
    ownerId: 'user-jamie',
    members: [{ userId: 'user-jamie', role: 'owner' }],
  }
}

function users() {
  return [
    { id: 'user-jamie', name: 'Jamie Lim', shortName: 'Jamie', email: 'jamie@travelos.app' },
    { id: 'user-jason', name: 'Jason Tan', shortName: 'Jason', email: 'jason@example.com' },
    { id: 'user-alex', name: 'Alex Wong', shortName: 'Alex', email: 'alex@example.com' },
  ]
}

function createFake({ existingDays = [], failAt = null, extraTrips = [] } = {}) {
  const store = {
    trips: [...extraTrips],
    places: [],
    bookings: [],
    days: [...existingDays],
    items: [],
    expenses: [],
    polls: [],
    votes: [],
    invitations: [],
  }
  const calls = []
  let n = 20
  const nextId = () => uuid((n += 1))
  const apis = {
    async createCloudTrip({ id, input }) {
      calls.push(['createCloudTrip', { id, input }])
      if (failAt === 'trip') return { trip: null, error: 'Could not reach the cloud just now. Local trips are unchanged.' }
      const trip = {
        id,
        tripId: id,
        ownerId: ME,
        inviteCode: 'tokyo-cloud',
        city: input.city,
        destination: input.destination,
        notes: input.notes,
        source: 'cloud',
      }
      store.trips.push(trip)
      return { trip, error: null }
    },
    async getCloudTrips() {
      return { trips: store.trips, error: null }
    },
    async createCloudPlace({ id, tripId, input }) {
      calls.push(['createCloudPlace', { id, tripId, input }])
      if (failAt === 'place') return { place: null, error: 'Could not reach the cloud just now. Local trips are unchanged.' }
      const place = { id, tripId, name: input.name, source: 'cloud' }
      store.places.push(place)
      return { place, error: null }
    },
    async getCloudTripPlaces() {
      return { places: store.places, error: null }
    },
    async createCloudBooking({ id, tripId, input }) {
      calls.push(['createCloudBooking', { id, tripId, input }])
      assert.equal(Object.prototype.hasOwnProperty.call(input, 'expenseId'), false)
      assert.equal(Object.prototype.hasOwnProperty.call(input, 'expense_id'), false)
      const booking = { id, tripId, title: input.title, source: 'cloud' }
      store.bookings.push(booking)
      return { booking, error: null }
    },
    async getCloudTripBookings() {
      return { bookings: store.bookings, error: null }
    },
    async createCloudItineraryDay({ id, tripId, input }) {
      calls.push(['createCloudItineraryDay', { id, tripId, input }])
      const dup = store.days.find((day) => day.tripId === tripId && day.date === input.date)
      if (dup) return { day: null, error: 'That day is already on this itinerary.' }
      const day = { id, tripId, date: input.date, dayNumber: input.dayNumber, title: input.title }
      store.days.push(day)
      return { day, error: null }
    },
    async getCloudItineraryDays() {
      return { days: store.days, error: null }
    },
    async createCloudItineraryItem({ id, tripId, input }) {
      calls.push(['createCloudItineraryItem', { id, tripId, input }])
      assert.equal(isClientRowId(input.dayId), true)
      if (input.placeId) assert.equal(isClientRowId(input.placeId), true)
      if (input.bookingId) assert.equal(isClientRowId(input.bookingId), true)
      const item = { id, tripId, dayId: input.dayId, title: input.title, placeId: input.placeId ?? null, bookingId: input.bookingId ?? null }
      store.items.push(item)
      return { item, error: null }
    },
    async createCloudExpense({ id, tripId, input }) {
      calls.push(['createCloudExpense', { id, tripId, input }])
      assert.equal(isClientRowId(input.payerId), true)
      for (const share of input.shares) assert.equal(isClientRowId(share.userId), true)
      const expense = { id, tripId, description: input.description, payerId: input.payerId, shares: input.shares, amount: input.amount }
      store.expenses.push(expense)
      return { expense, error: null }
    },
    async getCloudTripExpenses() {
      return { expenses: store.expenses, error: null }
    },
    async createCloudPoll({ tripId, input }) {
      calls.push(['createCloudPoll', { tripId, input }])
      const poll = {
        id: nextId(),
        tripId,
        question: input.question,
        options: (input.options ?? []).map((option, index) => ({
          id: nextId(),
          label: typeof option === 'string' ? option : option.label,
          sortOrder: index,
        })),
      }
      store.polls.push(poll)
      return { poll, error: null }
    },
    async getCloudTripPolls() {
      return { polls: store.polls, error: null }
    },
    async voteCloudPoll(args) {
      calls.push(['voteCloudPoll', args])
      assert.equal(args.userId, undefined)
      assert.equal(args.input?.user_id, undefined)
      store.votes.push({ pollId: args.pollId, optionId: args.optionId })
      return { vote: { pollId: args.pollId, optionId: args.optionId, userId: ME }, error: null }
    },
    async createCloudInvitation(args) {
      calls.push(['createCloudInvitation', { email: args.email, role: args.role }])
      store.invitations.push({ email: args.email, role: args.role })
      return { invitation: { id: nextId(), email: args.email }, link: 'https://travelos.app/join/x/secret', error: null }
    },
    async updateCloudTrip() {
      calls.push(['updateCloudTrip'])
      throw new Error('Path B must not patch the Cloud Trip header')
    },
  }
  return { store, calls, apis }
}

function persistBox(initial) {
  const box = { state: initial, history: [] }
  return {
    box,
    persist: async (next) => {
      box.state = JSON.parse(JSON.stringify(next))
      box.history.push(JSON.parse(JSON.stringify(next)))
    },
  }
}

function ids() {
  let n = 0
  return () => uuid((n += 1))
}

function baseRun(fake, overrides = {}) {
  const localTrip = tokyo()
  return {
    localTrip,
    path: 'create',
    currentUser: { id: ME },
    session: { user: { id: ME } },
    cloudMembers: [{ userId: ME, role: 'owner' }],
    localUsers: users(),
    pendingOps: [],
    places: [
      { id: 'place-senso', name: 'Senso-ji', status: 'saved' },
      { id: 'place-senso-2', name: 'Senso-ji', status: 'saved' },
    ],
    bookings: [
      {
        id: 'booking-flight',
        title: 'NRT flight',
        type: 'flight',
        status: 'confirmed',
        documents: [{ id: 'doc-1', name: 'hold.pdf' }],
      },
    ],
    expenses: [
      {
        id: 'exp-ramen',
        description: 'Ramen',
        amount: 40,
        currency: 'JPY',
        category: 'food',
        date: '2027-03-19',
        payerId: 'user-jamie',
        shares: [{ userId: 'user-jamie', amount: 40 }],
        placeId: 'place-senso',
      },
    ],
    itinerary: {
      days: [
        {
          date: '2027-03-18',
          dayNumber: 1,
          title: 'Arrive',
          items: [
            { id: 'item-land', title: 'Land', category: 'arrival', place: 'Narita', placeId: 'place-senso', bookingId: 'booking-flight' },
          ],
        },
      ],
    },
    polls: [
      {
        id: 'poll-dinner',
        question: 'Dinner?',
        options: [
          { id: 'opt-ramen', label: 'Ramen', voterIds: ['user-jamie'] },
          { id: 'opt-sushi', label: 'Sushi', voterIds: ['user-alex'] },
        ],
      },
    ],
    activities: [{ id: 'act-1', type: 'place.add', actorId: 'user-jamie' }],
    identityMappings: { 'user-jamie': { type: 'self', cloudUserId: ME } },
    generateId: ids(),
    apis: fake.apis,
    ...overrides,
  }
}

test('Path A creates a Cloud trip from local fields and never sends owner_id', async () => {
  const fake = createFake()
  const { persist, box } = persistBox()
  const localTrip = tokyo()
  const result = await runMigration({ ...baseRun(fake, { localTrip, persist }) })
  assert.equal(result.state.status, 'completed')
  const created = fake.calls.find((call) => call[0] === 'createCloudTrip')
  assert.ok(created)
  assert.equal(created[1].input.city, 'Tokyo')
  assert.equal(created[1].input.timezone, 'Asia/Tokyo')
  assert.equal(created[1].input.ownerId, undefined)
  assert.equal(created[1].input.owner_id, undefined)
  assert.equal(created[1].input.created_by, undefined)
  assert.equal(isClientRowId(result.state.mappings.trip), true)
  assert.notEqual(result.state.mappings.trip, 'trip-tokyo')
  assert.equal(localTrip.id, 'trip-tokyo')
  assert.equal(box.state.localTripId, 'trip-tokyo')
})

test('Path B uses the explicitly selected Cloud trip and does not create or patch the header', async () => {
  const fake = createFake()
  const result = await runMigration({
    ...baseRun(fake),
    path: 'associate',
    targetCloudTrip: { id: CLOUD_TRIP, destination: 'Kyoto, Japan', inviteCode: 'kyoto', notes: 'Existing' },
    persist: async () => {},
  })
  assert.equal(result.state.status, 'completed')
  assert.equal(result.state.cloudTripId, CLOUD_TRIP)
  assert.equal(fake.calls.some((call) => call[0] === 'createCloudTrip'), false)
  assert.equal(fake.calls.some((call) => call[0] === 'updateCloudTrip'), false)
})

test('same-name places stay separate and mappings persist Cloud UUIDs', async () => {
  const fake = createFake()
  const result = await runMigration({ ...baseRun(fake), persist: async () => {} })
  const placeCalls = fake.calls.filter((call) => call[0] === 'createCloudPlace')
  assert.equal(placeCalls.length, 2)
  assert.equal(placeCalls[0][1].input.name, 'Senso-ji')
  assert.equal(placeCalls[1][1].input.name, 'Senso-ji')
  assert.notEqual(placeCalls[0][1].id, placeCalls[1][1].id)
  assert.equal(isClientRowId(result.state.mappings.places['place-senso']), true)
  assert.notEqual(result.state.mappings.places['place-senso'], 'place-senso')
})

test('bookings are additive and expense_id is never sent', async () => {
  const fake = createFake()
  const result = await runMigration({ ...baseRun(fake), persist: async () => {} })
  const booking = fake.calls.find((call) => call[0] === 'createCloudBooking')
  assert.ok(booking)
  assert.equal(isClientRowId(result.state.mappings.bookings['booking-flight']), true)
})

test('Path A creates itinerary days; Path B reuses the same date and ignores title', async () => {
  const createFakeRun = createFake()
  await runMigration({ ...baseRun(createFakeRun), persist: async () => {} })
  assert.ok(createFakeRun.calls.some((call) => call[0] === 'createCloudItineraryDay'))

  const existing = {
    id: EXISTING_DAY,
    tripId: CLOUD_TRIP,
    date: '2027-03-18',
    title: 'Different title',
  }
  const associateFake = createFake({ existingDays: [existing] })
  const result = await runMigration({
    ...baseRun(associateFake),
    path: 'associate',
    targetCloudTrip: { id: CLOUD_TRIP, destination: 'Tokyo, Japan', inviteCode: 'x' },
    persist: async () => {},
  })
  assert.equal(result.state.mappings.itineraryDays['2027-03-18'], EXISTING_DAY)
  assert.equal(
    associateFake.calls.some((call) => call[0] === 'createCloudItineraryDay'),
    false,
  )
})

test('itinerary items send mapped Cloud refs and omit missing optional refs', async () => {
  const fake = createFake()
  const args = baseRun(fake)
  args.itinerary.days[0].items.push({
    id: 'item-walk',
    title: 'Walk',
    category: 'free',
    place: 'Yanaka',
    placeId: 'place-missing',
    bookingId: 'booking-missing',
  })
  await runMigration({ ...args, persist: async () => {} })
  const items = fake.calls.filter((call) => call[0] === 'createCloudItineraryItem')
  const linked = items.find((call) => call[1].input.title === 'Land')
  const omitted = items.find((call) => call[1].input.title === 'Walk')
  assert.equal(isClientRowId(linked[1].input.placeId), true)
  assert.equal(isClientRowId(linked[1].input.bookingId), true)
  assert.equal(omitted[1].input.placeId, undefined)
  assert.equal(omitted[1].input.bookingId, undefined)
  assert.equal(omitted[1].input.placeLabel, 'Yanaka')
})

test('expenses use save_expense, preserve payer/shares, and block unmapped Jason', async () => {
  const fake = createFake()
  const args = baseRun(fake)
  args.localTrip = {
    ...tokyo(),
    id: 'trip-vienna',
    members: [
      { userId: 'user-jamie', role: 'owner' },
      { userId: 'user-jason', role: 'viewer' },
    ],
  }
  args.expenses = [
    {
      id: 'exp-ramen',
      description: 'Ramen',
      amount: 40,
      currency: 'JPY',
      category: 'food',
      date: '2027-03-19',
      payerId: 'user-jamie',
      shares: [{ userId: 'user-jamie', amount: 40 }],
    },
    {
      id: 'exp-dinner',
      description: 'Dinner',
      amount: 80,
      currency: 'EUR',
      category: 'food',
      date: '2026-12-13',
      payerId: 'user-jamie',
      shares: [
        { userId: 'user-jamie', amount: 40 },
        { userId: 'user-jason', amount: 40 },
      ],
    },
  ]
  const result = await runMigration({ ...args, persist: async () => {} })
  const expenseCalls = fake.calls.filter((call) => call[0] === 'createCloudExpense')
  assert.equal(expenseCalls.length, 1)
  assert.equal(expenseCalls[0][1].input.payerId, ME)
  assert.deepEqual(expenseCalls[0][1].input.shares, [{ userId: ME, amount: 40 }])
  assert.ok(result.state.blocked.some((item) => /Dinner/.test(item.reason) && /Jason/.test(item.reason)))
  assert.equal(result.state.mappings.expenses['exp-dinner'], undefined)
})

test('poll mapping is saved immediately and only the current user vote migrates', async () => {
  const fake = createFake()
  const { persist, box } = persistBox()
  const result = await runMigration({ ...baseRun(fake), persist })
  assert.equal(isClientRowId(result.state.mappings.polls['poll-dinner']), true)
  assert.notEqual(result.state.mappings.polls['poll-dinner'], 'poll-dinner')
  assert.equal(isClientRowId(result.state.mappings.pollOptions['opt-ramen']), true)
  assert.equal(fake.calls.filter((call) => call[0] === 'voteCloudPoll').length, 1)
  assert.ok(box.history.some((state) => state.mappings.polls['poll-dinner']))
  assert.ok(result.plan.skipped.some((item) => /Alex/.test(item.reason)))
})

test('repeat migration does not create a duplicate poll when mapping exists', async () => {
  const fake = createFake()
  const first = await runMigration({ ...baseRun(fake), persist: async () => {} })
  const pollCreates = fake.calls.filter((call) => call[0] === 'createCloudPoll').length
  const second = await runMigration({
    ...baseRun(fake),
    state: first.state,
    persist: async () => {},
  })
  assert.equal(fake.calls.filter((call) => call[0] === 'createCloudPoll').length, pollCreates)
  assert.equal(second.state.mappings.polls['poll-dinner'], first.state.mappings.polls['poll-dinner'])
})

test('resume reuses persisted mappings and does not duplicate completed places', async () => {
  let failPlaces = true
  const fake = createFake()
  const originalCreatePlace = fake.apis.createCloudPlace
  fake.apis.createCloudPlace = async (args) => {
    if (failPlaces) return { place: null, error: 'Could not reach the cloud just now. Local trips are unchanged.' }
    return originalCreatePlace(args)
  }
  const { persist, box } = persistBox()
  const first = await runMigration({ ...baseRun(fake), persist })
  assert.equal(first.kind, 'retryable')
  assert.equal(isClientRowId(box.state.mappings.trip), true)
  const tripId = box.state.mappings.trip
  const placeId = box.state.mappings.places['place-senso']
  failPlaces = false
  fake.calls.length = 0
  const second = await runMigration({
    ...baseRun(fake),
    state: box.state,
    persist,
  })
  assert.equal(second.state.status, 'completed')
  assert.equal(second.state.mappings.trip, tripId)
  assert.equal(second.state.mappings.places['place-senso'], placeId)
  assert.equal(fake.calls.filter((call) => call[0] === 'createCloudTrip').length, 0)
})

test('fatal mapping mismatch stops migration', async () => {
  const fake = createFake()
  const state = createTripMigration({
    localTripId: 'trip-tokyo',
    cloudTripId: CLOUD_TRIP,
    path: 'associate',
    status: 'running',
    identityMappings: { 'user-jamie': { type: 'self', cloudUserId: ME } },
    mappings: {
      ...emptyMappings(),
      trip: CLOUD_TRIP,
      places: { 'place-senso': uuid(3) },
    },
  })
  fake.store.places.push({ id: uuid(3), tripId: OTHER_TRIP, name: 'Other shrine' })
  const result = await runMigration({
    ...baseRun(fake),
    path: 'associate',
    targetCloudTrip: { id: CLOUD_TRIP, destination: 'Tokyo, Japan', inviteCode: 'x' },
    state,
    persist: async () => {},
  })
  assert.equal(result.state.status, 'failed')
  assert.equal(result.kind, 'fatal')
  assert.match(result.error, /another trip/)
})

test('relevant pendingOps block execution and do not enqueue migration', async () => {
  const fake = createFake()
  const result = await runMigration({
    ...baseRun(fake),
    pendingOps: [{ id: 'op-1', status: 'blocked', localEntityId: 'place-senso' }],
    persist: async () => {},
  })
  assert.equal(result.state.status, 'blocked')
  assert.equal(fake.calls.length, 0)
})

test('local trip ids remain unchanged after success', async () => {
  const fake = createFake()
  const localTrip = tokyo()
  const snapshot = JSON.stringify(localTrip)
  await runMigration({ ...baseRun(fake, { localTrip }), persist: async () => {} })
  assert.equal(JSON.stringify(localTrip), snapshot)
})

test('assertCloudUuid rejects local ids', () => {
  assert.throws(() => assertCloudUuid('trip-tokyo', 'trip_id'))
  assert.doesNotThrow(() => assertCloudUuid(CLOUD_TRIP, 'trip_id'))
})

test('migration executor does not write protected columns or pendingOps', () => {
  const src = readFileSync(join(root, 'src/lib/migration/execute.js'), 'utf8')
  assert.equal(src.includes('enqueuePendingOp'), false)
  assert.equal(src.includes('expense_shares'), false)
  assert.equal(src.includes('trip_members'), false)
  assert.equal(src.includes("from('activity')"), false)
  assert.equal(src.includes('owner_id'), false)
  assert.equal(src.includes('created_by'), false)
  assert.equal(src.includes('actor_id'), false)
  assert.match(src, /createCloudExpense/)
  assert.match(src, /createCloudPoll/)
})
