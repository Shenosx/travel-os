/**
 * One Local → Cloud sync coordinator for the pendingOps queue.
 * Processes Cloud-targeted operations only. Does not create Cloud trips from local-only data.
 * Does not read or write local trip/expense/place collections.
 */

import { getSupabaseClient } from '../supabase/client.js'
import { isCloudTripId, createCloudTrip, updateCloudTrip, deleteCloudTrip } from '../trips/cloud.js'
import { isClientRowId } from '../trips/clientRowId.js'
import { createCloudPlace, updateCloudPlace, deleteCloudPlace } from '../trips/places.js'
import { createCloudBooking, updateCloudBooking, deleteCloudBooking } from '../trips/bookings.js'
import { createCloudExpense, updateCloudExpense, deleteCloudExpense } from '../trips/expenses.js'
import {
  createCloudItineraryDay,
  createCloudItineraryItem,
  deleteCloudItineraryDay,
  deleteCloudItineraryItem,
  updateCloudItineraryDay,
  updateCloudItineraryItem,
} from '../trips/itinerary.js'
import {
  formatSyncSummary,
  hasCloudTripTarget,
  inspectableFailedOps,
  isSupportedSyncOp,
  normalizePendingOp,
  opKey,
  sortPendingOps,
  stripSecrets,
  summarizePendingOps,
  UNSUPPORTED_SYNC_ENTITIES,
} from './pendingOps.js'

export const MAX_SYNC_ATTEMPTS = 8
export const BACKOFF_MS = Object.freeze([800, 2000, 5000, 15000, 30000, 60000, 60000, 60000])

const DEFAULT_MUTATIONS = {
  createCloudTrip,
  updateCloudTrip,
  deleteCloudTrip,
  createCloudPlace,
  updateCloudPlace,
  deleteCloudPlace,
  createCloudBooking,
  updateCloudBooking,
  deleteCloudBooking,
  createCloudExpense,
  updateCloudExpense,
  deleteCloudExpense,
  createCloudItineraryDay,
  updateCloudItineraryDay,
  deleteCloudItineraryDay,
  createCloudItineraryItem,
  updateCloudItineraryItem,
  deleteCloudItineraryItem,
}

export function readOnline(source = globalThis.navigator) {
  if (!source || typeof source.onLine !== 'boolean') return true
  return source.onLine
}

export function backoffMs(attemptCount, schedule = BACKOFF_MS) {
  const index = Math.max(0, Number(attemptCount) || 0)
  return schedule[Math.min(index, schedule.length - 1)]
}

export function classifySyncFailure(message, { action } = {}) {
  const text = String(message ?? '')
  if (/could not reach the cloud|failed to fetch|network|timeout|timed out/i.test(text)) {
    return 'retryable'
  }
  if (/sign in to/i.test(text)) return 'auth'
  if (/not connected on this device/i.test(text)) return 'retryable'
  if (action === 'delete' && /could not be deleted|could not be found|cannot be changed/i.test(text)) {
    return 'missing-delete'
  }
  if (
    /viewers cannot|you can view|you can only change|shares must add up|check the |use a 3-letter|add a |enter an amount|choose |doesn'?t belong|not on this cloud trip|cannot be changed|could not be found|invalid uuid|cross-trip|not available to this account/i.test(
      text,
    )
  ) {
    return 'permanent'
  }
  if (/this change cannot be synced/i.test(text)) return 'permanent'
  return 'retryable'
}

function isDue(op, nowIso) {
  if (!op.nextAttemptAt) return true
  return String(op.nextAttemptAt) <= String(nowIso)
}

function parentOp(op, ops) {
  if (op.dependsOn) {
    return ops.find((item) => item.id === op.dependsOn) ?? null
  }
  const payload = op.payload && typeof op.payload === 'object' ? op.payload : {}
  const refs = [payload.placeId, payload.place_id, payload.bookingId, payload.booking_id, payload.dayId, payload.day_id]
  return (
    ops.find((item) => {
      if (item.id === op.id || item.action !== 'create') return false
      if (!hasCloudTripTarget(item)) return false
      return refs.some((ref) => ref && (ref === item.cloudEntityId || ref === item.localEntityId))
    }) ?? null
  )
}

function mutationError(result) {
  if (!result) return 'This change could not be synced.'
  if (result.error) return result.error
  return null
}

function mutationSucceeded(op, result) {
  if (!result) return false
  if (result.error) return false
  if (op.action === 'delete') return result.ok === true
  return Boolean(result.trip || result.place || result.booking || result.expense || result.day || result.item || result.ok)
}

