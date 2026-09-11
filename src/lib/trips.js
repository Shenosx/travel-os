import { daysUntil, durationDays, parseISODate, startOfDay } from './dates.js'
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
