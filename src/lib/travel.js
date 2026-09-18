import { placeHasLocation } from './places.js'

const EARTH_KM = 6371

/**
 * Great-circle distance in kilometres. Returns null when either point is missing.
 * Ready to be replaced by a routing API later.
 *
 * @param {{ latitude?: number, longitude?: number } | null} from
 * @param {{ latitude?: number, longitude?: number } | null} to
 */
export function haversineKm(from, to) {
  if (
    from?.latitude == null ||
    from?.longitude == null ||
    to?.latitude == null ||
    to?.longitude == null
  ) {
    return null
  }
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(to.latitude - from.latitude)
  const dLng = toRad(to.longitude - from.longitude)
  const lat1 = toRad(from.latitude)
  const lat2 = toRad(to.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Mock urban travel time, rounded to 5 minutes. Not a real route.
 * @param {{ latitude?: number, longitude?: number } | null} from
 * @param {{ latitude?: number, longitude?: number } | null} to
 */
export function mockTravelMinutes(from, to) {
  const km = haversineKm(from, to)
  if (km == null) return null
  const raw = (km / 18) * 60
  return Math.max(8, Math.round(raw / 5) * 5)
}

/** @param {number | null} minutes */
export function mockTravelLabel(minutes) {
  if (minutes == null) return null
  return `about ${minutes} min`
}

function hashUnit(id) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % 1000) / 1000
}

/**
 * Project places onto a 0–100 schematic canvas from lat/lng bounds.
 * Falls back to stored mapX/mapY, then a stable hash. Destination-agnostic.
 *
 * @param {import('../types').Place[]} places
 * @returns {Record<string, { mapX: number, mapY: number }>}
 */
export function schematicPositions(places) {
  const located = places.filter(placeHasLocation)
  let minLat = 0
  let maxLat = 1
  let minLng = 0
  let maxLng = 1
  if (located.length) {
    const lats = located.map((place) => place.latitude)
    const lngs = located.map((place) => place.longitude)
    minLat = Math.min(...lats)
    maxLat = Math.max(...lats)
    minLng = Math.min(...lngs)
    maxLng = Math.max(...lngs)
    const padLat = Math.max((maxLat - minLat) * 0.18, 0.004)
    const padLng = Math.max((maxLng - minLng) * 0.18, 0.004)
    minLat -= padLat
    maxLat += padLat
    minLng -= padLng
    maxLng += padLng
  }

  /** @type {Record<string, { mapX: number, mapY: number }>} */
  const positions = {}
  for (const place of places) {
    if (placeHasLocation(place) && located.length) {
      const spanLat = maxLat - minLat || 1
      const spanLng = maxLng - minLng || 1
      positions[place.id] = {
        mapX: ((place.longitude - minLng) / spanLng) * 80 + 10,
        mapY: (1 - (place.latitude - minLat) / spanLat) * 80 + 10,
      }
      continue
    }
    if (place.mapX != null && place.mapY != null) {
      positions[place.id] = { mapX: place.mapX, mapY: place.mapY }
      continue
    }
    positions[place.id] = {
      mapX: 28 + hashUnit(place.id) * 44,
      mapY: 28 + hashUnit(`${place.id}-y`) * 44,
    }
  }
  return positions
}

/**
 * @param {import('../types').ItineraryItem} item
 * @param {import('../types').Place[]} places
 */
export function itemLocation(item, places) {
  if (!item?.placeId) return null
  const place = places.find((entry) => entry.id === item.placeId)
  if (!placeHasLocation(place)) return null
  return { latitude: place.latitude, longitude: place.longitude, place }
}

/**
 * Mock travel between consecutive located itinerary items on the same day.
 * @param {import('../types').ItineraryItem} from
 * @param {import('../types').ItineraryItem} to
 * @param {import('../types').Place[]} places
 */
export function travelBetweenItems(from, to, places) {
  const start = itemLocation(from, places)
  const end = itemLocation(to, places)
  if (!start || !end) return null
  const minutes = mockTravelMinutes(start, end)
  return {
    minutes,
    label: mockTravelLabel(minutes),
  }
}
