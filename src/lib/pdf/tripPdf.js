/**
 * Trip PDF export. Composes existing trip helpers; does not invent totals.
 */

import { displayName } from '../../data/mock.js'
import { BOOKING_STATUS_LABEL, BOOKING_TYPE_LABEL } from '../bookings.js'
import { formatDateRange, formatLongDate, parseISODate } from '../dates.js'
import { CATEGORY_LABEL, getExpensesForTrip } from '../expenses.js'
import { formatExpenseAmount, formatMoney, formatTime } from '../format.js'
import { getTripInsightsSnapshot } from '../insights.js'
import { flattenItineraryItems } from '../itinerary.js'
import { resolveUser } from '../people.js'
import { PLACE_STATUS_LABEL } from '../places.js'
import {
  CHECKLIST_PHASES,
  checklistProgress,
  checklistRowsForTripUser,
  notesForTripUser,
  packingProgress,
  packingRowsForTripUser,
  sortByChecklistOrder,
  sortByPackingOrder,
  sortNotes,
} from '../planning.js'
import {
  getOutstandingDebts,
  getUserOutstanding,
  isSharedTrip,
  paymentMethodLabel,
} from '../repayments.js'
import { describeTripCountdown, STATUS_LABEL } from '../trips.js'

const SECRET_PATTERN = /access_token|refresh_token|service_role|anon_key/i

/**
 * @param {unknown} value
 */
export function tripPdfHasSecrets(value) {
  return SECRET_PATTERN.test(JSON.stringify(value ?? {}))
}

/**
 * @param {unknown} value
 */
export function slugPdfSegment(value) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'trip'
}

/**
 * @param {{ city?: string, destination?: string, startDate?: string } | null | undefined} trip
 */
export function tripPdfFilename(trip) {
  const dest = slugPdfSegment(trip?.city || trip?.destination)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trip?.startDate ?? '') ? trip.startDate : 'export'
  return `travel-os-${dest}-${date}.pdf`
}

/**
 * Character-based wrap used to keep long copy from becoming invalid layout data.
 *
 * @param {unknown} text
 * @param {number} [maxChars]
 */