async function executeOp(op, ctx) {
  const key = opKey(op)
  const mutations = ctx.mutations
  const client = ctx.client
  const session = ctx.session
  const tripId = op.cloudTripId
  const id = op.cloudEntityId
  const payload = stripSecrets(op.payload ?? {})

  if (UNSUPPORTED_SYNC_ENTITIES.includes(op.entity) || !isSupportedSyncOp(op)) {
    return { error: 'This change cannot be synced automatically.' }
  }
  if (!isCloudTripId(tripId)) {
    return { error: 'This change cannot be synced automatically.' }
  }
  if (id && !isClientRowId(id)) {
    return { error: 'This change cannot be synced automatically.' }
  }

  switch (key) {
    case 'trip:create':
      return mutations.createCloudTrip({ client, session, input: payload, id })
    case 'trip:update':
      return mutations.updateCloudTrip({ client, session, id: id || tripId, changes: payload })
    case 'trip:delete':
      return mutations.deleteCloudTrip({ client, session, id: id || tripId })
    case 'place:create':
      return mutations.createCloudPlace({ client, session, tripId, input: payload, id })
    case 'place:update':
      return mutations.updateCloudPlace({ client, session, id, changes: payload })
    case 'place:delete':
      return mutations.deleteCloudPlace({ client, session, id })
    case 'booking:create':
      return mutations.createCloudBooking({ client, session, tripId, input: payload, id })
    case 'booking:update':
      return mutations.updateCloudBooking({ client, session, id, changes: payload })
    case 'booking:delete':
      return mutations.deleteCloudBooking({ client, session, id })
    case 'expense:create':
      return mutations.createCloudExpense({
        client,
        session,
        tripId,
        tripCurrency: payload.convertedCurrency ?? payload.currency,
        input: { ...payload, tripId, id },
        id,
      })
    case 'expense:update':
      return mutations.updateCloudExpense({
        client,
        session,
        tripId,
        tripCurrency: payload.convertedCurrency ?? payload.currency,
        input: { ...payload, tripId, id },
        id,
      })
    case 'expense:delete':
      return mutations.deleteCloudExpense({ client, session, id })
    case 'itinerary_day:create':
      return mutations.createCloudItineraryDay({ client, session, tripId, input: payload, id })
    case 'itinerary_day:update':
      return mutations.updateCloudItineraryDay({ client, session, id, changes: payload })
    case 'itinerary_day:delete':
      return mutations.deleteCloudItineraryDay({ client, session, id })
    case 'itinerary_item:create':
      return mutations.createCloudItineraryItem({ client, session, tripId, input: payload, id })
    case 'itinerary_item:update':
      return mutations.updateCloudItineraryItem({ client, session, id, changes: payload })
    case 'itinerary_item:delete':
      return mutations.deleteCloudItineraryItem({ client, session, id })
    default:
      return { error: 'This change cannot be synced automatically.' }
  }
}

function markRetry(op, error, now, attempt) {
  const nextAttempt = attempt + 1
  if (nextAttempt >= MAX_SYNC_ATTEMPTS) {
    return {
      ...op,
      status: 'failed',
      attemptCount: nextAttempt,
      lastAttemptAt: now,
      nextAttemptAt: null,
      lastError: error,
    }
  }
  const delay = backoffMs(attempt)
  return {
    ...op,
    status: 'retryable',
    attemptCount: nextAttempt,
    lastAttemptAt: now,
    nextAttemptAt: new Date(new Date(now).getTime() + delay).toISOString(),
    lastError: error,
  }
}

export function mergeSyncedQueue(current, startedIds, processedById, removedIds) {
  const extras = current.filter((op) => !startedIds.has(op.id))
  const next = []
  for (const op of current) {
    if (!startedIds.has(op.id)) continue
    if (removedIds.has(op.id)) continue
    next.push(processedById.get(op.id) ?? op)
  }
  return [...next, ...extras]
}

