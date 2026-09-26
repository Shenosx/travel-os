/**
 * Versioned local persistence for Travel OS.
 * One snapshot is the client-side source of truth until a backend exists.
 *
 * pendingOps is the one authoritative local mutation queue.
 * Cloud-targeted ops are processed by src/lib/sync/cloudSync.js.
 * Local-only ops are stored and never uploaded automatically.
 * tripMigrations records Local → Cloud move progress. It is not a Cloud table.
 */

import { sanitizeTripMigration } from '../lib/migration/mappings.js'
import { createSeedSnapshot } from './seed.js'

export const STORAGE_VERSION = 1

export const STORAGE_KEY = `travel-os:data:v${STORAGE_VERSION}`

export function getUserStorageKey(userId) {
  if (!userId) return STORAGE_KEY

  return `travel-os:data:v${STORAGE_VERSION}:user:${userId}`
}

/**
 * Persist only after auth identity is known and in-memory collections
 * already belong to that storage key. Prevents writing guest/A data into B.
 */
export function canPersistLocalSnapshot({ authLoading, hydratedKey, accountStorageKey }) {
  return !authLoading && hydratedKey != null && hydratedKey === accountStorageKey
}

/** New Supabase accounts start with mock users but no local trips/seed destinations. */
export function createEmptyAccountSnapshot() {
  const seed = createSeedSnapshot()
  return {
    version: STORAGE_VERSION,
    users: clone(seed.users),
    trips: [],
    expenses: [],
    repayments: [],
    itineraries: [],
    places: [],
    bookings: [],
    invitations: [],
    activities: [],
    polls: [],
    pendingOps: [],
    tripMigrations: [],
    packingCategories: [],
    packingItems: [],
    checklistCategories: [],
    checklistItems: [],
    notes: [],
    memories: [],
  }
}

/** Load the snapshot for a Supabase auth UUID, or guest seed when signed out. */
export function loadSnapshotForAuthUser(authUserId) {
  const key = getUserStorageKey(authUserId)
  const seed = authUserId ? createEmptyAccountSnapshot() : createSeedSnapshot()
  return { key, snapshot: loadSnapshot(seed, key) }
}

const PERSONAL_COLLECTIONS = [
  'packingCategories',
  'packingItems',
  'checklistCategories',
  'checklistItems',
  'notes',
  'memories',
]

const COLLECTIONS = [
  'users',
  'trips',
  'expenses',
  'repayments',
  'itineraries',
  'places',
  'bookings',
  'invitations',
  'activities',
  'polls',
  'pendingOps',
  'tripMigrations',
  ...PERSONAL_COLLECTIONS,
]

const BINARY_MEDIA_KEYS = new Set(['blob', 'src', 'objectURL', 'objectUrl', 'file', 'arrayBuffer'])

/** @type {Record<number, (data: Record<string, unknown>) => Record<string, unknown>>} */
const MIGRATIONS = {
  0: (data) => ({
    ...data,
    pendingOps: Array.isArray(data.pendingOps) ? data.pendingOps : [],
  }),
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function readRaw(key) {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasId(value) {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
}

function sanitizeUsers(value, fallback) {
  if (!Array.isArray(value)) return clone(fallback)
  const next = value.filter(hasId)
  return next.length ? next : clone(fallback)
}

function sanitizeTrips(value) {
  if (!Array.isArray(value)) return []
  return value.filter(hasId).map((trip) => ({
    ...trip,
    members: Array.isArray(trip.members)
      ? trip.members.filter((member) => isRecord(member) && typeof member.userId === 'string')
      : [],
  }))
}

function sanitizeExpenses(value) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item) =>
      hasId(item) &&
      typeof item.tripId === 'string' &&
      Array.isArray(item.shares) &&
      item.shares.every((share) => isRecord(share) && typeof share.userId === 'string'),
  )
}

