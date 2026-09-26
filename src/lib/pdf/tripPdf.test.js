import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTripInsightsSnapshot } from '../insights.js'
import {
  buildTripPdfModel,
  exportTripPdf,
  formatCoverDateRange,
  slugPdfSegment,
  tripPdfFilename,
  tripPdfHasSecrets,
  wrapPlainText,
} from './tripPdf.js'

const ME = 'user-jamie'
const ALI = 'user-ali'

const trip = {
  id: 'trip-1',
  city: 'Vienna',
  country: 'Austria',
  destination: 'Vienna, Austria',
  startDate: '2026-12-12',
  endDate: '2026-12-19',
  budgetAmount: 4000,
  currency: 'MYR',
  members: [
    { userId: ME, role: 'owner' },
    { userId: ALI, role: 'editor' },
  ],
}

const personalTrip = {
  ...trip,
  id: 'trip-empty',
  city: 'Lisbon',
  destination: 'Lisbon, Portugal',
  country: 'Portugal',
  startDate: '2027-04-01',
  endDate: '2027-04-06',
  members: [{ userId: ME, role: 'owner' }],
}

const users = [
  { id: ME, name: 'Jamie Lim', shortName: 'Jamie', email: 'jamie@travelos.app', initials: 'JL' },
  { id: ALI, name: 'Ali Tan', shortName: 'Ali', email: 'ali@example.com', initials: 'AT' },
]

const food = {
  id: 'exp-food',
  tripId: 'trip-1',
  amount: 80,
  currency: 'EUR',
  convertedAmount: 400,
  convertedCurrency: 'MYR',
  category: 'food',
  date: '2026-12-13',
  description: 'Dinner',
  payerId: ALI,
  shares: [
    { userId: ALI, amount: 40 },
    { userId: ME, amount: 40 },
  ],
}

const hotel = {
  id: 'exp-hotel',
  tripId: 'trip-1',
  amount: 1000,
  currency: 'MYR',
  convertedAmount: 1000,
  convertedCurrency: 'MYR',
  category: 'lodging',
  date: '2026-12-12',
  description: 'Hotel',
  payerId: ME,
  shares: [
    { userId: ME, amount: 600 },
    { userId: ALI, amount: 400 },
  ],
}

const otherTripExpense = {
  id: 'exp-other',
  tripId: 'trip-other',
  amount: 900,
  currency: 'MYR',
  convertedAmount: 900,
  convertedCurrency: 'MYR',
  category: 'food',
  date: '2026-12-14',
  description: 'Elsewhere',
  payerId: ME,
  shares: [{ userId: ME, amount: 900 }],
}

const repayment = {
  id: 'pay-1',
  tripId: 'trip-1',
  fromUserId: ME,
  toUserId: ALI,
  amount: 50,
  currency: 'MYR',
  paymentMethod: 'cash',
  paidAt: '2026-12-14',
  note: 'Dinner share',
}

