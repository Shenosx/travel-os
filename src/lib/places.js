import { tripDayNumber } from './dates.js'
import { formatMoney, formatTime } from './format.js'

/** @type {import('../types').PlaceStatus[]} */
export const PLACE_STATUSES = ['saved', 'planned', 'visited']

export const PLACE_STATUS_LABEL = {
  saved: 'Saved',
  planned: 'Planned',
  visited: 'Visited',
}

export const PLACE_CATEGORIES = [
  'Stay',
  'Sight',
  'Café',
  'Food',
  'Museum',
  'Park',
  'Shop',
  'Neighbourhood',
  'Other',
]

const CATEGORY_TO_ITINERARY = {
  Stay: 'lodging',
  Sight: 'sight',
  Café: 'food',
  Food: 'food',
  Museum: 'sight',
  Park: 'sight',
  Shop: 'free',
  Neighbourhood: 'free',
  Other: 'free',
}

/**
 * @param {import('../types').Place[]} places
 * @param {string} tripId
 */
export function getPlacesForTrip(places, tripId) {
  return places.filter((place) => place.tripId === tripId)
}

/**
 * @param {import('../types').Place[]} places
 * @param {'all' | import('../types').PlaceStatus} filter
 */
export function filterPlaces(places, filter) {
  if (!filter || filter === 'all') return places
  return places.filter((place) => place.status === filter)
}

/** @param {import('../types').Place | null | undefined} place */
export function placeHasLocation(place) {
  return place?.latitude != null && place?.longitude != null
}

/** @param {string} [category] */
export function categoryToItinerary(category) {
  return CATEGORY_TO_ITINERARY[category] ?? 'sight'
}

/**
 * Keep plannedDay when a place is marked visited.
 * @param {import('../types').Place} place
 */
export function markPlaceVisited(place) {
  return {
    ...place,
    status: 'visited',
    plannedDay: place.plannedDay,
  }
}

/**
 * @param {import('../types').Place} place
 * @param {import('../types').Itinerary | null | undefined} itinerary
 */
export function itineraryItemForPlace(itinerary, placeId) {
  if (!itinerary?.days || !placeId) return null
  for (const day of itinerary.days) {
    const item = day.items.find((entry) => entry.placeId === placeId)
    if (item) return { day, item }
  }
  return null
}

/**
 * @param {import('../types').Place} place
 * @param {import('../types').Itinerary | null | undefined} itinerary
 * @param {import('../types').Trip | null | undefined} trip
 */
export function placeSchedule(place, itinerary, trip) {
  const linked = itineraryItemForPlace(itinerary, place?.id)
  const date = linked?.day.date ?? place?.plannedDay ?? null
  const dayNumber = linked?.day.dayNumber ?? (trip && date ? tripDayNumber(trip, date) : null)
  const time = linked?.item.time || linked?.item.startTime || ''
  return {
    date,
    dayNumber,
    time,
    item: linked?.item ?? null,
    label: formatScheduleLabel(dayNumber, time),
  }
}

/** @param {number | null} dayNumber @param {string} time */
export function formatScheduleLabel(dayNumber, time) {
  if (!dayNumber && !time) return ''
  const day = dayNumber ? `Day ${dayNumber}` : ''
  const clock = time ? formatTime(time) : ''
  return [day, clock].filter(Boolean).join(' · ')
}

/** @param {import('../types').Place} place */
export function formatPlaceCost(place) {
  if (place.estimatedCost == null || Number.isNaN(Number(place.estimatedCost))) return ''
  return formatMoney(place.estimatedCost, place.currency || 'EUR')
}

/** @param {import('../types').Place} place */
export function formatPlaceRating(place) {
  if (place.rating == null) return ''
  return `★ ${Number(place.rating).toFixed(1)}`
}