function sanitizeRepayments(value) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item) =>
      hasId(item) &&
      typeof item.tripId === 'string' &&
      typeof item.fromUserId === 'string' &&
      typeof item.toUserId === 'string' &&
      Number.isFinite(Number(item.amount)) &&
      Number(item.amount) > 0 &&
      typeof item.paymentMethod === 'string',
  )
}

function sanitizeItineraries(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => isRecord(entry) && typeof entry.tripId === 'string' && Array.isArray(entry.days))
    .map((entry) => ({
      ...entry,
      days: entry.days
        .filter((day) => isRecord(day) && typeof day.date === 'string' && Array.isArray(day.items))
        .map((day) => ({
          ...day,
          items: day.items.filter(hasId),
        })),
    }))
}

function sanitizeKeyed(value, extra) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => hasId(item) && extra(item))
}

function sanitizePendingOps(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => hasId(item) && typeof item.status === 'string')
    .map((item) => sanitizePendingOp(item))
}

function sanitizeTripMigrations(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => sanitizeTripMigration(item))
    .filter((item) => item.localTripId)
}

function stripBinaryMedia(item) {
  const next = { ...item }
  for (const key of BINARY_MEDIA_KEYS) delete next[key]
  return next
}

/** Personal rows are trip + user scoped. Missing collections hydrate to []. */
function sanitizePersonal(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item) =>
        hasId(item) && typeof item.tripId === 'string' && typeof item.userId === 'string',
    )
    .map(stripBinaryMedia)
}

const PENDING_OP_SECRET_RE =
  /^(access_token|accesstoken|refresh_token|refreshtoken|password|service_role|servicerole|signedurl|signed_url|token|authorization|anon_key|anonkey|apikey|secret)$/i

function stripPendingSecrets(value, depth = 0) {
  if (depth > 8 || value == null) return value
  if (Array.isArray(value)) return value.map((entry) => stripPendingSecrets(entry, depth + 1))
  if (!isRecord(value)) return value
  const next = {}
  for (const [key, entry] of Object.entries(value)) {
    if (PENDING_OP_SECRET_RE.test(key)) continue
    next[key] = stripPendingSecrets(entry, depth + 1)
  }
  return next
}

function sanitizePendingOp(item) {
  const status = typeof item.status === 'string' ? item.status : 'pending'
  return {
    id: item.id,
    entity: typeof item.entity === 'string' ? item.entity : '',
    action: typeof item.action === 'string' ? item.action : '',
    payload: stripPendingSecrets(isRecord(item.payload) ? item.payload : {}),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    status,
    cloudTripId: typeof item.cloudTripId === 'string' ? item.cloudTripId : null,
    localEntityId: typeof item.localEntityId === 'string' ? item.localEntityId : null,
    cloudEntityId: typeof item.cloudEntityId === 'string' ? item.cloudEntityId : null,
    attemptCount: Number.isFinite(Number(item.attemptCount)) ? Number(item.attemptCount) : 0,
    lastAttemptAt: typeof item.lastAttemptAt === 'string' ? item.lastAttemptAt : null,
    nextAttemptAt: typeof item.nextAttemptAt === 'string' ? item.nextAttemptAt : null,
    lastError: typeof item.lastError === 'string' ? item.lastError : null,
    blockedBy: typeof item.blockedBy === 'string' ? item.blockedBy : null,
    dependsOn: typeof item.dependsOn === 'string' ? item.dependsOn : null,
    authUserId: typeof item.authUserId === 'string' ? item.authUserId : null,
  }
}

function emptyCollections() {
  return {
    users: [],
    trips: [],
    expenses: [],
    repayments: [],
    itineraries: [],
    places: [],
    bookings: [],
    invitations: [],
    activities: [],
    polls: [],
    pendingOps: [],
    tripMigrations: [],
    packingCategories: [],
    packingItems: [],
    checklistCategories: [],
    checklistItems: [],
    notes: [],
    memories: [],
  }
}

function migrate(data) {
  let version = Number.isFinite(Number(data.version)) ? Number(data.version) : 0
  let current = { ...data }
  while (version < STORAGE_VERSION) {
    const apply = MIGRATIONS[version]
    current = apply ? apply(current) : current
    version += 1
  }
  return { ...current, version: STORAGE_VERSION }
}

