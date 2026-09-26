/**
 * Cloud trip data access. Authorization is RLS on `trips`, not client-side owner checks.
 * This module does not write to the local Travel OS store.
 *
 * Ownership (`owner_id`) and identity (`created_by` on child tables) are derived by
 * Phase 5B triggers from `auth.uid()`. Clients must never send those columns.
 */

import { attachClientRowId, recoverDuplicateInsert } from './clientRowId.js'

export const CLOUD_TRIP_COLUMNS = [
  'id',
  'owner_id',
  'city',
  'country',
  'destination',
  'start_date',
  'end_date',
  'budget_amount',
  'currency',
  'visibility',
  'notes',
  'timezone',
  'invite_code',
  'created_at',
  'updated_at',
].join(', ')

export const CLOUD_TRIP_WRITE_COLUMNS = [
  'city',
  'country',
  'destination',
  'start_date',
  'end_date',
  'budget_amount',
  'currency',
  'visibility',
  'notes',
  'timezone',
]

export const CLOUD_TRIP_FORBIDDEN_WRITE_COLUMNS = Object.freeze([
  'id',
  'owner_id',
  'created_by',
  'invite_code',
  'metadata',
  'created_at',
  'updated_at',
  'trip_members',
])

export const EMPTY_CLOUD_TRIPS = Object.freeze({
  trips: [],
  error: null,
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const VISIBILITY = new Set(['private', 'shared'])

const ACTION_FALLBACK = {
  load: 'Cloud trips could not be loaded just now.',
  create: 'That cloud trip could not be created.',
  update: 'That cloud trip could not be saved.',
  delete: 'That cloud trip could not be deleted.',
}

export function cloudTripsForSignedOut() {
  return { trips: [], error: null }
}

export function isCloudTripId(value) {
  return UUID_RE.test(String(value ?? ''))
}

/** Display helper only. RLS remains the authorization boundary. */
export function isCloudTripOwner(trip, userId) {
  return Boolean(trip?.ownerId && userId && trip.ownerId === userId)
}

export function formatCloudTripError(error, action = 'load') {
  const fallback = ACTION_FALLBACK[action] ?? ACTION_FALLBACK.load
  const message = String(error?.message ?? error ?? '').trim()
  const code = String(error?.code ?? '')
  if (!message && !code) return fallback
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim/i.test(message)) {
    return action === 'load' ? 'Sign in again to see cloud trips.' : 'Sign in again to continue.'
  }
  if (
    code === '42501' ||
    code === 'PGRST116' ||
    /permission|rls|row-level|42501|PGRST116/i.test(message)
  ) {
    if (action === 'update') return 'This cloud trip cannot be changed.'
    if (action === 'delete') return 'This cloud trip cannot be deleted.'
    if (action === 'create') return 'This cloud trip could not be created.'
    return 'Those cloud trips are not available to this account.'
  }
  if (code === '23505' || /duplicate|unique/i.test(message)) {
    return 'That cloud trip could not be saved.'
  }
  if (code === '23514' || code === '23502' || /check constraint|not-null constraint/i.test(message)) {
    return 'Check the destination, dates, budget, and currency, then try again.'
  }
  if (/column|relation|schema cache/i.test(message)) {
    return fallback
  }
  return fallback
}

function logCloudTripDetail(error) {
  try {
    if (import.meta?.env?.DEV) console.error('[cloud trip]', error)
  } catch {
    /* node tests and non-vite runtimes */
  }
}

/** Temporary create-path diagnostic. Never logs trip notes or invite tokens. */
export function cloudTripWriteDiagnostic(error, action = 'create') {
  return {
    action,
    table: 'trips',
    operation: action === 'create' ? 'insert' : action === 'update' ? 'update' : action === 'delete' ? 'delete' : 'select',
    error: error
      ? {
          message: error.message ?? null,
          code: error.code ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        }
      : null,
  }
}

function logCloudTripWrite(diagnostic) {
  try {
    console.info('[cloud trip write]', diagnostic)
  } catch {
    /* ignore */
  }
}

export function mapCloudTrip(row) {
  if (!row) return null
  return {
    id: row.id,
    ownerId: row.owner_id,
    city: row.city,
    country: row.country,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetAmount: Number(row.budget_amount ?? 0),
    currency: row.currency,
    visibility: row.visibility,
    notes: row.notes ?? '',
    timezone: row.timezone ?? null,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'cloud',
  }
}

function readField(input, snake, camel) {
  if (!input || typeof input !== 'object') return undefined
  if (Object.prototype.hasOwnProperty.call(input, snake)) return input[snake]
  if (camel && Object.prototype.hasOwnProperty.call(input, camel)) return input[camel]
  return undefined
}

function textValue(value) {
  if (value == null) return undefined
  return String(value).trim()
}

function destinationParts(input) {
  const destination = textValue(readField(input, 'destination')) ?? ''
  let city = textValue(readField(input, 'city')) ?? ''
  let country = textValue(readField(input, 'country')) ?? ''
  if (destination && (!city || !country)) {
    const [left, ...rest] = destination.split(',')
    if (!city) city = left.trim()
    if (!country) country = rest.join(',').trim()
  }
  const nextDestination = destination || [city, country].filter(Boolean).join(', ')
  return {
    city: city || nextDestination,
    country,
    destination: nextDestination,
  }
}

function dateValue(input, snake, camel) {
  const raw = textValue(readField(input, snake, camel))
  if (raw == null || raw === '') return undefined
  return raw
}

function budgetValue(input, { required = false } = {}) {
  const raw = readField(input, 'budget_amount', 'budgetAmount')
  if (raw == null || raw === '') return required ? 0 : undefined
  return Number(raw)
}

function currencyValue(input, { fallback } = {}) {
  const raw = textValue(readField(input, 'currency'))
  if (raw == null || raw === '') return fallback
  return raw.toUpperCase()
}

function visibilityValue(input, { fallback } = {}) {
  const raw = textValue(readField(input, 'visibility'))
  if (raw == null || raw === '') return fallback
  return raw
}

function notesValue(input, { fallback } = {}) {
  const raw = readField(input, 'notes')
  if (raw == null) return fallback
  return String(raw)
}

function timezoneValue(input) {
  if (!input || typeof input !== 'object') return undefined
  if (!Object.prototype.hasOwnProperty.call(input, 'timezone')) return undefined
  const raw = textValue(input.timezone)
  return raw || null
}

function assertNoForbiddenKeys(payload) {
  for (const key of CLOUD_TRIP_FORBIDDEN_WRITE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      delete payload[key]
    }
  }
  return payload
}

