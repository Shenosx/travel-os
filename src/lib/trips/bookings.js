/**
 * Cloud trip bookings. Writes go through the `bookings` table under RLS.
 * created_by is derived by Phase 5B triggers from auth.uid().
 * This module does not write to the local Travel OS store.
 */

import { BOOKING_STATUSES, BOOKING_TYPES } from '../bookings.js'
import { attachClientRowId, recoverDuplicateInsert } from './clientRowId.js'
import { isCloudTripId } from './cloud.js'

export const CLOUD_BOOKING_COLUMNS = [
  'id',
  'trip_id',
  'type',
  'title',
  'provider',
  'confirmation_number',
  'start_date',
  'start_time',
  'end_date',
  'end_time',
  'location',
  'cost',
  'currency',
  'notes',
  'status',
  'expense_id',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

export const CLOUD_BOOKING_INSERT_COLUMNS = Object.freeze([
  'trip_id',
  'type',
  'title',
  'provider',
  'confirmation_number',
  'start_date',
  'start_time',
  'end_date',
  'end_time',
  'location',
  'cost',
  'currency',
  'notes',
  'status',
])

export const CLOUD_BOOKING_UPDATE_COLUMNS = Object.freeze(
  CLOUD_BOOKING_INSERT_COLUMNS.filter((column) => column !== 'trip_id'),
)

export const CLOUD_BOOKING_FORBIDDEN_WRITE_COLUMNS = Object.freeze([
  'id',
  'created_by',
  'created_at',
  'updated_at',
  'owner_id',
  'expense_id',
])

export const CLOUD_BOOKING_TYPES = BOOKING_TYPES
export const CLOUD_BOOKING_STATUSES = BOOKING_STATUSES

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const TYPE_SET = new Set(CLOUD_BOOKING_TYPES)
const STATUS_SET = new Set(CLOUD_BOOKING_STATUSES)

const ACTION_FALLBACK = {
  load: 'Bookings could not be loaded just now.',
  create: 'This booking could not be saved.',
  update: 'This booking could not be saved.',
  delete: 'This booking could not be deleted.',
}

export function isCloudBookingId(value) {
  return UUID_RE.test(String(value ?? ''))
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudBookingError(error, action = 'load') {
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
    if (action === 'create' || action === 'update') return 'This booking could not be saved.'
    if (action === 'delete') return 'This booking could not be deleted.'
    return 'Those bookings are not available to this account.'
  }
  if (code === 'PGRST116' || /no rows/i.test(message)) {
    if (action === 'update') return 'This booking cannot be changed.'
    if (action === 'delete') return 'This booking could not be deleted.'
    return 'That booking could not be found.'
  }
  if (code === '23514' || code === '23502' || /check constraint|not-null constraint|invalid input value for enum/i.test(message)) {
    return 'Check the title, dates, and details, then try again.'
  }
  if (code === '23503' || /foreign key/i.test(message)) {
    return 'That cloud trip could not be found.'
  }
  if (/column|relation|schema cache/i.test(message)) {
    return fallback
  }
  return fallback
}

function logCloudBookingDetail(error) {
  try {
    if (import.meta?.env?.DEV) console.error('[cloud booking]', error)
  } catch {
    /* node tests and non-vite runtimes */
  }
}

export function mapCloudBooking(row) {
  if (!row) return null
  return {
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    title: row.title,
    provider: row.provider ?? '',
    confirmationNumber: row.confirmation_number ?? '',
    startDate: row.start_date ?? null,
    startTime: row.start_time ?? '',
    endDate: row.end_date ?? null,
    endTime: row.end_time ?? '',
    location: row.location ?? '',
    cost: row.cost == null ? null : Number(row.cost),
    currency: row.currency ?? null,
    notes: row.notes ?? '',
    status: row.status,
    expenseId: row.expense_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'cloud',
  }
}

/** Presentation only. RLS remains the authorization boundary. */
export function cloudBookingCapabilities(role, userId, booking) {
  const canRead = Boolean(role)
  const canCreate = role === 'owner' || role === 'editor'
  const canEdit = role === 'owner' || role === 'editor'
  const owns = Boolean(booking?.createdBy && userId && booking.createdBy === userId)
  const canDelete = role === 'owner' || (role === 'editor' && owns)
  return { canRead, canCreate, canEdit, canDelete: canDelete && Boolean(booking) }
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
  for (const key of CLOUD_BOOKING_FORBIDDEN_WRITE_COLUMNS) {
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

function assignOptionalFields(payload, input) {
  if (hasOwn(input, 'type')) payload.type = optionalText(input.type) ?? 'other'
  if (hasOwn(input, 'provider')) payload.provider = optionalText(input.provider)
  if (hasOwn(input, 'confirmation_number', 'confirmationNumber', 'confirmation')) {
    payload.confirmation_number = optionalText(readField(input, 'confirmation_number', 'confirmationNumber', 'confirmation'))
  }
  if (hasOwn(input, 'start_date', 'startDate')) {
    payload.start_date = optionalText(readField(input, 'start_date', 'startDate'))
  }
  if (hasOwn(input, 'start_time', 'startTime')) {
    payload.start_time = optionalText(readField(input, 'start_time', 'startTime'))
  }
  if (hasOwn(input, 'end_date', 'endDate')) {
    payload.end_date = optionalText(readField(input, 'end_date', 'endDate'))
  }
  if (hasOwn(input, 'end_time', 'endTime')) {
    payload.end_time = optionalText(readField(input, 'end_time', 'endTime'))
  }
  if (hasOwn(input, 'location')) payload.location = optionalText(input.location)
  if (hasOwn(input, 'cost')) payload.cost = numberValue(input.cost)
  if (hasOwn(input, 'currency')) payload.currency = optionalText(input.currency)
  if (hasOwn(input, 'notes')) payload.notes = optionalText(input.notes, { emptyToNull: false }) ?? ''
  if (hasOwn(input, 'status')) payload.status = optionalText(input.status)
  return payload
}

export function cloudBookingInsertPayload(input = {}, options = {}) {
  const tripId = options.tripId ?? readField(input, 'trip_id', 'tripId')
  const title = optionalText(readField(input, 'title'), { emptyToNull: false }) ?? ''
  const payload = {
    trip_id: tripId,
    title,
    type: optionalText(readField(input, 'type')) ?? 'other',
    notes: optionalText(readField(input, 'notes'), { emptyToNull: false }) ?? '',
    status: optionalText(readField(input, 'status')) ?? 'pending',
  }
  assignOptionalFields(payload, input)
  return pickAllowed(stripForbidden(payload), CLOUD_BOOKING_INSERT_COLUMNS)
}

export function cloudBookingUpdatePayload(changes = {}) {
  const payload = {}
  if (hasOwn(changes, 'title')) payload.title = optionalText(changes.title, { emptyToNull: false }) ?? ''
  assignOptionalFields(payload, changes)
  delete payload.trip_id
  return pickAllowed(stripForbidden(payload), CLOUD_BOOKING_UPDATE_COLUMNS)
}

export function validateCloudBookingPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'This booking could not be saved.'
  if (!partial) {
    if (!isCloudTripId(payload.trip_id)) return 'That cloud trip could not be found.'
    if (!payload.title) return 'Add a booking title.'
  }
  if (payload.title !== undefined && !String(payload.title).trim()) return 'Add a booking title.'
  if (payload.type != null && !TYPE_SET.has(payload.type)) return 'Choose a booking type.'
  if (payload.status != null && !STATUS_SET.has(payload.status)) {
    return 'Use confirmed, pending, or cancelled.'
  }
  if (payload.currency != null && payload.currency !== '' && !CURRENCY_RE.test(payload.currency)) {
    return 'Use a 3-letter currency code.'
  }
  for (const key of ['start_date', 'end_date']) {
    if (payload[key] != null && payload[key] !== '' && !DATE_RE.test(String(payload[key]))) {
      return 'Check the title, dates, and details, then try again.'
    }
  }
  if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
    return 'The end date must be on or after the start date.'
  }
  if (payload.cost !== undefined && Number.isNaN(payload.cost)) {
    return 'Check the title, dates, and details, then try again.'
  }
  if (payload.cost != null && payload.cost < 0) return 'Cost cannot be negative.'
  return null
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string }} [args]
 */
