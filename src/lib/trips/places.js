/**
 * Cloud trip places. Writes go through the `places` table under RLS.
 * created_by is derived by Phase 5B triggers from auth.uid().
 * This module does not write to the local Travel OS store.
 */

import { PLACE_STATUSES, markPlaceVisited } from '../places.js'
import { attachClientRowId, recoverDuplicateInsert } from './clientRowId.js'
import { isCloudTripId } from './cloud.js'

export const CLOUD_PLACE_COLUMNS = [
  'id',
  'trip_id',
  'name',
  'category',
  'address',
  'area',
  'latitude',
  'longitude',
  'notes',
  'website',
  'opening_hours',
  'estimated_cost',
  'currency',
  'rating',
  'status',
  'planned_day',
  'map_x',
  'map_y',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

export const CLOUD_PLACE_INSERT_COLUMNS = Object.freeze([
  'trip_id',
  'name',
  'category',
  'address',
  'area',
  'latitude',
  'longitude',
  'notes',
  'website',
  'opening_hours',
  'estimated_cost',
  'currency',
  'rating',
  'status',
  'planned_day',
  'map_x',
  'map_y',
])

export const CLOUD_PLACE_UPDATE_COLUMNS = Object.freeze(
  CLOUD_PLACE_INSERT_COLUMNS.filter((column) => column !== 'trip_id'),
)

export const CLOUD_PLACE_FORBIDDEN_WRITE_COLUMNS = Object.freeze([
  'id',
  'created_by',
  'created_at',
  'updated_at',
  'owner_id',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const STATUS_SET = new Set(PLACE_STATUSES)

const ACTION_FALLBACK = {
  load: 'Places could not be loaded just now.',
  create: 'This place could not be saved.',
  update: 'This place could not be saved.',
  delete: 'This place could not be deleted.',
}

export function isCloudPlaceId(value) {
  return UUID_RE.test(String(value ?? ''))
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudPlaceError(error, action = 'load') {
  const fallback = ACTION_FALLBACK[action] ?? ACTION_FALLBACK.load
  const message = redactSecrets(String(error?.message ?? error ?? '').trim())
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim/i.test(message)) {
    return 'Sign in to continue.'
  }
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    if (action === 'create' || action === 'update') return 'This place could not be saved.'
    if (action === 'delete') return 'This place could not be deleted.'
    return 'Those places are not available to this account.'
  }
  if (code === 'PGRST116' || /no rows/i.test(message)) {
    if (action === 'update') return 'This place cannot be changed.'
    if (action === 'delete') return 'This place could not be deleted.'
    return 'That place could not be found.'
  }
  if (code === '23514' || code === '23502' || /check constraint|not-null constraint|invalid input value for enum/i.test(message)) {
    return 'Check the name, status, and details, then try again.'
  }
  if (code === '23503' || /foreign key/i.test(message)) {
    return 'That cloud trip could not be found.'
  }
  if (/column|relation|schema cache/i.test(message)) {
    return fallback
  }
  return fallback
}

function logCloudPlaceDetail(error) {
  try {
    if (import.meta?.env?.DEV) console.error('[cloud place]', error)
  } catch {
    /* node tests and non-vite runtimes */
  }
}

export function mapCloudPlace(row) {
  if (!row) return null
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    category: row.category ?? '',
    address: row.address ?? '',
    area: row.area ?? '',
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    notes: row.notes ?? '',
    website: row.website ?? '',
    openingHours: row.opening_hours ?? '',
    estimatedCost: row.estimated_cost == null ? null : Number(row.estimated_cost),
    currency: row.currency ?? null,
    rating: row.rating == null ? null : Number(row.rating),
    status: row.status,
    plannedDay: row.planned_day ?? null,
    mapX: row.map_x == null ? null : Number(row.map_x),
    mapY: row.map_y == null ? null : Number(row.map_y),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'cloud',
  }
}

/** Presentation only. RLS remains the authorization boundary. */
export function cloudPlaceCapabilities(role, userId, place) {
  const canRead = Boolean(role)
  const canCreate = role === 'owner' || role === 'editor'
  const canEdit = role === 'owner' || role === 'editor'
  const owns = Boolean(place?.createdBy && userId && place.createdBy === userId)
  const canDelete = role === 'owner' || (role === 'editor' && owns)
  return { canRead, canCreate, canEdit, canDelete: canDelete && Boolean(place) }
}

export function cloudPlaceVisitedChanges(place) {
  const next = markPlaceVisited(place ?? { status: 'saved' })
  return {
    status: next.status,
    plannedDay: next.plannedDay ?? null,
  }
}

function hasOwn(input, ...keys) {
  if (!input || typeof input !== 'object') return false
  return keys.some((key) => Object.prototype.hasOwnProperty.call(input, key))
}

function readField(input, ...keys) {
  if (!input || typeof input !== 'object') return undefined
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) return input[key]
  }
  return undefined
}

