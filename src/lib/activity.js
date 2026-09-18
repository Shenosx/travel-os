import { ROLE_LABEL } from './people.js'
import { displayName, getUserById } from '../data/mock.js'

/**
 * @param {import('../types').Activity} activity
 * @param {import('../types').User[]} users
 * @param {string} currentUserId
 */
export function formatActivity(activity, users, currentUserId) {
  const actor = displayName(getUserById(activity.actorId, users), currentUserId)
  const title = activity.meta?.title
  const name = activity.meta?.name
  const role = activity.meta?.role

  switch (activity.type) {
    case 'itinerary.add':
      return `${actor} added “${title}”`
    case 'expense.add':
      return `${actor} added “${title}”`
    case 'expense.update':
      return `${actor} updated “${title}”`
    case 'expense.delete':
      return `${actor} removed “${title}”`
    case 'place.add':
      return `${actor} saved ${title}`
    case 'place.update':
      return `${actor} updated ${title}`
    case 'place.delete':
      return `${actor} removed ${title}`
    case 'booking.add':
      return `${actor} added ${title}`
    case 'booking.update':
      return `${actor} updated ${title}`
    case 'booking.delete':
      return `${actor} removed ${title}`
    case 'member.invite':
      return `${actor} invited ${name}${role ? ` as ${ROLE_LABEL[role] ?? role}` : ''}`
    case 'member.join': {
      const joinedYou = activity.actorId === currentUserId || name === 'You'
      return joinedYou ? 'You joined the trip' : `${name || actor} joined the trip`
    }
    case 'member.role':
      return `${actor} made ${name} ${ROLE_LABEL[role] ?? role}`
    case 'member.remove':
      return `${actor} removed ${name}`
    case 'itinerary.update':
      return `${actor} updated ${title || 'the itinerary'}`
    case 'poll.vote':
      return `${actor} voted for ${title}`
    default:
      return activity.meta?.message || `${actor} updated the trip`
  }
}
