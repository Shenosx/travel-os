/**
 * Pending-ops gate for Local → Cloud migration.
 * Unresolved Cloud or source-trip ops block migration. Migration is never enqueued.
 */

import { PENDING_OP_BLOCKING_STATUSES, SYNC_FIRST_MESSAGE } from './types.js'

export function localEntityIdsForTrip(args = {}) {
  const ids = new Set()
  const trip = args.localTrip
  if (trip?.id) ids.add(trip.id)
  for (const place of args.places ?? []) if (place?.id) ids.add(place.id)
  for (const booking of args.bookings ?? []) {
    if (booking?.id) ids.add(booking.id)
    for (const doc of booking?.documents ?? []) if (doc?.id) ids.add(doc.id)
  }
  for (const expense of args.expenses ?? []) if (expense?.id) ids.add(expense.id)
  for (const poll of args.polls ?? []) {
    if (poll?.id) ids.add(poll.id)
    for (const option of poll?.options ?? []) if (option?.id) ids.add(option.id)
  }
  for (const invitation of args.invitations ?? []) if (invitation?.id) ids.add(invitation.id)
  for (const activity of args.activities ?? []) if (activity?.id) ids.add(activity.id)
  for (const day of args.itinerary?.days ?? []) {
    for (const item of day?.items ?? []) if (item?.id) ids.add(item.id)
  }
  return ids
}

function payloadTripId(op) {
  const payload = op?.payload
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.tripId === 'string' && payload.tripId) return payload.tripId
  if (typeof payload.trip_id === 'string' && payload.trip_id) return payload.trip_id
  return null
}

export function findRelevantPendingOps(args = {}) {
  const ops = Array.isArray(args.pendingOps) ? args.pendingOps : []
  const targetCloudTripId = args.targetCloudTripId || null
  const sourceTripId = args.sourceTripId || args.localTrip?.id || null
  const localIds = args.localEntityIds instanceof Set ? args.localEntityIds : localEntityIdsForTrip(args)

  return ops.filter((op) => {
    if (!PENDING_OP_BLOCKING_STATUSES.includes(op?.status)) return false
    if (targetCloudTripId && op.cloudTripId === targetCloudTripId) return true
    if (op.localEntityId && localIds.has(op.localEntityId)) return true
    if (sourceTripId && payloadTripId(op) === sourceTripId) return true
    return false
  })
}

export function pendingOpsBlockReason(ops = []) {
  if (!ops.length) return null
  return SYNC_FIRST_MESSAGE
}