export function validateCloudTripPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'That cloud trip could not be saved.'
  if (!partial) {
    if (!payload.city || !payload.destination || !payload.start_date || !payload.end_date) {
      return 'Add a destination and dates.'
    }
  }
  for (const key of ['start_date', 'end_date']) {
    if (payload[key] != null && !DATE_RE.test(payload[key])) {
      return 'Check the destination, dates, budget, and currency, then try again.'
    }
  }
  if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
    return 'The end date must be on or after the start date.'
  }
  if (payload.budget_amount != null && (Number.isNaN(Number(payload.budget_amount)) || Number(payload.budget_amount) < 0)) {
    return 'Budget cannot be negative.'
  }
  if (payload.currency != null && !CURRENCY_RE.test(payload.currency)) {
    return 'Use a 3-letter currency code.'
  }
  if (payload.visibility != null && !VISIBILITY.has(payload.visibility)) {
    return 'Choose private or shared.'
  }
  return null
}

/**
 * Explicit insert payload. Never copies caller objects, owner_id, or created_by.
 * @param {Record<string, unknown>} [input]
 */
export function cloudTripInsertPayload(input = {}) {
  const { city, country, destination } = destinationParts(input)
  const payload = {
    city,
    country,
    destination,
    start_date: dateValue(input, 'start_date', 'startDate'),
    end_date: dateValue(input, 'end_date', 'endDate'),
    budget_amount: budgetValue(input, { required: true }),
    currency: currencyValue(input, { fallback: 'MYR' }),
    visibility: visibilityValue(input, { fallback: 'private' }),
    notes: notesValue(input, { fallback: '' }) ?? '',
  }
  const timezone = timezoneValue(input)
  if (timezone !== undefined) payload.timezone = timezone
  return assertNoForbiddenKeys(payload)
}

/**
 * Explicit update payload. Only allowed columns. Never includes owner_id or created_by.
 * @param {Record<string, unknown>} [changes]
 */
export function cloudTripUpdatePayload(changes = {}) {
  const payload = {}
  const has = (snake, camel) =>
    Object.prototype.hasOwnProperty.call(changes, snake) ||
    (camel ? Object.prototype.hasOwnProperty.call(changes, camel) : false)

  if (has('city')) payload.city = textValue(changes.city) ?? ''
  if (has('country')) payload.country = textValue(changes.country) ?? ''
  if (has('destination')) {
    const parts = destinationParts(changes)
    payload.destination = parts.destination
    if (!has('city')) payload.city = parts.city
    if (!has('country')) payload.country = parts.country
  }
  if (has('start_date', 'startDate')) payload.start_date = dateValue(changes, 'start_date', 'startDate')
  if (has('end_date', 'endDate')) payload.end_date = dateValue(changes, 'end_date', 'endDate')
  if (has('budget_amount', 'budgetAmount')) payload.budget_amount = budgetValue(changes)
  if (has('currency')) payload.currency = currencyValue(changes)
  if (has('visibility')) payload.visibility = visibilityValue(changes)
  if (has('notes')) payload.notes = notesValue(changes, { fallback: '' }) ?? ''
  if (has('timezone')) payload.timezone = timezoneValue(changes)

  return assertNoForbiddenKeys(payload)
}

