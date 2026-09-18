/**
 * Cloud trip membership READ. Authorization is RLS on `trip_members`.
 * This module does not write to the local Travel OS store.
 */

import { isCloudTripId } from './cloud.js'

export const CLOUD_MEMBER_COLUMNS =
  'user_id, role, joined_at, profiles(id, name, short_name, email, initials, avatar_url)'

const ROLE_ORDER = { owner: 0, editor: 1, viewer: 2 }

export function formatCloudMemberError(error) {
  const message = String(error?.message ?? error ?? '').trim()
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim/i.test(message)) {
    return 'Sign in again to see people on this trip.'
  }
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    return 'Those people are not available to this account.'
  }
  if (/column|relation|schema cache/i.test(message)) {
    return 'People on this cloud trip could not be loaded just now.'
  }
  return 'People on this cloud trip could not be loaded just now.'
}

export function mapCloudTripMember(row) {
  if (!row) return null
  const profile = row.profiles && typeof row.profiles === 'object' && !Array.isArray(row.profiles) ? row.profiles : {}
  return {
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    name: profile.name || '',
    shortName: profile.short_name || '',
    email: profile.email || '',
    avatarUrl: profile.avatar_url ?? null,
    initials: profile.initials || '',
    source: 'cloud',
  }
}

function sortMembers(members) {
  return members.slice().sort((a, b) => {
    const roleA = ROLE_ORDER[a.role] ?? 9
    const roleB = ROLE_ORDER[b.role] ?? 9
    if (roleA !== roleB) return roleA - roleB
    return String(a.name || a.email).localeCompare(String(b.name || b.email))
  })
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string }} [args]
 */
export async function getCloudTripMembers(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) {
    return { members: [], error: 'Cloud trips are not connected on this device.' }
  }
  if (!session?.user) {
    return { members: [], error: 'Sign in to see people on this trip.' }
  }
  if (!isCloudTripId(tripId)) {
    return { members: [], error: 'That cloud trip could not be found.' }
  }

  const { data, error } = await client.from('trip_members').select(CLOUD_MEMBER_COLUMNS).eq('trip_id', tripId)

  if (error) {
    return { members: [], error: formatCloudMemberError(error) }
  }

  return {
    members: sortMembers((data ?? []).map(mapCloudTripMember).filter(Boolean)),
    error: null,
  }
}
