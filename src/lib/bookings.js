import { formatQuietDate, todayIso } from './dates.js'
import { formatMoney, formatTime } from './format.js'

/** @type {import('../types').BookingType[]} */
export const BOOKING_TYPES = ['flight', 'hotel', 'train', 'bus', 'ticket', 'restaurant', 'other']

export const BOOKING_TYPE_LABEL = {
  flight: 'Flight',
  hotel: 'Hotel',
  train: 'Train',
  bus: 'Bus',
  ticket: 'Ticket',
  restaurant: 'Restaurant',
  other: 'Other',
}

export const BOOKING_STATUSES = ['confirmed', 'pending', 'cancelled']

export const BOOKING_STATUS_LABEL = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
}

const TYPE_TO_ITINERARY = {
  flight: 'arrival',
  hotel: 'lodging',
  train: 'transport',
  bus: 'transport',
  ticket: 'sight',
  restaurant: 'food',
  other: 'free',
}

const TYPE_TO_EXPENSE = {
  flight: 'flights',
  hotel: 'lodging',
  train: 'transport',
  bus: 'transport',
  ticket: 'activity',
  restaurant: 'food',
  other: 'other',
}

/**
 * @param {import('../types').Booking[]} bookings
 * @param {string} tripId
 */
export function getBookingsForTrip(bookings, tripId) {
  return bookings.filter((booking) => booking.tripId === tripId)
}

/**
 * @param {import('../types').Expense[]} expenses
 * @param {string} bookingId
 */
export function expenseForBooking(expenses, bookingId) {
  if (!bookingId) return null
  return expenses.find((expense) => expense.bookingId === bookingId) ?? null
}

/** @param {import('../types').Booking} booking */
export function bookingToItineraryCategory(booking) {
  return TYPE_TO_ITINERARY[booking.type] ?? 'free'
}

/** @param {import('../types').Booking} booking */
export function bookingToExpenseCategory(booking) {
  return TYPE_TO_EXPENSE[booking.type] ?? 'other'
}

/**
 * Date to drop a booking onto the itinerary.
 * Hotels use startDate (the stay is associated with the trip dates, not copied into every day).
 * @param {import('../types').Booking} booking
 * @param {import('../types').Trip} [trip]
 */
export function bookingItineraryDate(booking, trip) {
  if (booking.startDate) return booking.startDate
  return trip?.startDate ?? ''
}

/**
 * @param {import('../types').Itinerary | null | undefined} itinerary
 * @param {string} bookingId
 */
export function itineraryItemForBooking(itinerary, bookingId) {
  if (!itinerary?.days || !bookingId) return null
  for (const day of itinerary.days) {
    const item = day.items.find((entry) => entry.bookingId === bookingId)
    if (item) return { day, item }
  }
  return null
}

/**
 * Fields an itinerary item should store — references, not a copy of the booking.
 * @param {import('../types').Booking} booking
 */
export function bookingItineraryPatch(booking) {
  return {
    title: booking.title,
    category: bookingToItineraryCategory(booking),
    bookingId: booking.id,
    time: booking.startTime || '',
    place: booking.location || '',
  }
}

/** @param {import('../types').Booking} booking */
export function formatBookingCost(booking) {
  if (booking.cost == null || Number.isNaN(Number(booking.cost))) return ''
  return formatMoney(booking.cost, booking.currency || 'MYR')
}

/** @param {import('../types').Booking} booking */
export function formatBookingWhen(booking) {
  if (!booking.startDate) return ''
  if (booking.type === 'hotel' && booking.endDate && booking.endDate !== booking.startDate) {
    return `${formatQuietDate(booking.startDate)} – ${formatQuietDate(booking.endDate)}`
  }
  const date = formatQuietDate(booking.startDate)
  const time = booking.startTime ? formatTime(booking.startTime) : ''
  return [date, time].filter(Boolean).join(' · ')
}

/**
 * @param {import('../types').Booking[]} bookings
 * @param {Date} [today]
 */
export function getUpcomingBooking(bookings, today = new Date()) {
  const iso = todayIso(today)
  return (
    bookings
      .filter((booking) => booking.status !== 'cancelled' && (booking.startDate || '') >= iso)
      .sort((a, b) => {
        const left = `${a.startDate || ''}${a.startTime || ''}`
        const right = `${b.startDate || ''}${b.startTime || ''}`
        return left.localeCompare(right)
      })[0] ?? null
  )
}