function textValue(value) {
  if (value == null) return undefined
  return String(value).trim()
}

function optionalText(value, { emptyToNull = true } = {}) {
  if (value === undefined) return undefined
  const text = textValue(value)
  if (!text) return emptyToNull ? null : ''
  return text
}

function numberValue(value) {
  if (value === undefined) return undefined
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  return parsed
}

function stripForbidden(payload) {
  for (const key of CLOUD_PLACE_FORBIDDEN_WRITE_COLUMNS) {
    delete payload[key]
  }
  return payload
}

function pickAllowed(payload, allowed) {
  const next = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      next[key] = payload[key]
    }
  }
  return next
}

export function cloudPlaceInsertPayload(input = {}, options = {}) {
  const tripId = options.tripId ?? readField(input, 'trip_id', 'tripId')
  const name = optionalText(readField(input, 'name'), { emptyToNull: false }) ?? ''
  const notes = optionalText(readField(input, 'notes', 'description'), { emptyToNull: false })
  const status = optionalText(readField(input, 'status')) ?? 'saved'
  const payload = {
    trip_id: tripId,
    name,
    notes: notes ?? '',
    status,
  }

  if (hasOwn(input, 'category', 'type')) payload.category = optionalText(readField(input, 'category', 'type'))
  if (hasOwn(input, 'address')) payload.address = optionalText(input.address)
  if (hasOwn(input, 'area')) payload.area = optionalText(input.area)
  if (hasOwn(input, 'latitude', 'lat')) payload.latitude = numberValue(readField(input, 'latitude', 'lat'))
  if (hasOwn(input, 'longitude', 'lon', 'lng')) payload.longitude = numberValue(readField(input, 'longitude', 'lon', 'lng'))
  if (hasOwn(input, 'website')) payload.website = optionalText(input.website)
  if (hasOwn(input, 'opening_hours', 'openingHours')) {
    payload.opening_hours = optionalText(readField(input, 'opening_hours', 'openingHours'))
  }
  if (hasOwn(input, 'estimated_cost', 'estimatedCost', 'cost')) {
    payload.estimated_cost = numberValue(readField(input, 'estimated_cost', 'estimatedCost', 'cost'))
  }
  if (hasOwn(input, 'currency')) payload.currency = optionalText(input.currency)
  if (hasOwn(input, 'rating')) payload.rating = numberValue(input.rating)
  if (hasOwn(input, 'planned_day', 'plannedDay')) {
    payload.planned_day = optionalText(readField(input, 'planned_day', 'plannedDay'))
  }
  if (hasOwn(input, 'map_x', 'mapX')) payload.map_x = numberValue(readField(input, 'map_x', 'mapX'))
  if (hasOwn(input, 'map_y', 'mapY')) payload.map_y = numberValue(readField(input, 'map_y', 'mapY'))

  return pickAllowed(stripForbidden(payload), CLOUD_PLACE_INSERT_COLUMNS)
}

export function cloudPlaceUpdatePayload(changes = {}) {
  const payload = {}
  if (hasOwn(changes, 'name')) payload.name = optionalText(changes.name, { emptyToNull: false }) ?? ''
  if (hasOwn(changes, 'category', 'type')) payload.category = optionalText(readField(changes, 'category', 'type'))
  if (hasOwn(changes, 'address')) payload.address = optionalText(changes.address)
  if (hasOwn(changes, 'area')) payload.area = optionalText(changes.area)
  if (hasOwn(changes, 'latitude', 'lat')) payload.latitude = numberValue(readField(changes, 'latitude', 'lat'))
  if (hasOwn(changes, 'longitude', 'lon', 'lng')) {
    payload.longitude = numberValue(readField(changes, 'longitude', 'lon', 'lng'))
  }
  if (hasOwn(changes, 'notes', 'description')) {
    payload.notes = optionalText(readField(changes, 'notes', 'description'), { emptyToNull: false }) ?? ''
  }
  if (hasOwn(changes, 'website')) payload.website = optionalText(changes.website)
  if (hasOwn(changes, 'opening_hours', 'openingHours')) {
    payload.opening_hours = optionalText(readField(changes, 'opening_hours', 'openingHours'))
  }
  if (hasOwn(changes, 'estimated_cost', 'estimatedCost', 'cost')) {
    payload.estimated_cost = numberValue(readField(changes, 'estimated_cost', 'estimatedCost', 'cost'))
  }
  if (hasOwn(changes, 'currency')) payload.currency = optionalText(changes.currency)
  if (hasOwn(changes, 'rating')) payload.rating = numberValue(changes.rating)
  if (hasOwn(changes, 'status')) payload.status = optionalText(changes.status)
  if (hasOwn(changes, 'planned_day', 'plannedDay')) {
    payload.planned_day = optionalText(readField(changes, 'planned_day', 'plannedDay'))
  }
  if (hasOwn(changes, 'map_x', 'mapX')) payload.map_x = numberValue(readField(changes, 'map_x', 'mapX'))
  if (hasOwn(changes, 'map_y', 'mapY')) payload.map_y = numberValue(readField(changes, 'map_y', 'mapY'))

  delete payload.trip_id
  return pickAllowed(stripForbidden(payload), CLOUD_PLACE_UPDATE_COLUMNS)
}