function fullInput(overrides = {}) {
  return {
    trip,
    currentUserId: ME,
    users,
    itinerary: {
      tripId: 'trip-1',
      days: [
        {
          date: '2026-12-12',
          dayNumber: 1,
          title: 'Arrival',
          items: [
            {
              id: 'it-1',
              title: 'Hotel Sacher',
              time: '16:00',
              place: 'Philharmoniker Strasse',
              placeId: 'place-1',
              bookingId: 'book-1',
              notes: 'Late check-in.',
            },
          ],
        },
        { date: '2026-12-13', dayNumber: 2, title: 'Empty day', items: [] },
      ],
    },
    places: [
      {
        id: 'place-1',
        tripId: 'trip-1',
        name: 'Hotel Sacher',
        status: 'planned',
        category: 'Stay',
        area: 'Innere Stadt',
        rating: 4.8,
        estimatedCost: 980,
        currency: 'MYR',
        notes: 'Home base.',
      },
    ],
    bookings: [
      {
        id: 'book-1',
        tripId: 'trip-1',
        type: 'hotel',
        title: 'Hotel Sacher',
        startDate: '2026-12-12',
        endDate: '2026-12-19',
        startTime: '15:00',
        location: 'Vienna',
        confirmationNumber: 'SAC-1',
        cost: 980,
        currency: 'MYR',
        status: 'confirmed',
        documents: [{ id: 'doc-1', name: 'confirmation.pdf' }],
      },
    ],
    expenses: [food, hotel, otherTripExpense],
    repayments: [repayment],
    packingCategories: [{ id: 'pc-1', tripId: 'trip-1', userId: ME, name: 'Clothing', sortOrder: 0 }],
    packingItems: [
      {
        id: 'pi-1',
        tripId: 'trip-1',
        userId: ME,
        categoryId: 'pc-1',
        name: 'Coat',
        quantity: 1,
        packed: true,
        note: 'Warm',
        sortOrder: 0,
      },
      {
        id: 'pi-2',
        tripId: 'trip-1',
        userId: ME,
        categoryId: 'pc-1',
        name: 'Scarf',
        quantity: 2,
        packed: false,
        note: '',
        sortOrder: 1,
      },
    ],
    checklistCategories: [
      { id: 'cc-1', tripId: 'trip-1', userId: ME, phase: 'before', name: 'Documents', sortOrder: 0 },
    ],
    checklistItems: [
      {
        id: 'ci-1',
        tripId: 'trip-1',
        userId: ME,
        categoryId: 'cc-1',
        name: 'Passport',
        done: true,
        dueDate: '2026-12-01',
        note: 'Copy the photo page',
        sortOrder: 0,
      },
    ],
    notes: [
      {
        id: 'note-1',
        tripId: 'trip-1',
        userId: ME,
        title: 'Cafe list',
        body: 'Central and Sperl.',
        date: '2026-12-12',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-02T10:00:00.000Z',
      },
    ],
    today: '2026-09-25',
    ...overrides,
  }
}

test('PDF export can be triggered for a valid trip', async () => {
  const result = await exportTripPdf(fullInput())
  assert.equal(result.filename, 'travel-os-vienna-2026-12-12.pdf')
  assert.equal(Buffer.from(result.bytes.subarray(0, 4)).toString(), '%PDF')
})

test('filename is generated from destination and start date', () => {
  assert.equal(tripPdfFilename(trip), 'travel-os-vienna-2026-12-12.pdf')
  assert.equal(slugPdfSegment('Vienna / City??'), 'vienna-city')
  assert.equal(tripPdfFilename({ city: 'New York', startDate: '2026-01-02' }), 'travel-os-new-york-2026-01-02.pdf')
})

test('itinerary data is included in day order and empty days are omitted', () => {
  const model = buildTripPdfModel(fullInput())
  assert.equal(model.itinerary.length, 1)
  assert.equal(model.itinerary[0].dayNumber, 1)
  assert.equal(model.itinerary[0].items[0].title, 'Hotel Sacher')
  assert.equal(model.itinerary[0].items[0].place, 'Philharmoniker Strasse')
  assert.equal(model.itinerary[0].items[0].booking, 'Hotel Sacher')
  assert.equal(model.itinerary[0].items[0].notes, 'Late check-in.')
})

test('places and bookings are included when present', () => {
  const model = buildTripPdfModel(fullInput())
  assert.equal(model.places[0].name, 'Hotel Sacher')
  assert.equal(model.places[0].status, 'Planned')
  assert.equal(model.bookings[0].title, 'Hotel Sacher')
  assert.equal(model.bookings[0].type, 'Hotel')
  assert.equal(model.bookings[0].documentAttached, true)
  assert.equal(JSON.stringify(model.bookings).includes('confirmation.pdf'), false)
})

