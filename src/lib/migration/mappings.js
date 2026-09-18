/**
 * Local → Cloud migration ID maps. Local IDs never appear as Cloud UUIDs.
 */

import { isClientRowId } from '../trips/clientRowId.js'

export const MIGRATION_STATUSES = Object.freeze([
  'preview',
  'blocked',
  'running',
  'completed',
  'failed',
])

export function emptyMappings() {
  return {
    trip: null,
    places: {},
    bookings: {},
    itineraryDays: {},
    itineraryItems: {},
    expenses: {},
    polls: {},
    pollOptions: {},
  }
}

export function newCloudId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`
}

function stringMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === 'string' && key && typeof entry === 'string' && isClientRowId(entry)) {
      next[key] = entry
    }
  }
  return next
}

function identityMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key !== 'string' || !key || !entry || typeof entry !== 'object') continue
    const type = entry.type === 'member' ? 'member' : entry.type === 'self' ? 'self' : null
    const cloudUserId = typeof entry.cloudUserId === 'string' ? entry.cloudUserId : ''
    if (!type || !isClientRowId(cloudUserId)) continue
    next[key] = { type, cloudUserId }
  }
  return next
}

function issueList(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      entity: String(item.entity ?? ''),
      localId: typeof item.localId === 'string' ? item.localId : null,
      title: String(item.title ?? ''),
      reason: String(item.reason ?? ''),
    }))
}

export function sanitizeTripMigration(item = {}) {
  const mappings = item.mappings && typeof item.mappings === 'object' ? item.mappings : {}
  const status = MIGRATION_STATUSES.includes(item.status) ? item.status : 'preview'
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `mig-${Math.random().toString(36).slice(2, 10)}`,
    localTripId: typeof item.localTripId === 'string' ? item.localTripId : '',
    cloudTripId: typeof item.cloudTripId === 'string' && isClientRowId(item.cloudTripId) ? item.cloudTripId : null,
    path: item.path === 'associate' ? 'associate' : 'create',
    status,
    identityMappings: identityMap(item.identityMappings),
    mappings: {
      trip:
        typeof mappings.trip === 'string' && isClientRowId(mappings.trip) ? mappings.trip : null,
      places: stringMap(mappings.places),
      bookings: stringMap(mappings.bookings),
      itineraryDays: stringMap(mappings.itineraryDays),
      itineraryItems: stringMap(mappings.itineraryItems),
      expenses: stringMap(mappings.expenses),
      polls: stringMap(mappings.polls),
      pollOptions: stringMap(mappings.pollOptions),
    },
    completedSteps: Array.isArray(item.completedSteps)
      ? item.completedSteps.filter((step) => typeof step === 'string')
      : [],
    skipped: issueList(item.skipped),
    blocked: issueList(item.blocked),
    errors: issueList(item.errors),
    warnings: Array.isArray(item.warnings) ? item.warnings.filter((entry) => typeof entry === 'string') : [],
    voteCount: Number.isFinite(Number(item.voteCount)) ? Number(item.voteCount) : 0,
    lastErrorKind: ['retryable', 'fatal', 'entity'].includes(item.lastErrorKind) ? item.lastErrorKind : null,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  }
}

export function createTripMigration(input = {}) {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return sanitizeTripMigration({
    ...input,
    mappings: { ...emptyMappings(), ...(input.mappings ?? {}) },
    identityMappings: input.identityMappings ?? {},
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  })
}

export function ensureMappedId(map, localId, generateId = newCloudId) {
  if (!localId) return null
  if (map[localId] && isClientRowId(map[localId])) return map[localId]
  const id = generateId()
  map[localId] = id
  return id
}