export async function getCloudTripBookings(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) return { bookings: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { bookings: [], error: 'Sign in to see bookings on this trip.' }
  if (!isCloudTripId(tripId)) return { bookings: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('bookings')
    .select(CLOUD_BOOKING_COLUMNS)
    .eq('trip_id', tripId)
    .order('start_date', { ascending: true })

  if (error) {
    logCloudBookingDetail(error)
    return { bookings: [], error: formatCloudBookingError(error) }
  }

  return {
    bookings: (data ?? []).map(mapCloudBooking).filter(Boolean),
    error: null,
  }
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string, input?: Record<string, unknown> }} [args]
 */
export async function createCloudBooking(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const input = args.input ?? {}

  if (!client) return { booking: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { booking: null, error: 'Sign in to add a booking.' }

  const payload = cloudBookingInsertPayload(input, { tripId: args.tripId })
  attachClientRowId(payload, args.id)
  const invalid = validateCloudBookingPayload(payload)
  if (invalid) return { booking: null, error: invalid }

  const { data, error } = await client.from('bookings').insert(payload).select(CLOUD_BOOKING_COLUMNS).single()

  if (error) {
    logCloudBookingDetail(error)
    const recovered = await recoverDuplicateInsert({
      client,
      table: 'bookings',
      columns: CLOUD_BOOKING_COLUMNS,
      id: args.id,
      error,
    })
    if (recovered.recovered) return { booking: mapCloudBooking(recovered.data), error: null }
    return { booking: null, error: formatCloudBookingError(error, 'create') }
  }

  return { booking: mapCloudBooking(data), error: null }
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, id?: string, changes?: Record<string, unknown> }} [args]
 */
export async function updateCloudBooking(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const changes = args.changes ?? {}

  if (!client) return { booking: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { booking: null, error: 'Sign in to update a booking.' }
  if (!isCloudBookingId(id)) return { booking: null, error: 'That booking could not be found.' }

  const payload = cloudBookingUpdatePayload(changes)
  if (!Object.keys(payload).length) return { booking: null, error: 'Nothing to update.' }
  const invalid = validateCloudBookingPayload(payload, { partial: true })
  if (invalid) return { booking: null, error: invalid }

  const { data, error } = await client
    .from('bookings')
    .update(payload)
    .eq('id', id)
    .select(CLOUD_BOOKING_COLUMNS)
    .maybeSingle()

  if (error) {
    logCloudBookingDetail(error)
    return { booking: null, error: formatCloudBookingError(error, 'update') }
  }
  if (!data) return { booking: null, error: 'This booking cannot be changed.' }

  return { booking: mapCloudBooking(data), error: null }
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, id?: string }} [args]
 */
export async function deleteCloudBooking(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete a booking.' }
  if (!isCloudBookingId(id)) return { ok: false, error: 'That booking could not be found.' }

  const { data, error } = await client.from('bookings').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    logCloudBookingDetail(error)
    return { ok: false, error: formatCloudBookingError(error, 'delete') }
  }
  if (!data) return { ok: false, error: 'This booking could not be deleted.' }
  return { ok: true, error: null }
}
