/**
 * Cloud trip activity. READ only from the application client.
 * Actor attribution is stored by Phase 5B triggers / log_activity from auth.uid().
 * This module does not write to the local Travel OS store.
 */

import { formatActivity } from '../activity.js'
import { isCloudTripId } from './cloud.js'

export const CLOUD_ACTIVITY_COLUMNS = ['id', 'trip_id', 'actor_id', 'type', 'meta', 'created_at'].join(', ')

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudActivityError(error) {
  const message = redactSecrets(String(error?.message ?? error ?? '').trim())
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim/i.test(message)) {
    return 'Sign in to see activity on this trip.'
  }
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    return 'That activity is not available to this account.'
  }
  if (/column|relation|schema cache/i.test(message)) {
    return 'Activity could not be loaded just now.'
  }
  return 'Activity could not be loaded just now.'
}

export function mapCloudActivity(row) {
  if (!row) return null
  const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? row.meta : {}
  return {
    id: row.id,
    tripId: row.trip_id,
    actorId: row.actor_id,
    type: row.type,
    meta,
    createdAt: row.created_at,
    source: 'cloud',
  }
}

export function cloudActivityActor(members = [], actorId, currentUserId) {
  if (actorId && actorId === currentUserId) {
    return { name: 'You', shortName: 'You', initials: 'YO' }
  }
  const member = members.find((person) => person.userId === actorId)
  if (!member) return { name: 'Someone', shortName: 'Someone', initials: '?' }
  return {
    name: member.name || member.shortName || 'Someone',
    shortName: member.shortName || member.name || 'Someone',
    initials: member.initials || '?',
  }
}

export function formatCloudActivity(activity, members = [], currentUserId, extras = {}) {
  const actor = cloudActivityActor(members, activity?.actorId, currentUserId)
  const title = activity?.meta?.title
  const question = activity?.meta?.question
  const destination = extras.destination

  switch (activity?.type) {
    case 'place.add':
      return `${actor.shortName} added “${title}” to Places`
    case 'place.update':
      return `${actor.shortName} updated “${title}”`
    case 'place.delete':
      return `${actor.shortName} removed “${title}”`
    case 'booking.add':
      return `${actor.shortName} added “${title}”`
    case 'booking.update':
      return `${actor.shortName} updated “${title}”`
    case 'booking.delete':
      return `${actor.shortName} removed “${title}”`
    case 'expense.add':
      return `${actor.shortName} added an expense`
    case 'expense.update':
      return `${actor.shortName} updated an expense`
    case 'expense.delete':
      return `${actor.shortName} removed an expense`
    case 'itinerary.add':
      return title ? `${actor.shortName} added “${title}”` : `${actor.shortName} updated the itinerary`
    case 'itinerary.update':
      return destination
        ? `${actor.shortName} updated the ${destination} itinerary`
        : `${actor.shortName} updated the itinerary`
    case 'itinerary.delete':
      return title ? `${actor.shortName} removed “${title}”` : `${actor.shortName} updated the itinerary`
    case 'poll.add':
      return `${actor.shortName} asked “${title}”`
    case 'poll.update':
      return `${actor.shortName} updated “${title}”`
    case 'poll.delete':
      return `${actor.shortName} removed a poll`
    case 'poll.vote':
      return `${actor.shortName} voted in “${question || title}”`
    case 'booking.document.add':
      return title ? `${actor.shortName} added “${title}”` : `${actor.shortName} added a booking document`
    case 'booking.document.delete':
      return title ? `${actor.shortName} removed “${title}”` : `${actor.shortName} removed a booking document`
    default: {
      const users = members.map((member) => ({
        id: member.userId,
        name: member.name || 'Someone',
        shortName: member.shortName || member.name || 'Someone',
      }))
      if (activity?.actorId && !users.some((user) => user.id === activity.actorId)) {
        users.push({ id: activity.actorId, name: actor.name, shortName: actor.shortName })
      }
      return formatActivity(activity, users, currentUserId)
    }
  }
}

export function formatCloudActivityTime(iso, now = Date.now()) {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const delta = Math.max(0, now - then)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return 'Just now'
  if (delta < hour) {
    const minutes = Math.floor(delta / minute)
    return `${minutes} min ago`
  }
  if (delta < day) {
    const hours = Math.floor(delta / hour)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (delta < 7 * day) {
    const days = Math.floor(delta / day)
    return days === 1 ? 'Yesterday' : `${days} days ago`
  }
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export async function getCloudTripActivity(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) return { activities: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { activities: [], error: 'Sign in to see activity on this trip.' }
  if (!isCloudTripId(tripId)) return { activities: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('activities')
    .select(CLOUD_ACTIVITY_COLUMNS)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if (error) return { activities: [], error: formatCloudActivityError(error) }

  return {
    activities: (data ?? []).map(mapCloudActivity).filter(Boolean),
    error: null,
  }
}
