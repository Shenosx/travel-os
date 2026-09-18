/**
 * Single pendingOps queue helpers.
 * Cloud-targeted ops may sync. Local-only ops stay queued and are never uploaded.
 */

import { isCloudTripId } from '../trips/cloud.js'
import { isClientRowId } from '../trips/clientRowId.js'

export const PENDING_OP_STATUSES = Object.freeze([
  'pending',
  'syncing',
  'retryable',
  'failed',
  'blocked',
])

export const SUPPORTED_SYNC_OPS = Object.freeze([
  'trip:create',
  'trip:update',
  'trip:delete',
  'place:create',
  'place:update',
  'place:delete',
  'booking:create',
  'booking:update',
  'booking:delete',
  'expense:create',
  'expense:update',
  'expense:delete',
  'itinerary_day:create',
  'itinerary_day:update',
  'itinerary_day:delete',
  'itinerary_item:create',
  'itinerary_item:update',
  'itinerary_item:delete',
])

export const UNSUPPORTED_SYNC_ENTITIES = Object.freeze([
  'poll',
  'vote',
  'document',
  'invitation',
  'member',
  'activity',
])

const SECRET_KEY_RE =
  /^(access_token|accesstoken|refresh_token|refreshtoken|password|service_role|servicerole|service_role_key|signedurl|signed_url|token|authorization|anon_key|anonkey|apikey|api_key|secret)$/i

const FORBIDDEN_WRITE_KEYS = new Set([
  'owner_id',
  'ownerId',
  'created_by',
  'createdBy',
  'updated_by',
  'updatedBy',
  'actor_id',
  'actorId',
  'session',
  'headers',
  'authorization',
])

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isSecretOpKey(key) {
  return SECRET_KEY_RE.test(String(key ?? ''))
}

export function stripSecrets(value, depth = 0) {
  if (depth > 8 || value == null) return value
  if (Array.isArray(value)) return value.map((entry) => stripSecrets(entry, depth + 1))
  if (!isRecord(value)) return value
  const next = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretOpKey(key) || FORBIDDEN_WRITE_KEYS.has(key)) continue
    next[key] = stripSecrets(entry, depth + 1)
  }
  return next
}

export function opKey(op) {
  return `${String(op?.entity ?? '')}:${String(op?.action ?? '')}`
}

export function isSupportedSyncOp(op) {
  return SUPPORTED_SYNC_OPS.includes(opKey(op))
}

export function hasCloudTripTarget(op) {
  return isCloudTripId(op?.cloudTripId)
}

export function isSyncableOp(op) {
  if (!op || !isSupportedSyncOp(op)) return false
  if (!hasCloudTripTarget(op)) return false
  if (opKey(op) === 'trip:create' && op.cloudTripId !== op.cloudEntityId) return false
  if (op.status === 'failed' || op.status === 'blocked') return false
  return true
}

export function normalizePendingOp(op = {}) {
  const createdAt = typeof op.createdAt === 'string' && op.createdAt ? op.createdAt : new Date().toISOString()
  const status = PENDING_OP_STATUSES.includes(op.status) ? op.status : 'pending'
  const payload = stripSecrets(cloneJson(op.payload) ?? {})
  return {
    id: typeof op.id === 'string' && op.id ? op.id : `op-${Math.random().toString(36).slice(2, 10)}`,
    entity: String(op.entity ?? ''),
    action: String(op.action ?? ''),
    payload,
    createdAt,
    status,
    cloudTripId: typeof op.cloudTripId === 'string' && op.cloudTripId ? op.cloudTripId : null,
    localEntityId: typeof op.localEntityId === 'string' && op.localEntityId ? op.localEntityId : null,
    cloudEntityId: typeof op.cloudEntityId === 'string' && op.cloudEntityId ? op.cloudEntityId : null,
    attemptCount: Number.isFinite(Number(op.attemptCount)) ? Number(op.attemptCount) : 0,
    lastAttemptAt: typeof op.lastAttemptAt === 'string' ? op.lastAttemptAt : null,
    nextAttemptAt: typeof op.nextAttemptAt === 'string' ? op.nextAttemptAt : null,
    lastError: typeof op.lastError === 'string' ? op.lastError : null,
    blockedBy: typeof op.blockedBy === 'string' ? op.blockedBy : null,
    dependsOn: typeof op.dependsOn === 'string' ? op.dependsOn : null,
    authUserId: typeof op.authUserId === 'string' && isClientRowId(op.authUserId) ? op.authUserId : null,
  }
}

export function pendingOpBelongsToUser(op, userId) {
  if (!op?.authUserId) return true
  return Boolean(userId && op.authUserId === userId)
}

export function pendingOpsForUser(ops = [], userId) {
  return (Array.isArray(ops) ? ops : []).filter((op) => pendingOpBelongsToUser(op, userId))
}

export function sortPendingOps(ops = []) {
  return ops
    .map((op, index) => ({ op, index }))
    .sort((a, b) => {
      const time = String(a.op.createdAt ?? '').localeCompare(String(b.op.createdAt ?? ''))
      if (time) return time
      return a.index - b.index
    })
    .map((entry) => entry.op)
}

export function summarizePendingOps(ops = []) {
  const list = Array.isArray(ops) ? ops : []
  const failed = list.filter((op) => op.status === 'failed' || op.status === 'blocked')
  const syncable = list.filter((op) => isSyncableOp(op) && op.status !== 'syncing')
  const waiting = syncable.filter((op) => op.status === 'pending' || op.status === 'retryable')
  return {
    total: list.length,
    syncable: syncable.length,
    waiting: waiting.length,
    failed: failed.length,
    localOnly: list.filter((op) => !hasCloudTripTarget(op)).length,
  }
}

export function formatSyncSummary(result = {}) {
  if (result.reason === 'offline') return 'Offline'
  if (result.reason === 'auth') {
    return result.waiting ? `${result.waiting} ${result.waiting === 1 ? 'change' : 'changes'} waiting for sign-in` : 'Sign in to sync'
  }
  if (result.synced > 0) {
    return `${result.synced} ${result.synced === 1 ? 'change' : 'changes'} synced`
  }
  if (result.failed > 0) return 'Sync needs attention'
  if (result.waiting > 0) {
    return `${result.waiting} ${result.waiting === 1 ? 'change' : 'changes'} waiting`
  }
  return 'Synced'
}

export function inspectableFailedOps(ops = []) {
  return (Array.isArray(ops) ? ops : [])
    .filter((op) => op.status === 'failed' || op.status === 'blocked')
    .map((op) => ({
      entity: op.entity,
      action: op.action,
      createdAt: op.createdAt,
      error: op.lastError,
    }))
}
