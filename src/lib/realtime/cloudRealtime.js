/**
 * Connected Cloud Trip realtime. Events are notifications only.
 * Application state is refreshed through existing authorized getCloud*() reads.
 * This module does not write to the local Travel OS store.
 */

import { isCloudTripId } from '../trips/cloud.js'

export const CLOUD_REALTIME_CHANNEL_PREFIX = 'cloud-trip:'
export const CLOUD_REALTIME_COALESCE_MS = 150
export const CLOUD_TRIP_GONE = 'This cloud trip is no longer available.'
export const CLOUD_TRIP_ACCESS_LOST = 'This cloud trip is no longer available to this account.'
export const CLOUD_REALTIME_UNAVAILABLE = 'Live updates temporarily unavailable.'

export const CLOUD_REALTIME_DOMAINS = Object.freeze([
  'trip',
  'people',
  'itinerary',
  'places',
  'bookings',
  'documents',
  'expenses',
  'polls',
  'activity',
  'access',
  'gone',
])

/** Tables with a trip-scoped postgres_changes filter. Smallest set for Cloud UI. */
export const CLOUD_REALTIME_TABLES = Object.freeze([
  { table: 'trips', column: 'id' },
  { table: 'trip_members', column: 'trip_id' },
  { table: 'trip_invitations', column: 'trip_id' },
  { table: 'itinerary_days', column: 'trip_id' },
  { table: 'itinerary_items', column: 'trip_id' },
  { table: 'places', column: 'trip_id' },
  { table: 'bookings', column: 'trip_id' },
  { table: 'booking_documents', column: 'trip_id' },
  { table: 'expenses', column: 'trip_id' },
  { table: 'polls', column: 'trip_id' },
  { table: 'activities', column: 'trip_id' },
])

export const CLOUD_REALTIME_EXCLUDED_TABLES = Object.freeze([
  'profiles',
  'expense_shares',
  'poll_options',
  'poll_votes',
])

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudRealtimeError(error) {
  const message = redactSecrets(String(error?.message ?? error ?? '').trim())
  const code = String(error?.code ?? '')
  if (!message && !code) return CLOUD_REALTIME_UNAVAILABLE
  if (/fetch|network|failed to fetch|timed out|CHANNEL_ERROR/i.test(message) || code === 'TIMED_OUT') {
    return CLOUD_REALTIME_UNAVAILABLE
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim/i.test(message)) {
    return 'Sign in to continue.'
  }
  if (/channel|realtime|websocket|subscription|postgres_changes|sqlstate|42501|relation/i.test(message)) {
    return CLOUD_REALTIME_UNAVAILABLE
  }
  return CLOUD_REALTIME_UNAVAILABLE
}

export function cloudRealtimeChannelName(tripId) {
  return `${CLOUD_REALTIME_CHANNEL_PREFIX}${tripId}`
}

export function buildCloudRealtimeFilter(column, tripId) {
  if (!isCloudTripId(tripId)) return null
  if (column !== 'id' && column !== 'trip_id') return null
  return `${column}=eq.${tripId}`
}

export function buildCloudRealtimeBindings(tripId) {
  if (!isCloudTripId(tripId)) return []
  return CLOUD_REALTIME_TABLES.map((item) => ({
    event: '*',
    schema: 'public',
    table: item.table,
    filter: buildCloudRealtimeFilter(item.column, tripId),
  })).filter((item) => item.filter)
}

export function mapCloudRealtimeEvent(payload = {}) {
  const table = String(payload.table ?? '')
  const eventType = String(payload.eventType ?? payload.event ?? '').toUpperCase()
  const hintType = typeof payload.new?.type === 'string' ? payload.new.type : ''

  switch (table) {
    case 'trips':
      return eventType === 'DELETE' ? ['trip', 'gone'] : ['trip']
    case 'trip_members':
      return ['people', 'access']
    case 'trip_invitations':
      return ['people']
    case 'itinerary_days':
    case 'itinerary_items':
      return ['itinerary']
    case 'places':
      return ['places', 'itinerary']
    case 'bookings':
      return ['bookings', 'itinerary']
    case 'booking_documents':
      return ['documents']
    case 'expenses':
      return ['expenses']
    case 'polls':
      return ['polls']
    case 'activities': {
      const domains = ['activity']
      if (hintType.startsWith('poll')) domains.push('polls')
      return domains
    }
    default:
      return []
  }
}

export function cloudRealtimeLostAccess(members, userId) {
  return Boolean(userId) && Array.isArray(members) && !members.some((member) => member.userId === userId)
}