export function validateCloudPlacePayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'This place could not be saved.'
  if (!partial) {
    if (!isCloudTripId(payload.trip_id)) return 'That cloud trip could not be found.'
    if (!payload.name) return 'Add a place name.'
  }
  if (payload.name !== undefined && !String(payload.name).trim()) return 'Add a place name.'
  if (payload.status != null && !STATUS_SET.has(payload.status)) {
    return 'Use saved, planned, or visited.'
  }
  if (payload.currency != null && payload.currency !== '' && !CURRENCY_RE.test(payload.currency)) {
    return 'Use a 3-letter currency code.'
  }
  if (payload.planned_day != null && payload.planned_day !== '' && !DATE_RE.test(String(payload.planned_day))) {
    return 'Check the planned day, then try again.'
  }
  for (const key of ['latitude', 'longitude', 'estimated_cost', 'rating', 'map_x', 'map_y']) {
    if (payload[key] !== undefined && Number.isNaN(payload[key])) {
      return 'Check the name, status, and details, then try again.'
    }
  }
  if (payload.rating != null && (payload.rating < 0 || payload.rating > 5)) {
    return 'Rating must be between 0 and 5.'
  }
  if (payload.estimated_cost != null && payload.estimated_cost < 0) {
    return 'Cost cannot be negative.'
  }
  return null
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string }} [args]
 */
export async function getCloudTripPlaces(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) return { places: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { places: [], error: 'Sign in to see places on this trip.' }
  if (!isCloudTripId(tripId)) return { places: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('places')
    .select(CLOUD_PLACE_COLUMNS)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if (error) {
    logCloudPlaceDetail(error)
    return { places: [], error: formatCloudPlaceError(error) }
  }

  return {
    places: (data ?? []).map(mapCloudPlace).filter(Boolean),
    error: null,
  }
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string, input?: Record<string, unknown> }} [args]
 */
export async function createCloudPlace(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const input = args.input ?? {}

  if (!client) return { place: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { place: null, error: 'Sign in to add a place.' }

  const payload = cloudPlaceInsertPayload(input, { tripId: args.tripId })
  attachClientRowId(payload, args.id)
  const invalid = validateCloudPlacePayload(payload)
  if (invalid) return { place: null, error: invalid }

  const { data, error } = await client.from('places').insert(payload).select(CLOUD_PLACE_COLUMNS).single()

  if (error) {
    logCloudPlaceDetail(error)
    const recovered = await recoverDuplicateInsert({
      client,
      table: 'places',
      columns: CLOUD_PLACE_COLUMNS,
      id: args.id,
      error,
    })
    if (recovered.recovered) return { place: mapCloudPlace(recovered.data), error: null }
    return { place: null, error: formatCloudPlaceError(error, 'create') }
  }

  return { place: mapCloudPlace(data), error: null }
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, id?: string, changes?: Record<string, unknown> }} [args]
 */
export async function updateCloudPlace(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const changes = args.changes ?? {}

  if (!client) return { place: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { place: null, error: 'Sign in to update a place.' }
  if (!isCloudPlaceId(id)) return { place: null, error: 'That place could not be found.' }

  const payload = cloudPlaceUpdatePayload(changes)
  if (!Object.keys(payload).length) return { place: null, error: 'Nothing to update.' }
  const invalid = validateCloudPlacePayload(payload, { partial: true })
  if (invalid) return { place: null, error: invalid }

  const { data, error } = await client
    .from('places')
    .update(payload)
    .eq('id', id)
    .select(CLOUD_PLACE_COLUMNS)
    .maybeSingle()

  if (error) {
    logCloudPlaceDetail(error)
    return { place: null, error: formatCloudPlaceError(error, 'update') }
  }
  if (!data) return { place: null, error: 'This place cannot be changed.' }

  return { place: mapCloudPlace(data), error: null }
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, id?: string }} [args]
 */
export async function deleteCloudPlace(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete a place.' }
  if (!isCloudPlaceId(id)) return { ok: false, error: 'That place could not be found.' }

  const { data, error } = await client.from('places').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    logCloudPlaceDetail(error)
    return { ok: false, error: formatCloudPlaceError(error, 'delete') }
  }
  if (!data) return { ok: false, error: 'This place could not be deleted.' }
  return { ok: true, error: null }
}
