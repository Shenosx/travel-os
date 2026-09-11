import { displayName, getUserById } from '../data/mock.js'

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
