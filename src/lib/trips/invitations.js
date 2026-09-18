/**
 * Cloud trip invitations. Tokens are created and hashed by Phase 5B RPCs.
 * This module never inserts into trip_invitations, never hashes tokens,
 * and never writes to the local Travel OS store.
 */

import { isCloudTripId } from './cloud.js'

export const CLOUD_INVITE_ROLES = Object.freeze(['editor', 'viewer'])

export const CLOUD_INVITATION_COLUMNS = [
  'id',
  'trip_id',
  'email',
  'invited_name',
  'role',
  'status',
  'expires_at',
  'created_at',
  'accepted_at',
].join(', ')

const OPEN_STATUSES = new Set(['pending', 'invited'])

export function isOpenCloudInvitation(invitation) {
  return OPEN_STATUSES.has(invitation?.status)
}

export function mapCloudInvitation(row) {
  if (!row) return null
  return {
    id: row.id,
    tripId: row.trip_id,
    email: row.email,
    invitedName: row.invited_name || '',
    role: row.role,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at ?? null,
    source: 'cloud',
  }
}

function readRpcPayload(data) {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudInvitationError(error, action = 'load') {
  const raw = String(error?.message ?? error ?? '').trim()
  const message = redactSecrets(raw)
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim|must be authenticated/i.test(message)) {
    return 'Sign in to continue.'
  }
  if (/only the trip owner can create invitations/i.test(message)) {
    return 'Only the owner can invite people.'
  }
  if (/only the trip owner can revoke/i.test(message)) {
    return 'Only the owner can withdraw this invite.'
  }
  if (/invitations cannot grant owner/i.test(message)) {
    return 'Invitations can only be for editors or viewers.'
  }
  if (/enter a valid email/i.test(message)) {
    return 'Enter a valid email address.'
  }
  if (/already on this trip/i.test(message)) {
    return 'That person is already on this trip.'
  }
  if (/already a member/i.test(message)) {
    return "You're already on this trip."
  }
  if (/belongs to someone else/i.test(message)) {
    return 'This invitation belongs to a different account.'
  }
  if (/has expired/i.test(message)) {
    return 'This invite has expired.'
  }
  if (/cannot be reused|no longer open/i.test(message)) {
    return 'This invite was already used.'
  }
  if (/invitation is invalid|invitation not found/i.test(message)) {
    return 'This invite link is no longer valid.'
  }
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    if (action === 'create') return 'This invitation could not be created.'
    if (action === 'revoke') return 'This invitation could not be withdrawn.'
    if (action === 'accept') return 'This invite could not be accepted.'
    return 'Those invitations are not available to this account.'
  }
  if (action === 'create') return 'That invitation could not be created.'
  if (action === 'revoke') return 'That invitation could not be withdrawn.'
  if (action === 'accept') return 'This invite could not be accepted.'
  return 'Invitations could not be loaded just now.'
}

export function appOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return 'https://travelos.app'
}

export function cloudInviteLink(inviteCode, rawToken, origin = appOrigin()) {
  const base = String(origin || '').replace(/\/$/, '') || 'https://travelos.app'
  return `${base}/join/${encodeURIComponent(String(inviteCode ?? ''))}/${encodeURIComponent(String(rawToken ?? ''))}`
}

export function safeCloudJoinPath(path) {
  const value = String(path ?? '')
  if (!value.startsWith('/join/')) return null
  if (value.includes('://') || value.includes('//') || value.includes('\\') || value.includes('..')) return null
  const parts = value.split('/').filter(Boolean)
  if (parts.length !== 3 || parts[0] !== 'join') return null
  if (!parts[1] || !parts[2]) return null
  return `/join/${parts[1]}/${parts[2]}`
}

export function accountPathForJoin(joinPath) {
  const safe = safeCloudJoinPath(joinPath)
  if (!safe) return '/account'
  return `/account?next=${encodeURIComponent(safe)}`
}

function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string }} [args]
 */
export async function getCloudTripInvitations(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) {
    return { invitations: [], error: 'Cloud trips are not connected on this device.' }
  }
  if (!session?.user) {
    return { invitations: [], error: 'Sign in to see invitations.' }
  }
  if (!isCloudTripId(tripId)) {
    return { invitations: [], error: 'That cloud trip could not be found.' }
  }

  const { data, error } = await client
    .from('trip_invitation_summaries')
    .select(CLOUD_INVITATION_COLUMNS)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if (error) {
    return { invitations: [], error: formatCloudInvitationError(error) }
  }

  return {
    invitations: (data ?? []).map(mapCloudInvitation).filter(Boolean),
    error: null,
  }
}

/**
 * Owner-only via RPC. The database generates and hashes the token.
 * @param {{
 *   client?: { rpc: Function } | null,
 *   session?: object | null,
 *   tripId?: string,
 *   email?: string,
 *   role?: string,
 *   invitedName?: string,
 *   inviteCode?: string,
 *   origin?: string,
 * }} [args]
 */
