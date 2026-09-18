import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bookingItineraryDate,
  bookingItineraryPatch,
  bookingToExpenseCategory,
  bookingToItineraryCategory,
  expenseForBooking,
  getUpcomingBooking,
} from './bookings.js'

const flight = {
  id: 'book-vie-flight',
  tripId: 'trip-vienna',
  type: 'flight',
  title: 'KUL → VIE',
  startDate: '2026-12-11',
  startTime: '22:30',
  cost: 1800,
  currency: 'MYR',
  status: 'confirmed',
}

const hotel = {
  id: 'book-vie-hotel',
  tripId: 'trip-vienna',
  type: 'hotel',
  title: 'Hotel Sacher',
  startDate: '2026-12-12',
  endDate: '2026-12-19',
  status: 'confirmed',
}

test('booking itinerary items store a reference, not a copy of booking fields', () => {
  const patch = bookingItineraryPatch(flight)
  assert.equal(patch.bookingId, 'book-vie-flight')
  assert.equal(patch.title, 'KUL → VIE')
  assert.equal(patch.category, 'arrival')
  assert.equal(patch.confirmationNumber, undefined)
  assert.equal(patch.cost, undefined)
  assert.equal(bookingToItineraryCategory(hotel), 'lodging')
  assert.equal(bookingItineraryDate(hotel), '2026-12-12')
})

test('an expense can reference a booking without auto-duplicating', () => {
  const expenses = [
    { id: 'exp-vie-flights', bookingId: 'book-vie-flight', amount: 1800 },
  ]
  assert.equal(expenseForBooking(expenses, 'book-vie-flight')?.id, 'exp-vie-flights')
  assert.equal(expenseForBooking(expenses, 'book-vie-hotel'), null)
  assert.equal(bookingToExpenseCategory(flight), 'flights')
})

test('upcoming booking prefers the next confirmed date', () => {
  const next = getUpcomingBooking([flight, hotel], new Date(2026, 8, 11))
  assert.equal(next.id, 'book-vie-flight')
})
