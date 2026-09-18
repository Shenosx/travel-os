/**
 * Cloud trip itinerary. Writes go through itinerary_days / itinerary_items under RLS.
 * created_by and updated_by are derived by Phase 5B triggers from auth.uid().
 * This module does not write to the local Travel OS store.
 */

import { tripDayNumber } from '../dates.js'
import { attachClientRowId, recoverDuplicateInsert } from './clientRowId.js'
import { isCloudTripId } from './cloud.js'

export const CLOUD_ITINERARY_CATEGORIES = [
  'arrival',
  'departure',
  'lodging',
  'food',
  'sight',
  'transport',
  'free',
]

export const CLOUD_ITINERARY_DAY_COLUMNS = [
  'id',
  'trip_id',
  'date',
  'day_number',
  'title',
  'created_at',
  'updated_at',
].join(', ')

export const CLOUD_ITINERARY_ITEM_COLUMNS = [
  'id',
  'trip_id',
  'day_id',
  'item_date',
  'sort_order',
  'time',
  'start_time',
  'end_time',
  'title',
  'category',
  'place_label',
  'notes',
  'place_id',
  'booking_id',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
].join(', ')

export const CLOUD_ITINERARY_DAY_INSERT_COLUMNS = Object.freeze(['trip_id', 'date', 'day_number', 'title'])

export const CLOUD_ITINERARY_DAY_UPDATE_COLUMNS = Object.freeze(
  CLOUD_ITINERARY_DAY_INSERT_COLUMNS.filter((column) => column !== 'trip_id'),
)

export const CLOUD_ITINERARY_ITEM_INSERT_COLUMNS = Object.freeze([
  'trip_id',
  'day_id',
  'item_date',
  'sort_order',
  'time',
  'start_time',
  'end_time',
  'title',
  'category',
  'place_label',
  'notes',
  'place_id',
  'booking_id',
])

export const CLOUD_ITINERARY_ITEM_UPDATE_COLUMNS = Object.freeze(
  CLOUD_ITINERARY_ITEM_INSERT_COLUMNS.filter((column) => column !== 'trip_id'),
)

