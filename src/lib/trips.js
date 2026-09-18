import { daysUntil, durationDays, parseISODate, startOfDay, todayIso, tripDates, tripDayNumber } from './dates.js'
import { getExpenseValue, roundMoney } from './currency.js'

/**
 * @param {import('../types').Trip} trip
 * @param {Date} [today]
 * @returns {import('../types').TripStatus}
 */
export function getTripStatus(trip, today = new Date()) {
  const now = startOfDay(today)
  const start = parseISODate(trip.startDate)
  const end = parseISODate(trip.endDate)
  if (now < start) return 'upcoming'
  if (now > end) return 'completed'
  return 'ongoing'
}

/** @param {import('../types').Trip} trip */
export function getTripDurationDays(trip) {
  return durationDays(trip.startDate, trip.endDate)
}

/**
 * @param {import('../types').Expense[]} expenses
 * @param {string} tripId
 */
export function getTripSpending(expenses, tripId) {
  return roundMoney(
    expenses
      .filter((expense) => expense.tripId === tripId)
      .reduce((sum, expense) => sum + getExpenseValue(expense), 0),
  )
}

/**
 * @param {import('../types').Trip[]} trips
 * @param {Date} [today]
 */
export function getUpcomingTrips(trips, today = new Date()) {
  return trips
    .filter((trip) => getTripStatus(trip, today) === 'upcoming')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/**
 * @param {import('../types').Trip[]} trips
 * @param {Date} [today]
 */
export function getNextTrip(trips, today = new Date()) {
  const ongoing = trips.find((trip) => getTripStatus(trip, today) === 'ongoing')
  if (ongoing) return ongoing
  return getUpcomingTrips(trips, today)[0] ?? null
}

/** @param {import('../types').Trip} trip @param {Date} [today] */
export function getCountdown(trip, today = new Date()) {
  const status = getTripStatus(trip, today)
  if (status === 'upcoming') return daysUntil(trip.startDate, today)
  if (status === 'ongoing') return 0
  return daysUntil(trip.endDate, today)
}

function resolveToday(today) {
  if (today == null || today === '') return new Date()
  if (typeof today === 'string') return parseISODate(today)
  return today
}

/**
 * Derived countdown copy. Not persisted. Uses device-local calendar dates.
 *
 * @param {import('../types').Trip} trip
 * @param {Date | string} [today]
 * @returns {{ status: import('../types').TripStatus, label: string, value: number | null }}
 */
export function describeTripCountdown(trip, today) {
  const now = resolveToday(today)
  const status = getTripStatus(trip, now)

  if (status === 'upcoming') {
    const value = daysUntil(trip.startDate, now)
    return {
      status,
      label: value === 1 ? '1 day to go' : `${value} days to go`,
      value,
    }
  }

  if (status === 'ongoing') {
    const total = tripDates(trip).length
    const value = tripDayNumber(trip, todayIso(now))
    return {
      status,
      label: `Day ${value} of ${total}`,
      value,
    }
  }

  return { status: 'completed', label: 'Trip completed', value: null }
}

/**
 * @param {import('../types').Trip[]} trips
 * @param {import('../types').Expense[]} expenses
 * @param {number} [year]
 */
export function getTravelStats(trips, expenses, year = new Date().getFullYear()) {
  const inYear = trips.filter((trip) => {
    const startYear = Number(trip.startDate.slice(0, 4))
    const endYear = Number(trip.endDate.slice(0, 4))
    return startYear === year || endYear === year
  })
  const countries = new Set(inYear.map((trip) => trip.country))
  const cities = new Set(inYear.map((trip) => trip.city))
  const daysOnTheRoad = inYear.reduce((sum, trip) => sum + getTripDurationDays(trip), 0)
  const spent = roundMoney(
    expenses
      .filter((expense) => inYear.some((trip) => trip.id === expense.tripId))
      .reduce((sum, expense) => sum + getExpenseValue(expense), 0),
  )

  return {
    year,
    tripCount: inYear.length,
    countryCount: countries.size,
    cityCount: cities.size,
    daysOnTheRoad,
    spent,
    upcomingCount: getUpcomingTrips(trips).length,
  }
}

export const STATUS_LABEL = {
  upcoming: 'Upcoming',
  ongoing: 'Now travelling',
  completed: 'Completed',
}