export function createCloudRealtimeReload(reload, { userId, clear } = {}) {
  return async function handleCloudRealtime(domains) {
    if (domains.includes('gone')) {
      clear?.(CLOUD_TRIP_GONE)
      return
    }
    const result = await reload()
    if (domains.includes('access') && cloudRealtimeLostAccess(result?.members, userId)) {
      clear?.(CLOUD_TRIP_ACCESS_LOST)
    }
    return result
  }
}

export function createCloudRealtimeCoalescer({
  windowMs = CLOUD_REALTIME_COALESCE_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
  onFlush,
} = {}) {
  let timer = null
  const pending = new Set()

  function flush() {
    timer = null
    const batch = [...pending]
    pending.clear()
    if (batch.length) onFlush?.(batch)
  }

  function queue(domains = []) {
    for (const domain of domains) {
      if (domain) pending.add(domain)
    }
    if (!pending.size) return
    if (timer != null) cancel(timer)
    timer = schedule(flush, windowMs)
  }

  function dispose() {
    if (timer != null) cancel(timer)
    timer = null
    pending.clear()
  }

  return { queue, flush, dispose, pending }
}

export function subscribeCloudTripRealtime({ client, tripId, onChange, onStatus } = {}) {
  if (!client?.channel || !isCloudTripId(tripId)) {
    return { channel: null, channelName: null, bindings: [], unsubscribe() {} }
  }

  const channelName = cloudRealtimeChannelName(tripId)
  const bindings = buildCloudRealtimeBindings(tripId)
  let channel = client.channel(channelName)
  let subscribedOnce = false

  for (const binding of bindings) {
    channel = channel.on('postgres_changes', binding, (payload) => {
      const domains = mapCloudRealtimeEvent(payload)
      if (domains.length) onChange?.(domains)
    })
  }

  channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') {
      if (subscribedOnce) onChange?.([...CLOUD_REALTIME_DOMAINS.filter((item) => item !== 'gone' && item !== 'access')])
      subscribedOnce = true
      onStatus?.(status)
      return
    }
    onStatus?.(status, error)
  })

  function unsubscribe() {
    try {
      if (typeof client.removeChannel === 'function') client.removeChannel(channel)
      else channel.unsubscribe?.()
    } catch {
      /* already closed */
    }
  }

  return { channel, channelName, bindings, unsubscribe }
}

export function createCloudRealtimeRegistry(options = {}) {
  const live = new Map()
  const windowMs = options.windowMs ?? CLOUD_REALTIME_COALESCE_MS
  const schedule = options.schedule
  const cancel = options.cancel

  function notify(tripId, domains) {
    const entry = live.get(tripId)
    if (!entry) return
    for (const listener of entry.listeners) listener.onChange?.(domains)
  }

  function retain({ client, session, tripId, listener } = {}) {
    const release = () => {
      const entry = live.get(tripId)
      if (!entry) return
      entry.listeners.delete(listener)
      if (entry.listeners.size) return
      entry.coalescer.dispose()
      entry.unsubscribe()
      live.delete(tripId)
    }

    if (!client || !session?.user || !isCloudTripId(tripId) || !listener) {
      return { release() {} }
    }

    let entry = live.get(tripId)
    if (!entry) {
      const coalescer = createCloudRealtimeCoalescer({
        windowMs,
        ...(schedule ? { schedule } : {}),
        ...(cancel ? { cancel } : {}),
        onFlush: (domains) => notify(tripId, domains),
      })
      const subscription = subscribeCloudTripRealtime({
        client,
        tripId,
        onChange: (domains) => coalescer.queue(domains),
        onStatus: (status, error) => {
          const current = live.get(tripId)
          if (!current) return
          current.status = status
          current.error = status === 'SUBSCRIBED' ? null : error
          for (const item of current.listeners) item.onStatus?.(status, error)
        },
      })
      entry = {
        listeners: new Set(),
        coalescer,
        status: 'joining',
        error: null,
        ...subscription,
      }
      live.set(tripId, entry)
    }

    entry.listeners.add(listener)
    if (entry.status) listener.onStatus?.(entry.status, entry.error)
    return { release }
  }

  function inspect(tripId) {
    const entry = live.get(tripId)
    if (!entry) return null
    return {
      refCount: entry.listeners.size,
      channelName: entry.channelName,
      bindings: entry.bindings,
      status: entry.status,
      channel: entry.channel,
    }
  }

  function activeTripIds() {
    return [...live.keys()]
  }

  function reset() {
    for (const tripId of [...live.keys()]) {
      const entry = live.get(tripId)
      entry?.coalescer.dispose()
      entry?.unsubscribe()
      live.delete(tripId)
    }
  }

  return { retain, inspect, activeTripIds, reset }
}

export const cloudRealtimeRegistry = createCloudRealtimeRegistry()