export const CLOUD_ITINERARY_FORBIDDEN_WRITE_COLUMNS = Object.freeze([
  'id',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'owner_id',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CATEGORY_SET = new Set(CLOUD_ITINERARY_CATEGORIES)

const ACTION_FALLBACK = {
  load: 'The itinerary could not be loaded just now.',
  create: 'This stop could not be saved.',
  update: 'This stop could not be saved.',
  delete: 'This stop could not be deleted.',
  dayCreate: 'This day could not be saved.',
  dayUpdate: 'This day could not be saved.',
  dayDelete: 'This day could not be deleted.',
}

export function isCloudItineraryId(value) {
  return UUID_RE.test(String(value ?? ''))
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudItineraryError(error, action = 'load') {
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
    if (action === 'create' || action === 'update' || action === 'dayCreate' || action === 'dayUpdate') {
      return action.startsWith('day') ? 'This day could not be saved.' : 'This stop could not be saved.'
    }
    if (action === 'delete' || action === 'dayDelete') {
      return action === 'dayDelete' ? 'This day could not be deleted.' : 'This stop could not be deleted.'
    }
    return 'This itinerary is not available to this account.'
  }
  if (code === 'PGRST116' || /no rows/i.test(message)) {
    if (action === 'update' || action === 'dayUpdate') return 'This itinerary cannot be changed.'
    if (action === 'delete' || action === 'dayDelete') return 'This itinerary could not be deleted.'
    return 'That itinerary could not be found.'
  }
  if (code === '23505' || /duplicate|unique/i.test(message)) {
    return 'That day is already on this itinerary.'
  }
  if (code === '23514' || code === '23502' || /check constraint|not-null constraint|invalid input value for enum/i.test(message)) {
    return 'Check the day, time, and details, then try again.'
  }
  if (code === '23503' || /foreign key|_trip_fkey/i.test(message)) {
    return 'That place, booking, or day could not be linked.'
  }
  if (/column|relation|schema cache/i.test(message)) {
    return fallback
  }
  return fallback
}

function logCloudItineraryDetail(error) {
  try {
    if (import.meta?.env?.DEV) console.error('[cloud itinerary]', error)
  } catch {
    /* node tests and non-vite runtimes */
  }
}

export function mapCloudItineraryDay(row) {
  if (!row) return null
  return {
    id: row.id,
    tripId: row.trip_id,
    date: row.date,
    dayNumber: Number(row.day_number),
    title: row.title ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: Array.isArray(row.items) ? row.items.map(mapCloudItineraryItem).filter(Boolean) : [],
    source: 'cloud',
  }
}

export function mapCloudItineraryItem(row) {
  if (!row) return null
  return {
    id: row.id,
    tripId: row.trip_id,
    dayId: row.day_id ?? null,
    itemDate: row.item_date,
    sortOrder: Number(row.sort_order ?? 0),
    time: row.time ?? '',
    startTime: row.start_time ?? '',
    endTime: row.end_time ?? '',
    title: row.title,
    category: row.category,
    placeLabel: row.place_label ?? '',
    notes: row.notes ?? '',
    placeId: row.place_id ?? null,
    bookingId: row.booking_id ?? null,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'cloud',
  }
}

export function assembleCloudItinerary(days = [], items = []) {
  const sortedDays = days.slice().sort((a, b) => {
    const left = Number(a.dayNumber) - Number(b.dayNumber)
    if (left) return left
    return String(a.date).localeCompare(String(b.date))
  })
  const byDate = new Map()
  for (const day of sortedDays) {
    byDate.set(day.date, { ...day, items: [] })
  }
  const sortedItems = items.slice().sort((a, b) => {
    const date = String(a.itemDate).localeCompare(String(b.itemDate))
    if (date) return date
    return Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
  })
  for (const item of sortedItems) {
    const day = byDate.get(item.itemDate)
    if (day) {
      day.items.push(item)
      continue
    }
    byDate.set(item.itemDate, {
      id: null,
      tripId: item.tripId,
      date: item.itemDate,
      dayNumber: null,
      title: '',
      items: [item],
      source: 'cloud',
    })
  }
  return {
    days: [...byDate.values()].sort((a, b) => {
      if (a.dayNumber != null && b.dayNumber != null && a.dayNumber !== b.dayNumber) {
        return a.dayNumber - b.dayNumber
      }
      return String(a.date).localeCompare(String(b.date))
    }),
    source: 'cloud',
  }
}

export function nextCloudItinerarySortOrder(items = [], itemDate) {
  const onDay = items.filter((item) => item.itemDate === itemDate)
  if (!onDay.length) return 0
  return Math.max(...onDay.map((item) => Number(item.sortOrder ?? 0))) + 1
}

export function cloudItineraryDayNumberFor(trip, date, existingDays = []) {
  const fromTrip = trip ? tripDayNumber(trip, date) : null
  if (fromTrip) return fromTrip
  const max = existingDays.reduce((highest, day) => Math.max(highest, Number(day.dayNumber) || 0), 0)
  return max + 1
}

export function cloudItineraryReorderPlan(orderedIds = []) {
  return orderedIds.map((id, index) => ({ id, sort_order: index }))
}

/** Presentation only. RLS remains the authorization boundary. */
export function cloudItineraryCapabilities(role) {
  const canRead = Boolean(role)
  const canMutate = role === 'owner' || role === 'editor'
  return { canRead, canCreate: canMutate, canEdit: canMutate, canDelete: canMutate }
}

export function cloudItineraryAttribution(item, members = [], currentUserId) {
  const label = (userId) => {
    if (!userId) return ''
    if (userId === currentUserId) return 'You'
    const member = members.find((person) => person.userId === userId)
    return member?.shortName || member?.name || 'Someone'
  }
  if (item?.updatedBy && item.updatedBy !== item.createdBy && item.updatedBy !== currentUserId) {
    return `Updated by ${label(item.updatedBy)}`
  }
  if (item?.createdBy && item.createdBy !== currentUserId) {
    return `Added by ${label(item.createdBy)}`
  }
  return null
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

function intValue(value) {
  if (value === undefined) return undefined
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  return Math.trunc(parsed)
}

function uuidValue(value) {
  if (value === undefined) return undefined
  if (value == null || value === '') return null
  return String(value)
}

function stripForbidden(payload) {
  for (const key of CLOUD_ITINERARY_FORBIDDEN_WRITE_COLUMNS) {
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

export function cloudItineraryDayInsertPayload(input = {}, options = {}) {
  const tripId = options.tripId ?? readField(input, 'trip_id', 'tripId')
  const payload = {
    trip_id: tripId,
    date: optionalText(readField(input, 'date')),
    day_number: intValue(readField(input, 'day_number', 'dayNumber')),
    title: optionalText(readField(input, 'title'), { emptyToNull: false }) ?? '',
  }
  return pickAllowed(stripForbidden(payload), CLOUD_ITINERARY_DAY_INSERT_COLUMNS)
}

export function cloudItineraryDayUpdatePayload(changes = {}) {
  const payload = {}
  if (hasOwn(changes, 'date')) payload.date = optionalText(changes.date)
  if (hasOwn(changes, 'day_number', 'dayNumber')) payload.day_number = intValue(readField(changes, 'day_number', 'dayNumber'))
  if (hasOwn(changes, 'title')) payload.title = optionalText(changes.title, { emptyToNull: false }) ?? ''
  delete payload.trip_id
  return pickAllowed(stripForbidden(payload), CLOUD_ITINERARY_DAY_UPDATE_COLUMNS)
}

function assignItemFields(payload, input) {
  if (hasOwn(input, 'day_id', 'dayId')) payload.day_id = uuidValue(readField(input, 'day_id', 'dayId'))
  if (hasOwn(input, 'item_date', 'itemDate', 'date')) {
    payload.item_date = optionalText(readField(input, 'item_date', 'itemDate', 'date'))
  }
  if (hasOwn(input, 'sort_order', 'sortOrder')) {
    payload.sort_order = intValue(readField(input, 'sort_order', 'sortOrder'))
  }
  if (hasOwn(input, 'time')) payload.time = optionalText(input.time)
  if (hasOwn(input, 'start_time', 'startTime')) payload.start_time = optionalText(readField(input, 'start_time', 'startTime'))
  if (hasOwn(input, 'end_time', 'endTime')) payload.end_time = optionalText(readField(input, 'end_time', 'endTime'))
  if (hasOwn(input, 'title')) payload.title = optionalText(input.title, { emptyToNull: false }) ?? ''
  if (hasOwn(input, 'category')) payload.category = optionalText(input.category)
  if (hasOwn(input, 'place_label', 'placeLabel')) {
    payload.place_label = optionalText(readField(input, 'place_label', 'placeLabel'))
  } else if (hasOwn(input, 'place') && (input.place == null || typeof input.place === 'string')) {
    payload.place_label = optionalText(input.place)
  }
  if (hasOwn(input, 'notes')) payload.notes = optionalText(input.notes, { emptyToNull: false }) ?? ''
  if (hasOwn(input, 'place_id', 'placeId')) payload.place_id = uuidValue(readField(input, 'place_id', 'placeId'))
  if (hasOwn(input, 'booking_id', 'bookingId')) payload.booking_id = uuidValue(readField(input, 'booking_id', 'bookingId'))
  return payload
}

export function cloudItineraryItemInsertPayload(input = {}, options = {}) {
  const tripId = options.tripId ?? readField(input, 'trip_id', 'tripId')
  const payload = {
    trip_id: tripId,
    item_date: optionalText(readField(input, 'item_date', 'itemDate', 'date')),
    sort_order: intValue(readField(input, 'sort_order', 'sortOrder')) ?? 0,
    title: optionalText(readField(input, 'title'), { emptyToNull: false }) ?? '',
    category: optionalText(readField(input, 'category')) ?? 'free',
    notes: optionalText(readField(input, 'notes'), { emptyToNull: false }) ?? '',
  }
  assignItemFields(payload, input)
  return pickAllowed(stripForbidden(payload), CLOUD_ITINERARY_ITEM_INSERT_COLUMNS)
}

export function cloudItineraryItemUpdatePayload(changes = {}) {
  const payload = {}
  assignItemFields(payload, changes)
  delete payload.trip_id
  return pickAllowed(stripForbidden(payload), CLOUD_ITINERARY_ITEM_UPDATE_COLUMNS)
}

export function validateCloudItineraryDayPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'This day could not be saved.'
  if (!partial) {
    if (!isCloudTripId(payload.trip_id)) return 'That cloud trip could not be found.'
    if (!payload.date) return 'Choose a day.'
    if (payload.day_number == null) return 'Choose a day.'
  }
  if (payload.date != null && payload.date !== '' && !DATE_RE.test(String(payload.date))) {
    return 'Check the day, time, and details, then try again.'
  }
  if (payload.day_number != null && (Number.isNaN(payload.day_number) || payload.day_number < 1)) {
    return 'Check the day, time, and details, then try again.'
  }
  return null
}

export function validateCloudItineraryItemPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object') return 'This stop could not be saved.'
  if (!partial) {
    if (!isCloudTripId(payload.trip_id)) return 'That cloud trip could not be found.'
    if (!payload.title) return 'Add a stop title.'
    if (!payload.item_date) return 'Choose a day.'
  }
  if (payload.title !== undefined && !String(payload.title).trim()) return 'Add a stop title.'
  if (payload.item_date != null && payload.item_date !== '' && !DATE_RE.test(String(payload.item_date))) {
    return 'Check the day, time, and details, then try again.'
  }
  if (payload.category != null && !CATEGORY_SET.has(payload.category)) return 'Choose a category.'
  if (payload.sort_order != null && Number.isNaN(payload.sort_order)) {
    return 'Check the day, time, and details, then try again.'
  }
  for (const key of ['place_id', 'booking_id', 'day_id']) {
    if (payload[key] != null && !isCloudItineraryId(payload[key])) {
      if (key === 'booking_id') return 'That booking could not be linked.'
      if (key === 'day_id') return 'Choose a day.'
      return 'That place could not be linked.'
    }
  }
  return null
}

export async function getCloudItineraryDays(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) return { days: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { days: [], error: 'Sign in to see this itinerary.' }
  if (!isCloudTripId(tripId)) return { days: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('itinerary_days')
    .select(CLOUD_ITINERARY_DAY_COLUMNS)
    .eq('trip_id', tripId)
    .order('day_number', { ascending: true })

  if (error) {
    logCloudItineraryDetail(error)
    return { days: [], error: formatCloudItineraryError(error) }
  }

  return {
    days: (data ?? []).map(mapCloudItineraryDay).filter(Boolean),
    error: null,
  }
}

export async function getCloudItineraryItems(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) return { items: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { items: [], error: 'Sign in to see this itinerary.' }
  if (!isCloudTripId(tripId)) return { items: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('itinerary_items')
    .select(CLOUD_ITINERARY_ITEM_COLUMNS)
    .eq('trip_id', tripId)
    .order('item_date', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) {
    logCloudItineraryDetail(error)
    return { items: [], error: formatCloudItineraryError(error) }
  }

  return {
    items: (data ?? []).map(mapCloudItineraryItem).filter(Boolean),
    error: null,
  }
}

export async function getCloudItinerary(args = {}) {
  const daysResult = await getCloudItineraryDays(args)
  if (daysResult.error) {
    return { itinerary: { days: [], source: 'cloud' }, days: [], items: [], error: daysResult.error }
  }
  const itemsResult = await getCloudItineraryItems(args)
  if (itemsResult.error) {
    return { itinerary: { days: daysResult.days, source: 'cloud' }, days: daysResult.days, items: [], error: itemsResult.error }
  }
  return {
    itinerary: assembleCloudItinerary(daysResult.days, itemsResult.items),
    days: daysResult.days,
    items: itemsResult.items,
    error: null,
  }
}

export async function createCloudItineraryDay(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const input = args.input ?? {}

  if (!client) return { day: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { day: null, error: 'Sign in to add a day.' }

  const payload = cloudItineraryDayInsertPayload(input, { tripId: args.tripId })
  attachClientRowId(payload, args.id)
  const invalid = validateCloudItineraryDayPayload(payload)
  if (invalid) return { day: null, error: invalid }

  const { data, error } = await client
    .from('itinerary_days')
    .insert(payload)
    .select(CLOUD_ITINERARY_DAY_COLUMNS)
    .single()

  if (error) {
    logCloudItineraryDetail(error)
    const recovered = await recoverDuplicateInsert({
      client,
      table: 'itinerary_days',
      columns: CLOUD_ITINERARY_DAY_COLUMNS,
      id: args.id,
      error,
    })
    if (recovered.recovered) return { day: mapCloudItineraryDay(recovered.data), error: null }
    return { day: null, error: formatCloudItineraryError(error, 'dayCreate') }
  }

  return { day: mapCloudItineraryDay(data), error: null }
}

export async function updateCloudItineraryDay(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const changes = args.changes ?? {}

  if (!client) return { day: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { day: null, error: 'Sign in to update a day.' }
  if (!isCloudItineraryId(id)) return { day: null, error: 'That day could not be found.' }

  const payload = cloudItineraryDayUpdatePayload(changes)
  if (!Object.keys(payload).length) return { day: null, error: 'Nothing to update.' }
  const invalid = validateCloudItineraryDayPayload(payload, { partial: true })
  if (invalid) return { day: null, error: invalid }

  const { data, error } = await client
    .from('itinerary_days')
    .update(payload)
    .eq('id', id)
    .select(CLOUD_ITINERARY_DAY_COLUMNS)
    .maybeSingle()

  if (error) {
    logCloudItineraryDetail(error)
    return { day: null, error: formatCloudItineraryError(error, 'dayUpdate') }
  }
  if (!data) return { day: null, error: 'This day cannot be changed.' }

  return { day: mapCloudItineraryDay(data), error: null }
}

export async function deleteCloudItineraryDay(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete a day.' }
  if (!isCloudItineraryId(id)) return { ok: false, error: 'That day could not be found.' }

  const { data, error } = await client.from('itinerary_days').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    logCloudItineraryDetail(error)
    return { ok: false, error: formatCloudItineraryError(error, 'dayDelete') }
  }
  if (!data) return { ok: false, error: 'This day could not be deleted.' }
  return { ok: true, error: null }
}

export async function createCloudItineraryItem(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const input = args.input ?? {}

  if (!client) return { item: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { item: null, error: 'Sign in to add a stop.' }

  const payload = cloudItineraryItemInsertPayload(input, { tripId: args.tripId })
  attachClientRowId(payload, args.id)
  const invalid = validateCloudItineraryItemPayload(payload)
  if (invalid) return { item: null, error: invalid }

  const { data, error } = await client
    .from('itinerary_items')
    .insert(payload)
    .select(CLOUD_ITINERARY_ITEM_COLUMNS)
    .single()

  if (error) {
    logCloudItineraryDetail(error)
    const recovered = await recoverDuplicateInsert({
      client,
      table: 'itinerary_items',
      columns: CLOUD_ITINERARY_ITEM_COLUMNS,
      id: args.id,
      error,
    })
    if (recovered.recovered) return { item: mapCloudItineraryItem(recovered.data), error: null }
    return { item: null, error: formatCloudItineraryError(error, 'create') }
  }

  return { item: mapCloudItineraryItem(data), error: null }
}

export async function updateCloudItineraryItem(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const changes = args.changes ?? {}

  if (!client) return { item: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { item: null, error: 'Sign in to update a stop.' }
  if (!isCloudItineraryId(id)) return { item: null, error: 'That stop could not be found.' }

  const payload = cloudItineraryItemUpdatePayload(changes)
  if (!Object.keys(payload).length) return { item: null, error: 'Nothing to update.' }
  const invalid = validateCloudItineraryItemPayload(payload, { partial: true })
  if (invalid) return { item: null, error: invalid }

  const { data, error } = await client
    .from('itinerary_items')
    .update(payload)
    .eq('id', id)
    .select(CLOUD_ITINERARY_ITEM_COLUMNS)
    .maybeSingle()

  if (error) {
    logCloudItineraryDetail(error)
    return { item: null, error: formatCloudItineraryError(error, 'update') }
  }
  if (!data) return { item: null, error: 'This stop cannot be changed.' }

  return { item: mapCloudItineraryItem(data), error: null }
}

export async function deleteCloudItineraryItem(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete a stop.' }
  if (!isCloudItineraryId(id)) return { ok: false, error: 'That stop could not be found.' }

  const { data, error } = await client.from('itinerary_items').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    logCloudItineraryDetail(error)
    return { ok: false, error: formatCloudItineraryError(error, 'delete') }
  }
  if (!data) return { ok: false, error: 'This stop could not be deleted.' }
  return { ok: true, error: null }
}

/**
 * Sequential sort_order updates. Not a multi-row transaction.
 * @param {{ client?: object | null, session?: object | null, orderedIds?: string[] }} args
 */
export async function reorderCloudItineraryItems(args = {}) {
  const orderedIds = args.orderedIds ?? []
  const plan = cloudItineraryReorderPlan(orderedIds)
  const items = []
  for (const step of plan) {
    const result = await updateCloudItineraryItem({
      client: args.client,
      session: args.session,
      id: step.id,
      changes: { sortOrder: step.sort_order },
    })
    if (result.error) return { items, error: result.error }
    items.push(result.item)
  }
  return { items, error: null }
}

/**
 * Move an existing item to another day by item_date / sort_order / day_id.
 * Does not create a new row.
 */
export async function moveCloudItineraryItem(args = {}) {
  const changes = {
    itemDate: args.itemDate ?? args.item_date,
    sortOrder: args.sortOrder ?? args.sort_order,
  }
  if (args.dayId !== undefined || args.day_id !== undefined) {
    changes.dayId = args.dayId ?? args.day_id
  }
  return updateCloudItineraryItem({
    client: args.client,
    session: args.session,
    id: args.id,
    changes,
  })
}
