import { displayName, getUserById } from '../data/mock.js'
import { isIsoDate, todayIso, weekDates } from './dates.js'

export const ITINERARY_VIEWS = ['list', 'month', 'week', 'day']
export const CALENDAR_VIEWS = new Set(['month', 'week', 'day'])

/**
 * @param {import('../types').Itinerary[]} itineraries
 * @param {string} tripId
 * @param {string} itemId
 * @param {Partial<import('../types').ItineraryItem>} patch
 * @param {string} actorId
 * @param {string} now
 */
export function updateItineraryItemRecord(itineraries, tripId, itemId, patch, actorId, now) {
  let updated = null
  const next = itineraries.map((entry) => {
    if (entry.tripId !== tripId) return entry
    return {
      ...entry,
      days: entry.days.map((day) => ({
        ...day,
        items: day.items.map((item) => {
          if (item.id !== itemId) return item
          updated = {
            ...item,
            ...patch,
            id: item.id,
            createdBy: item.createdBy,
            createdAt: item.createdAt,
            updatedBy: actorId,
            updatedAt: now,
          }
          return updated
        }),
      })),
    }
  })
  return { itineraries: next, item: updated }
}

/**
 * @param {import('../types').Itinerary | null | undefined} itinerary
 */
export function flattenItineraryItems(itinerary) {
  if (!itinerary?.days) return []
  return itinerary.days.flatMap((day) =>
    day.items.map((item) => ({
      ...item,
      date: day.date,
      dayNumber: day.dayNumber,
      dayTitle: day.title,
    })),
  )
}

/**
 * Calendar index of existing itinerary items. Empty dates are omitted.
 * Item order matches the itinerary; items are the original records.
 * @param {import('../types').Itinerary | null | undefined} itinerary
 * @returns {Map<string, import('../types').ItineraryItem[]>}
 */
export function indexItineraryItemsByDate(itinerary) {
  const index = new Map()
  if (!itinerary?.days) return index
  for (const day of itinerary.days) {
    if (!day?.date || !Array.isArray(day.items) || day.items.length === 0) continue
    const existing = index.get(day.date)
    if (existing) {
      for (const item of day.items) existing.push(item)
      continue
    }
    index.set(day.date, [...day.items])
  }
  return index
}

/**
 * Presentation slice for one date. Does not copy itinerary items.
 * @param {import('../types').Itinerary | null | undefined} itinerary
 * @param {string} date
 */
export function itinerarySliceForDate(itinerary, date) {
  const day = itinerary?.days?.find((entry) => entry.date === date)
  if (!day) return { tripId: itinerary?.tripId, days: [] }
  return { tripId: itinerary.tripId, days: [day] }
}

/**
 * Presentation rows for a Monday–Sunday week. Empty dates keep an empty items array
 * without creating itinerary records.
 * @param {import('../types').Itinerary | null | undefined} itinerary
 * @param {string} iso
 * @returns {{ date: string, items: import('../types').ItineraryItem[] }[]}
 */
export function itineraryDaysForWeek(itinerary, iso) {
  const index = indexItineraryItemsByDate(itinerary)
  return weekDates(iso).map((date) => ({
    date,
    items: index.get(date) ?? [],
  }))
}

/**
 * URL/search params for itinerary views. List omits `view` so it stays the default.
 * Date is preserved across List/Month/Week/Day.
 * @param {{ view?: string, date?: string, itemId?: string, placeId?: string }} [state]
 */
export function itinerarySearchParams({ view = 'list', date, itemId, placeId } = {}) {
  const next = { tab: 'itinerary' }
  if (CALENDAR_VIEWS.has(view)) next.view = view
  if (date) next.date = date
  if (itemId) next.item = itemId
  if (placeId) next.place = placeId
  return next
}

/**
 * @param {{ date?: string, itemId?: string, placeId?: string }} current
 * @param {string} nextView
 */