export function createCloudSyncCoordinator(options = {}) {
  let inflight = null
  const mutations = { ...DEFAULT_MUTATIONS, ...(options.mutations ?? {}) }

  async function run(reason = 'auto') {
    const now = options.now ? options.now() : new Date().toISOString()
    const online = options.getOnline ? options.getOnline() : readOnline()
    const session = options.getSession ? options.getSession() : null
    const ops = (options.getOps ? options.getOps() : []).map(normalizePendingOp)
    const counts = () => {
      const summary = summarizePendingOps(options.getOps ? options.getOps() : ops)
      return {
        waiting: summary.waiting,
        failed: summary.failed,
      }
    }

    if (!online) {
      return { ok: true, synced: 0, reason: 'offline', ...counts(), ops }
    }
    if (!session?.user) {
      return { ok: true, synced: 0, reason: 'auth', ...counts(), ops }
    }

    const startedIds = new Set(ops.map((op) => op.id))
    const processedById = new Map(ops.map((op) => [op.id, op]))
    const removedIds = new Set()
    const order = sortPendingOps(ops)
    let synced = 0
    let stopped = null
    const client = options.getClient ? options.getClient() : getSupabaseClient()
    const ctx = { mutations, client, session }

    function remainingParent(op) {
      return parentOp(
        op,
        [...processedById.values()].filter((item) => !removedIds.has(item.id)),
      )
    }

            function canProcess(op) {
      if (op.status === 'failed' || op.status === 'blocked') return false
      if (!hasCloudTripTarget(op)) return false
      if (!isSupportedSyncOp(op)) return false
      if (reason !== 'manual' && !isDue(op, now)) return false
      return op.status === 'pending' || op.status === 'retryable' || op.status === 'syncing'
    }

    let passSynced
    do {
      passSynced = 0
      for (const op of order) {
        if (removedIds.has(op.id) || stopped) continue
        const current = processedById.get(op.id) ?? op
        if (hasCloudTripTarget(current) && !isSupportedSyncOp(current)) {
          processedById.set(current.id, {
            ...current,
            status: 'failed',
            lastError: 'This change cannot be synced automatically.',
          })
          continue
        }
        if (current.authUserId && current.authUserId !== session.user.id) continue
        if (!canProcess(current)) continue

        const parent = remainingParent(current)
        if (parent) {
          if (parent.status === 'failed' || parent.status === 'blocked') {
            processedById.set(current.id, {
              ...current,
              status: 'blocked',
              blockedBy: parent.id,
              lastError: 'Waiting on another change that could not be synced.',
            })
          }
          continue
        }

        processedById.set(current.id, { ...current, status: 'syncing', lastAttemptAt: now })
        const result = await executeOp(current, ctx)
        const error = mutationError(result)
        if (!error && mutationSucceeded(current, result)) {
          removedIds.add(current.id)
          processedById.delete(current.id)
          synced += 1
          passSynced += 1
          continue
        }

        const kind = classifySyncFailure(error, { action: current.action })
        if (kind === 'missing-delete') {
          removedIds.add(current.id)
          processedById.delete(current.id)
          synced += 1
          passSynced += 1
          continue
        }
        if (kind === 'auth') {
          processedById.set(current.id, { ...current, status: 'pending', lastError: 'Sign in to sync.' })
          stopped = 'auth'
          break
        }
        if (kind === 'permanent') {
          processedById.set(current.id, {
            ...current,
            status: 'failed',
            attemptCount: current.attemptCount + 1,
            lastAttemptAt: now,
            lastError: error,
          })
          continue
        }
        processedById.set(current.id, markRetry(current, error || 'Could not reach the cloud just now.', now, current.attemptCount))
      }
    } while (passSynced > 0 && !stopped)

    if (options.patchOps) {
      options.patchOps((current) =>
        mergeSyncedQueue(current.map(normalizePendingOp), startedIds, processedById, removedIds),
      )
    }

    const nextOps = options.getOps ? options.getOps() : [...processedById.values()]
    const summary = summarizePendingOps(nextOps)
    return {
      ok: true,
      reason: stopped || reason,
      synced,
      waiting: summary.waiting,
      failed: summary.failed,
      message: formatSyncSummary({
        reason: stopped || (online ? reason : 'offline'),
        synced,
        waiting: summary.waiting,
        failed: summary.failed,
      }),
      failedOps: inspectableFailedOps(nextOps),
    }
  }

  function syncNow(reason = 'manual') {
    if (inflight) return inflight
    inflight = Promise.resolve()
      .then(() => run(reason))
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  return {
    syncNow,
    get inflight() {
      return inflight
    },
    mutations,
  }
}

export function isNetworkFailureMessage(message) {
  return classifySyncFailure(message) === 'retryable' && /could not reach|failed to fetch|network|timeout/i.test(String(message ?? ''))
}

export async function runOrQueueCloudMutation(args = {}) {
  const op = normalizePendingOp(args.op ?? {})
  const enqueue = args.enqueue
  const mutate = args.mutate
  const online = args.online ?? readOnline()
  const session = args.session ?? null

  if (!hasCloudTripTarget(op) || !isSupportedSyncOp(op)) {
    if (typeof mutate === 'function' && online && session?.user) return mutate(op)
    return { queued: false, error: 'This change cannot be synced automatically.' }
  }

  if (!session?.user || !online) {
    enqueue?.(op)
    return { queued: true, error: null }
  }

  const result = await mutate(op)
  if (result?.error && isNetworkFailureMessage(result.error)) {
    enqueue?.(op)
    return { queued: true, error: null }
  }
  return { queued: false, ...result }
}

export { formatSyncSummary, inspectableFailedOps, summarizePendingOps }