export function wrapPlainText(text, maxChars = 72) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!source) return []
  if (!Number.isFinite(maxChars) || maxChars < 8) return [source]
  const words = source.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= maxChars) {
      line = next
      continue
    }
    if (line) lines.push(line)
    if (word.length <= maxChars) {
      line = word
      continue
    }
    for (let index = 0; index < word.length; index += maxChars) {
      const chunk = word.slice(index, index + maxChars)
      if (index + maxChars < word.length) lines.push(chunk)
      else line = chunk
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * @param {string} [startIso]
 * @param {string} [endIso]
 */
export function formatCoverDateRange(startIso, endIso) {
  if (!startIso) return ''
  const start = parseISODate(startIso)
  const end = endIso ? parseISODate(endIso) : start
  const months = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ]
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    if (start.getDate() === end.getDate()) {
      return `${start.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
    }
    return `${start.getDate()} — ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} ${months[start.getMonth()]} — ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
  }
  return `${start.getDate()} ${months[start.getMonth()]} ${start.getFullYear()} — ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
}

function present(value) {
  if (value == null) return ''
  const text = String(value).trim()
  return text
}

function personName(users, userId, currentUserId) {
  return displayName(resolveUser(userId, users), currentUserId)
}

function destinationLabel(trip) {
  return present(trip.city) || present(trip.destination) || 'Trip'
}

function tripNameLabel(trip) {
  const city = present(trip.city)
  const destination = present(trip.destination)
  if (destination && destination !== city) return destination
  return ''
}

/**
 * @param {{
 *   trip: import('../../types').Trip,
 *   itinerary?: import('../../types').Itinerary | null,
 *   places?: import('../../types').Place[],
 *   bookings?: import('../../types').Booking[],
 *   expenses?: import('../../types').Expense[],
 *   repayments?: import('../../types').Repayment[],
 *   users?: import('../../types').User[],
 *   currentUserId: string,
 *   packingCategories?: import('../../types').PackingCategory[],
 *   packingItems?: import('../../types').PackingItem[],
 *   checklistCategories?: import('../../types').ChecklistCategory[],
 *   checklistItems?: import('../../types').ChecklistItem[],
 *   notes?: import('../../types').TripNote[],
 *   today?: Date | string,
 * }} input
 */
export function buildTripPdfModel(input) {
  const trip = input?.trip
  if (!trip?.id || !input?.currentUserId) return null

  const currentUserId = input.currentUserId
  const users = input.users ?? []
  const tripPlaces = (input.places ?? []).filter((place) => place.tripId === trip.id)
  const tripBookings = (input.bookings ?? []).filter((booking) => booking.tripId === trip.id)
  const tripExpenses = getExpensesForTrip(input.expenses ?? [], trip.id)
  const tripRepayments = (input.repayments ?? []).filter((item) => item.tripId === trip.id)
  const packingItems = packingRowsForTripUser(input.packingItems ?? [], trip.id, currentUserId)
  const packingCategories = packingRowsForTripUser(input.packingCategories ?? [], trip.id, currentUserId)
  const checklistItems = checklistRowsForTripUser(input.checklistItems ?? [], trip.id, currentUserId)
  const checklistCategories = checklistRowsForTripUser(input.checklistCategories ?? [], trip.id, currentUserId)
  const tripNotes = notesForTripUser(input.notes ?? [], trip.id, currentUserId)
  const itineraryItems = flattenItineraryItems(input.itinerary)
  const countdown = describeTripCountdown(trip, input.today)
  const status = countdown.status
  const destination = destinationLabel(trip)
  const name = tripNameLabel(trip)
  const country = present(trip.country)
  const insights = getTripInsightsSnapshot({
    trip,
    expenses: tripExpenses,
    repayments: tripRepayments,
    currentUserId,
  })

  const placeById = new Map(tripPlaces.map((place) => [place.id, place]))
  const bookingById = new Map(tripBookings.map((booking) => [booking.id, booking]))

  const itineraryDays = (input.itinerary?.days ?? [])
    .filter((day) => Array.isArray(day.items) && day.items.length)
    .map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date,
      dateLabel: day.date ? formatLongDate(day.date) : '',
      title: present(day.title),
      items: day.items.map((item) => {
        const linkedPlace = item.placeId ? placeById.get(item.placeId) : null
        const linkedBooking = item.bookingId ? bookingById.get(item.bookingId) : null
        return {
          time: item.time ? formatTime(item.time) : '',
          title: present(item.title),
          place: present(item.place) || present(linkedPlace?.name),
          booking: present(linkedBooking?.title),
          notes: present(item.notes),
        }
      }),
    }))

  const places = tripPlaces.map((place) => ({
    name: present(place.name),
    status: PLACE_STATUS_LABEL[place.status] ?? present(place.status),
    category: present(place.category),
    area: present(place.area) || present(place.address),
    rating: Number.isFinite(place.rating) ? place.rating : null,
    cost:
      place.estimatedCost != null
        ? formatMoney(place.estimatedCost, place.currency || trip.currency)
        : '',
    notes: present(place.notes),
  }))

  const bookings = tripBookings.map((booking) => ({
    type: BOOKING_TYPE_LABEL[booking.type] ?? present(booking.type),
    title: present(booking.title),
    date: booking.startDate ? formatDateRange(booking.startDate, booking.endDate || booking.startDate) : '',
    time: booking.startTime ? formatTime(booking.startTime) : '',
    location: present(booking.location),
    confirmation: present(booking.confirmationNumber),
    cost: booking.cost != null ? formatMoney(booking.cost, booking.currency || trip.currency) : '',
    status: BOOKING_STATUS_LABEL[booking.status] ?? present(booking.status),
    documentAttached: Array.isArray(booking.documents) && booking.documents.length > 0,
  }))

  const shared = isSharedTrip(trip)
  const outstanding = getUserOutstanding(getOutstandingDebts(tripExpenses, tripRepayments), currentUserId)
  const expenses = tripExpenses.length
    ? {
        shared,
        total: formatMoney(insights.total, trip.currency),
        totalAmount: insights.total,
        yourPaid: formatMoney(insights.yourPaid, trip.currency),
        yourPaidAmount: insights.yourPaid,
        yourShare: formatMoney(insights.yourShare, trip.currency),
        yourShareAmount: insights.yourShare,
        outstanding: shared ? formatMoney(insights.outstanding, trip.currency) : '',
        outstandingAmount: shared ? insights.outstanding : 0,
        rows: tripExpenses.map((expense) => ({
          date: expense.date ? formatLongDate(expense.date) : '',
          description: present(expense.description),
          category: CATEGORY_LABEL[expense.category] ?? present(expense.category),
          payer: personName(users, expense.payerId, currentUserId),
          amount: formatExpenseAmount(expense),
          currency: present(expense.currency),
          originalAmount: expense.amount,
        })),
        settlement: shared
          ? {
              net: formatMoney(outstanding.net, trip.currency),
              youOwe: outstanding.youOwe.map((group) => ({
                name: personName(users, group.userId, currentUserId),
                total: formatMoney(group.total, trip.currency),
                items: group.items.map((item) => ({
                  label: present(item.description) || CATEGORY_LABEL[item.category] || 'Expense',
                  amount: formatMoney(item.outstanding, trip.currency),
                })),
              })),
              youAreOwed: outstanding.youAreOwed.map((group) => ({
                name: personName(users, group.userId, currentUserId),
                total: formatMoney(group.total, trip.currency),
                items: group.items.map((item) => ({
                  label: present(item.description) || CATEGORY_LABEL[item.category] || 'Expense',
                  amount: formatMoney(item.outstanding, trip.currency),
                })),
              })),
            }
          : null,
        repayments: tripRepayments.length
          ? [...tripRepayments]
              .sort(
                (a, b) =>
                  String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')) ||
                  String(b.id).localeCompare(String(a.id)),
              )
              .map((item) => ({
                date: item.paidAt ? formatLongDate(item.paidAt) : '',
                from: personName(users, item.fromUserId, currentUserId),
                to: personName(users, item.toUserId, currentUserId),
                amount: formatMoney(item.amount, item.currency || trip.currency),
                method: paymentMethodLabel(item.paymentMethod),
                note: present(item.note),
              }))
          : [],
      }
    : null

  const packingProgressView = packingProgress(packingItems)
  const packing = packingItems.length
    ? {
        packed: packingProgressView.packed,
        total: packingProgressView.total,
        summary: `${packingProgressView.packed} / ${packingProgressView.total} packed`,
        categories: sortByPackingOrder(packingCategories)
          .map((category) => {
            const items = sortByPackingOrder(packingItems.filter((item) => item.categoryId === category.id)).map(
              (item) => ({
                name: present(item.name),
                quantity: item.quantity,
                packed: Boolean(item.packed),
                note: present(item.note),
              }),
            )
            return items.length ? { name: present(category.name), items } : null
          })
          .filter(Boolean)
          .concat(
            (() => {
              const known = new Set(packingCategories.map((category) => category.id))
              const loose = sortByPackingOrder(packingItems.filter((item) => !known.has(item.categoryId))).map(
                (item) => ({
                  name: present(item.name),
                  quantity: item.quantity,
                  packed: Boolean(item.packed),
                  note: present(item.note),
                }),
              )
              return loose.length ? [{ name: 'Other', items: loose }] : []
            })(),
          ),
      }
    : null

  const checklistProgressView = checklistProgress(checklistItems)
  const checklist = checklistItems.length
    ? {
        done: checklistProgressView.done,
        total: checklistProgressView.total,
        summary: `${checklistProgressView.done} / ${checklistProgressView.total} completed`,
        phases: CHECKLIST_PHASES.map((phase) => {
          const phaseCategories = sortByChecklistOrder(
            checklistCategories.filter((category) => category.phase === phase.id),
          )
            .map((category) => {
              const items = sortByChecklistOrder(
                checklistItems.filter((item) => item.categoryId === category.id),
              ).map((item) => ({
                name: present(item.name),
                done: Boolean(item.done),
                dueDate: item.dueDate ? formatLongDate(item.dueDate) : '',
                note: present(item.note),
              }))
              return items.length ? { name: present(category.name), items } : null
            })
            .filter(Boolean)
          return phaseCategories.length ? { id: phase.id, label: phase.label, categories: phaseCategories } : null
        }).filter(Boolean),
      }
    : null

  const notes = tripNotes.length
    ? sortNotes(tripNotes).map((note) => ({
        title: present(note.title),
        body: present(note.body),
        date: note.date ? formatLongDate(note.date) : '',
        updatedAt: note.updatedAt ? formatLongDate(note.updatedAt.slice(0, 10)) : '',
      }))
    : null

  const overviewFacts = [
    { label: 'Destination', value: destination },
    country ? { label: 'Country', value: country } : null,
    trip.startDate ? { label: 'Dates', value: formatDateRange(trip.startDate, trip.endDate || trip.startDate) } : null,
    { label: 'Status', value: STATUS_LABEL[status] ?? status },
    itineraryItems.length ? { label: 'Itinerary', value: String(itineraryItems.length) } : null,
    places.length ? { label: 'Places', value: String(places.length) } : null,
    bookings.length ? { label: 'Bookings', value: String(bookings.length) } : null,
  ].filter(Boolean)

  return {
    filename: tripPdfFilename(trip),
    cover: {
      brand: 'TRAVEL OS',
      destination,
      tripName: name,
      dates: formatCoverDateRange(trip.startDate, trip.endDate),
      country,
      countdown:
        status === 'upcoming' && countdown.value != null
          ? countdown.value === 1
            ? '1 day'
            : `${countdown.value} days`
          : '',
    },
    overview: overviewFacts,
    itinerary: itineraryDays.length ? itineraryDays : null,
    places: places.length ? places : null,
    bookings: bookings.length ? bookings : null,
    expenses,
    packing,
    checklist,
    notes,
    footer: {
      brand: 'Travel OS',
      destination: destination.toUpperCase(),
    },
  }
}

function downloadPdfBytes(bytes, filename) {
  if (typeof document === 'undefined') return
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * @param {Parameters<typeof buildTripPdfModel>[0]} input
 */
export async function exportTripPdf(input) {
  const model = buildTripPdfModel(input)
  if (!model) throw new Error('A trip is required to export a PDF.')
  if (tripPdfHasSecrets(model)) throw new Error('Could not export the PDF.')
  const { renderTripPdf } = await import('./renderTripPdf.js')
  const bytes = await renderTripPdf(model)
  downloadPdfBytes(bytes, model.filename)
  return { filename: model.filename, bytes }
}