export function switchItineraryView(current = {}, nextView) {
  const view = ITINERARY_VIEWS.includes(nextView) ? nextView : 'list'
  return itinerarySearchParams({
    view,
    date: current.date,
    itemId: current.itemId,
    placeId: current.placeId,
  })
}

/**
 * Existing item click: keep the itinerary item id and optional place ref.
 * @param {import('../types').ItineraryItem} item
 * @param {{ view?: string, date?: string }} context
 */
export function calendarItemSelection(item, { view = 'list', date } = {}) {
  return itinerarySearchParams({
    view,
    date,
    itemId: item?.id,
    placeId: item?.placeId,
  })
}

/**
 * Quick Add date: selected calendar YYYY-MM-DD, else trip start.
 * @param {unknown} requestedDate
 * @param {{ startDate?: string } | null | undefined} trip
 */
export function resolveCalendarAddDate(requestedDate, trip) {
  if (isIsoDate(requestedDate)) return requestedDate
  return trip?.startDate && isIsoDate(trip.startDate) ? trip.startDate : ''
}

/**
 * @param {import('../types').Itinerary | null | undefined} itinerary
 * @param {Date} [today]
 */
export function getNextItineraryItem(itinerary, today = new Date()) {
  const iso = todayIso(today)
  return flattenItineraryItems(itinerary).find((item) => item.date >= iso) ?? null
}

/**
 * @param {import('../types').Itinerary[]} itineraries
 * @param {string} tripId
 * @param {string} itemId
 * @param {string} nextDate
 */
export function moveItineraryItemRecord(itineraries, tripId, itemId, nextDate) {
  let moved = null
  const next = itineraries.map((entry) => {
    if (entry.tripId !== tripId) return entry
    let item = null
    const days = entry.days.map((day) => ({
      ...day,
      items: day.items.filter((entryItem) => {
        if (entryItem.id !== itemId) return true
        item = entryItem
        return false
      }),
    }))
    if (!item) return entry
    moved = item
    const hasDay = days.some((day) => day.date === nextDate)
    const withItem = hasDay
      ? days.map((day) => (day.date === nextDate ? { ...day, items: [...day.items, item] } : day))
      : [
          ...days,
          { date: nextDate, dayNumber: days.length + 1, title: '', items: [item] },
        ]
    return { ...entry, days: withItem }
  })
  return { itineraries: next, item: moved }
}

/**
 * Drop a place or booking reference without deleting the itinerary row.
 * @param {import('../types').Itinerary[]} itineraries
 * @param {string} tripId
 * @param {{ placeId?: string, bookingId?: string }} refs
 */
export function clearItineraryRefs(itineraries, tripId, refs) {
  return itineraries.map((entry) => {
    if (entry.tripId !== tripId) return entry
    return {
      ...entry,
      days: entry.days.map((day) => ({
        ...day,
        items: day.items.map((item) => {
          let next = item
          if (refs.placeId && item.placeId === refs.placeId) {
            next = { ...next, placeId: undefined }
          }
          if (refs.bookingId && item.bookingId === refs.bookingId) {
            next = { ...next, bookingId: undefined }
          }
          return next
        }),
      })),
    }
  })
}

/**
 * Subtle credit on a shared itinerary item. Returns null when the current
 * user created it, or when the item has no author.
 *
 * @param {import('../types').ItineraryItem} item
 * @param {import('../types').User[]} users
 * @param {string} currentUserId
 */
export function itineraryAttribution(item, users, currentUserId) {
  if (!item?.createdBy) return null
  if (item.updatedBy && item.updatedBy !== item.createdBy && item.updatedBy !== currentUserId) {
    const editor = displayName(getUserById(item.updatedBy, users), currentUserId)
    return `Updated by ${editor}`
  }
  if (item.createdBy !== currentUserId) {
    const author = displayName(getUserById(item.createdBy, users), currentUserId)
    return `Added by ${author}`
  }
  return null
}