function sanitizeSnapshot(data, seed) {
  const source = isRecord(data) ? data : {}
  const migrated = migrate(source)
  return {
    version: STORAGE_VERSION,
    users: sanitizeUsers(migrated.users, seed.users),
    trips: sanitizeTrips(migrated.trips),
    expenses: sanitizeExpenses(migrated.expenses),
    repayments: sanitizeRepayments(migrated.repayments),
    itineraries: sanitizeItineraries(migrated.itineraries),
    places: sanitizeKeyed(migrated.places, (item) => typeof item.tripId === 'string'),
    bookings: sanitizeKeyed(migrated.bookings, (item) => typeof item.tripId === 'string'),
    invitations: sanitizeKeyed(migrated.invitations, (item) => typeof item.tripId === 'string'),
    activities: sanitizeKeyed(migrated.activities, (item) => typeof item.tripId === 'string'),
    polls: sanitizeKeyed(migrated.polls, (item) => typeof item.tripId === 'string'),
    pendingOps: sanitizePendingOps(migrated.pendingOps),
    tripMigrations: sanitizeTripMigrations(migrated.tripMigrations),
    packingCategories: sanitizePersonal(migrated.packingCategories),
    packingItems: sanitizePersonal(migrated.packingItems),
    checklistCategories: sanitizePersonal(migrated.checklistCategories),
    checklistItems: sanitizePersonal(migrated.checklistItems),
    notes: sanitizePersonal(migrated.notes),
    memories: sanitizePersonal(migrated.memories),
  }
}

/**
 * Load the persisted snapshot. Corrupt JSON falls back to seed.
 * Invalid collections are recovered independently so valid trips survive bad expenses.
 *
 * @param {ReturnType<typeof emptyCollections>} seed
 */
export function loadSnapshot(seed, key = STORAGE_KEY) {
  const fallback = {
    version: STORAGE_VERSION,
    ...clone(seed),
    pendingOps: Array.isArray(seed.pendingOps) ? clone(seed.pendingOps) : [],
    tripMigrations: Array.isArray(seed.tripMigrations) ? clone(seed.tripMigrations) : [],
    packingCategories: Array.isArray(seed.packingCategories) ? clone(seed.packingCategories) : [],
    packingItems: Array.isArray(seed.packingItems) ? clone(seed.packingItems) : [],
    checklistCategories: Array.isArray(seed.checklistCategories) ? clone(seed.checklistCategories) : [],
    checklistItems: Array.isArray(seed.checklistItems) ? clone(seed.checklistItems) : [],
    notes: Array.isArray(seed.notes) ? clone(seed.notes) : [],
    memories: Array.isArray(seed.memories) ? clone(seed.memories) : [],
    repayments: Array.isArray(seed.repayments) ? clone(seed.repayments) : [],
  }

  const raw = readRaw(key)
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return fallback
    const sanitized = sanitizeSnapshot(parsed, fallback)
    if (parsed.trips === undefined && parsed.expenses === undefined && parsed.places === undefined) {
      return fallback
    }
    return sanitized
  } catch {
    return fallback
  }
}

/** @param {Record<string, unknown>} snapshot */
export function saveSnapshot(snapshot, key = STORAGE_KEY) {
  const payload = {
    ...emptyCollections(),
    ...snapshot,
    version: STORAGE_VERSION,
  }
  for (const name of PERSONAL_COLLECTIONS) {
    payload[name] = sanitizePersonal(payload[name])
  }
  return writeRaw(key, JSON.stringify(payload))
}

export function createPendingOperation(entity, action, payload, extra = {}) {
  return sanitizePendingOp({
    id: extra.id ?? `op-${Math.random().toString(36).slice(2, 10)}`,
    entity,
    action,
    payload,
    createdAt: extra.createdAt ?? new Date().toISOString(),
    status: extra.status ?? 'pending',
    ...extra,
  })
}

export { COLLECTIONS }