function requireClient(client, action) {
  if (client) return null
  if (action === 'create') return 'Cloud trips are not connected on this device.'
  if (action === 'update') return 'Cloud trips are not connected on this device.'
  if (action === 'delete') return 'Cloud trips are not connected on this device.'
  return null
}

function requireSession(session, action) {
  if (session?.user) return null
  if (action === 'create') return 'Sign in to create a cloud trip.'
  if (action === 'update') return 'Sign in to update a cloud trip.'
  if (action === 'delete') return 'Sign in to delete a cloud trip.'
  return null
}

function requireTripId(id) {
  if (isCloudTripId(id)) return null
  return 'That cloud trip could not be found.'
}

/**
 * @param {{ client?: { from: Function } | null, session?: { user?: { id?: string } } | null }} [input]
 */
export async function getCloudTrips(input = {}) {
  const client = input.client ?? null
  const session = input.session ?? null

  if (!client) return { ...EMPTY_CLOUD_TRIPS }
  if (!session) return { ...EMPTY_CLOUD_TRIPS }

  const { data, error } = await client.from('trips').select(CLOUD_TRIP_COLUMNS).order('start_date', { ascending: true })

  if (error) {
    logCloudTripDetail(error)
    return { trips: [], error: formatCloudTripError(error) }
  }

  return {
    trips: (data ?? []).map(mapCloudTrip).filter(Boolean),
    error: null,
  }
}

/**
 * Insert a cloud trip. Ownership is established by database triggers from auth.uid().
 * @param {{ client?: { from: Function } | null, session?: object | null, input?: Record<string, unknown> }} [args]
 */
export async function createCloudTrip(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const input = args.input ?? {}

  const configError = requireClient(client, 'create')
  if (configError) return { trip: null, error: configError }
  const authError = requireSession(session, 'create')
  if (authError) return { trip: null, error: authError }

  const payload = cloudTripInsertPayload(input)
  attachClientRowId(payload, args.id)
  const invalid = validateCloudTripPayload(payload)
  if (invalid) return { trip: null, error: invalid }

  const { data, error } = await client.from('trips').insert(payload).select(CLOUD_TRIP_COLUMNS).single()

  if (error) {
    const diagnostic = cloudTripWriteDiagnostic(error, 'create')
    logCloudTripWrite(diagnostic)
    logCloudTripDetail(error)
    const recovered = await recoverDuplicateInsert({
      client,
      table: 'trips',
      columns: CLOUD_TRIP_COLUMNS,
      id: args.id,
      error,
    })
    if (recovered.recovered) return { trip: mapCloudTrip(recovered.data), error: null, diagnostic }
    return { trip: null, error: formatCloudTripError(error, 'create'), diagnostic }
  }

  return { trip: mapCloudTrip(data), error: null }
}

/**
 * Update a cloud trip by database UUID. RLS enforces owner-only writes.
 * @param {{ client?: { from: Function } | null, session?: object | null, id?: string, changes?: Record<string, unknown> }} [args]
 */
export async function updateCloudTrip(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const changes = args.changes ?? {}

  const configError = requireClient(client, 'update')
  if (configError) return { trip: null, error: configError }
  const authError = requireSession(session, 'update')
  if (authError) return { trip: null, error: authError }
  const idError = requireTripId(id)
  if (idError) return { trip: null, error: idError }

  const payload = cloudTripUpdatePayload(changes)
  if (!Object.keys(payload).length) return { trip: null, error: 'Nothing to update.' }
  const invalid = validateCloudTripPayload(payload, { partial: true })
  if (invalid) return { trip: null, error: invalid }

  const { data, error } = await client
    .from('trips')
    .update(payload)
    .eq('id', id)
    .select(CLOUD_TRIP_COLUMNS)
    .maybeSingle()

  if (error) {
    logCloudTripDetail(error)
    return { trip: null, error: formatCloudTripError(error, 'update') }
  }
  if (!data) return { trip: null, error: 'This cloud trip cannot be changed.' }

  return { trip: mapCloudTrip(data), error: null }
}

/**
 * Delete a cloud trip by database UUID. Child cleanup is database cascade / triggers.
 * @param {{ client?: { from: Function } | null, session?: object | null, id?: string }} [args]
 */
export async function deleteCloudTrip(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  const configError = requireClient(client, 'delete')
  if (configError) return { ok: false, error: configError }
  const authError = requireSession(session, 'delete')
  if (authError) return { ok: false, error: authError }
  const idError = requireTripId(id)
  if (idError) return { ok: false, error: idError }

  const { data, error } = await client.from('trips').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    logCloudTripDetail(error)
    return { ok: false, error: formatCloudTripError(error, 'delete') }
  }
  if (!data) return { ok: false, error: 'This cloud trip cannot be deleted.' }

  return { ok: true, error: null }
}