export async function createCloudInvitation(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId
  const email = normalizeEmail(args.email)
  const role = String(args.role ?? '').trim()
  const invitedName = String(args.invitedName ?? '').trim()
  const inviteCode = String(args.inviteCode ?? '').trim()

  if (!client) {
    return { invitation: null, link: null, error: 'Cloud trips are not connected on this device.' }
  }
  if (!session?.user) {
    return { invitation: null, link: null, error: 'Sign in to invite someone.' }
  }
  if (!isCloudTripId(tripId)) {
    return { invitation: null, link: null, error: 'That cloud trip could not be found.' }
  }
  if (!CLOUD_INVITE_ROLES.includes(role)) {
    return { invitation: null, link: null, error: 'Invitations can only be for editors or viewers.' }
  }
  if (!isValidEmail(email)) {
    return { invitation: null, link: null, error: 'Enter a valid email address.' }
  }
  if (!inviteCode) {
    return { invitation: null, link: null, error: 'That invitation could not be created.' }
  }

  const { data, error } = await client.rpc('create_invitation', {
    p_trip_id: tripId,
    p_email: email,
    p_role: role,
    p_invited_name: invitedName,
  })

  if (error) {
    return { invitation: null, link: null, error: formatCloudInvitationError(error, 'create') }
  }

  const payload = readRpcPayload(data)
  const rawToken = typeof payload?.token === 'string' ? payload.token : ''
  if (!payload?.id || !rawToken) {
    return { invitation: null, link: null, error: 'That invitation could not be created.' }
  }

  const invitation = mapCloudInvitation({
    id: payload.id,
    trip_id: tripId,
    email,
    invited_name: invitedName,
    role,
    status: 'pending',
    expires_at: payload.expires_at ?? null,
    created_at: null,
    accepted_at: null,
  })

  return {
    invitation,
    link: cloudInviteLink(inviteCode, rawToken, args.origin),
    error: null,
  }
}

/**
 * @param {{ client?: { rpc: Function } | null, session?: object | null, id?: string }} [args]
 */
export async function revokeCloudInvitation(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to withdraw an invitation.' }
  if (!isCloudTripId(id)) return { ok: false, error: 'That invitation could not be found.' }

  const { error } = await client.rpc('revoke_invitation', { p_id: id })
  if (error) return { ok: false, error: formatCloudInvitationError(error, 'revoke') }
  return { ok: true, error: null }
}

/**
 * The raw token is the credential. invite_code is not used for authorization.
 * @param {{ client?: { rpc: Function } | null, session?: object | null, rawToken?: string }} [args]
 */
export async function acceptCloudInvitation(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const rawToken = String(args.rawToken ?? '').trim()

  if (!client) return { tripId: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { tripId: null, error: 'Sign in to accept this invitation.' }
  if (!rawToken) return { tripId: null, error: 'This invite link is no longer valid.' }

  const { data, error } = await client.rpc('accept_invitation', { p_raw_token: rawToken })
  if (error) return { tripId: null, error: formatCloudInvitationError(error, 'accept') }

  const tripId = typeof data === 'string' ? data : data?.toString?.() ?? null
  if (!tripId) return { tripId: null, error: 'This invite could not be accepted.' }
  return { tripId, error: null }
}

const JOIN_TRIP_COLUMNS = 'id, city, country, destination, start_date, end_date, invite_code, visibility'

/**
 * Safe identity after a successful accept. Not used as authorization.
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string }} [args]
 */
export async function getCloudTripIdentity(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId
  if (!client || !session?.user || !isCloudTripId(tripId)) return { trip: null, error: null }

  const { data, error } = await client.from('trips').select(JOIN_TRIP_COLUMNS).eq('id', tripId).maybeSingle()
  if (error || !data) return { trip: null, error: null }
  return {
    trip: {
      id: data.id,
      city: data.city,
      country: data.country,
      destination: data.destination,
      startDate: data.start_date,
      endDate: data.end_date,
      inviteCode: data.invite_code,
      visibility: data.visibility,
      source: 'cloud',
    },
    error: null,
  }
}

export async function copyText(value, clipboard) {
  const text = String(value ?? '')
  if (!text) return { ok: false, error: 'Nothing to copy.' }

  const api = clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : null)
  if (api?.writeText) {
    try {
      await api.writeText(text)
      return { ok: true, error: null }
    } catch {
      /* fall through */
    }
  }

  if (typeof document === 'undefined') {
    return { ok: false, error: 'Copy the link from the field below.' }
  }

  try {
    const input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(input)
    if (ok) return { ok: true, error: null }
  } catch {
    /* ignore */
  }

  return { ok: false, error: 'Copy the link from the field below.' }
}