test('empty sections are omitted', () => {
  const model = buildTripPdfModel({
    trip: personalTrip,
    currentUserId: ME,
    users,
    itinerary: { tripId: personalTrip.id, days: [] },
    places: [],
    bookings: [],
    expenses: [],
    repayments: [],
    packingItems: [],
    checklistItems: [],
    notes: [],
  })
  assert.equal(model.itinerary, null)
  assert.equal(model.places, null)
  assert.equal(model.bookings, null)
  assert.equal(model.expenses, null)
  assert.equal(model.packing, null)
  assert.equal(model.checklist, null)
  assert.equal(model.notes, null)
  assert.ok(model.overview.some((fact) => fact.label === 'Destination'))
  assert.equal(
    model.overview.some((fact) => fact.label === 'Places'),
    false,
  )
})

test('expenses use existing totals and repayments are not added to spending', () => {
  const input = fullInput()
  const model = buildTripPdfModel(input)
  const insights = getTripInsightsSnapshot({
    trip,
    expenses: input.expenses,
    repayments: input.repayments,
    currentUserId: ME,
  })
  assert.equal(model.expenses.totalAmount, insights.total)
  assert.equal(model.expenses.yourPaidAmount, insights.yourPaid)
  assert.equal(model.expenses.yourShareAmount, insights.yourShare)
  assert.equal(model.expenses.outstandingAmount, insights.outstanding)
  assert.notEqual(model.expenses.totalAmount, insights.total + repayment.amount)
  assert.equal(model.expenses.rows.some((row) => row.description === 'Elsewhere'), false)
  assert.equal(
    model.expenses.rows.find((row) => row.description === 'Dinner').originalAmount,
    80,
  )
  assert.equal(model.expenses.rows.find((row) => row.description === 'Dinner').currency, 'EUR')
  assert.equal(model.expenses.repayments[0].amount.includes('50'), true)
})

test('packing, checklist, and notes are included when present', () => {
  const model = buildTripPdfModel(fullInput())
  assert.equal(model.packing.summary, '1 / 2 packed')
  assert.equal(model.packing.categories[0].items[0].name, 'Coat')
  assert.equal(model.checklist.summary, '1 / 1 completed')
  assert.equal(model.checklist.phases[0].label, 'Before Trip')
  assert.equal(model.notes[0].title, 'Cafe list')
  assert.equal(model.notes[0].body, 'Central and Sperl.')
  assert.equal('pinned' in model.notes[0], false)
})

test('long text wraps into valid layout lines', () => {
  const lines = wrapPlainText('word '.repeat(40).trim(), 24)
  assert.ok(lines.length > 3)
  assert.ok(lines.every((line) => line.length <= 24))
  const model = buildTripPdfModel(
    fullInput({
      notes: [
        {
          id: 'note-long',
          tripId: 'trip-1',
          userId: ME,
          title: 'Long note',
          body: 'A quiet street and a long sentence that should wrap safely across the travel book page. '.repeat(8),
          date: null,
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
        },
      ],
    }),
  )
  assert.ok(wrapPlainText(model.notes[0].body, 48).length > 1)
})

test('export model does not expose secrets or booking file contents', () => {
  const model = buildTripPdfModel(
    fullInput({
      bookings: [
        {
          id: 'book-1',
          tripId: 'trip-1',
          type: 'flight',
          title: 'KUL → VIE',
          documents: [{ id: 'doc-secret', name: 'boarding-pass.pdf' }],
        },
      ],
    }),
  )
  assert.equal(tripPdfHasSecrets(model), false)
  const raw = JSON.stringify(model)
  assert.equal(/access_token|refresh_token|service_role|anon_key/i.test(raw), false)
  assert.equal(raw.includes('boarding-pass.pdf'), false)
  assert.equal(buildTripPdfModel({ trip: null, currentUserId: ME }), null)
})

test('cover dates use an editorial range', () => {
  assert.equal(formatCoverDateRange('2026-12-12', '2026-12-19'), '12 — 19 DECEMBER 2026')
})
