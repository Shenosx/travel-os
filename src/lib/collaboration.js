import { createId } from './format.js'
import { canChangeMemberRole, canOnTrip, canRemoveMember, getMemberRole } from './permissions.js'
import { userFromInvite } from './people.js'
import { isCloudTripId } from './trips/cloud.js'

export function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

export function createInviteToken() {
  return `${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {import('../types').Trip} trip
 * @param {Pick<import('../types').Invitation, 'inviteToken'>} invitation
 * @param {string} [origin]
 */
export function inviteLink(trip, invitation, origin = 'https://travelos.app') {
  return `${String(origin).replace(/\/$/, '')}/join/${trip.inviteCode}/${invitation.inviteToken}`
}

/**
 * Uses the current origin in the browser so copied links actually open this app.
 *
 * @param {import('../types').Trip} trip
 * @param {Pick<import('../types').Invitation, 'inviteToken'>} invitation
 */
export function liveInviteLink(trip, invitation) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://travelos.app'
  return inviteLink(trip, invitation, origin)
}

/**
 * @param {import('../types').User[]} users
 * @param {string} email
 * @param {string} [name]
 */
export function ensureUserForInvite(users, email, name) {
  const normalized = normalizeEmail(email)
  const existing = users.find((user) => user.email.toLowerCase() === normalized)
  if (existing) return { users, user: existing, created: false }
  const profile = userFromInvite(normalized, name)
  const user = { id: createId('user'), ...profile }
  return { users: [...users, user], user, created: true }
}

/**
 * @param {import('../types').Trip[]} trips
 * @param {import('../types').Invitation[]} invitations
 * @param {string} inviteCode
 * @param {string} token
 */
export function findJoinTarget(trips, invitations, inviteCode, token) {
  const trip = trips.find((item) => item.inviteCode === inviteCode)
  if (!trip) return { ok: false, reason: 'This invite link is no longer valid.' }
  const invitation = invitations.find(
    (item) => item.tripId === trip.id && item.inviteToken === token,
  )
  if (!invitation) return { ok: false, reason: 'This invite link is no longer valid.' }
  return { ok: true, trip, invitation }
}

/** @param {import('../types').Invitation} invitation */
export function isOpenInvitation(invitation) {
  return invitation.status === 'pending' || invitation.status === 'invited'
}

/**
 * @param {import('../types').Invitation[]} invitations
 * @param {string} tripId
 */
export function openInvitationsForTrip(invitations, tripId) {
  return invitations
    .filter((invitation) => invitation.tripId === tripId && isOpenInvitation(invitation))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * @param {import('../types').Invitation[]} invitations
 * @param {string} email
 */
export function openInvitationsForEmail(invitations, email) {
  const normalized = normalizeEmail(email)
  return invitations.filter(
    (invitation) => isOpenInvitation(invitation) && invitation.email === normalized,
  )
}

/**
 * @param {{
 *   trip: import('../types').Trip
 *   users: import('../types').User[]
 *   invitations: import('../types').Invitation[]
 *   actorId: string
 *   email: string
 *   role: 'editor' | 'viewer'
 *   status?: 'pending' | 'invited'
 *   now?: string
 *   token?: string
 *   name?: string
 * }} input
 */
export function upsertInvitation(input) {
  const { trip, users, invitations, actorId, role } = input
  if (trip?.source === 'cloud' || isCloudTripId(trip?.id)) {
    return { ok: false, reason: 'This cloud trip uses Cloud invitations.' }
  }
  if (!canOnTrip(trip, actorId, 'inviteMembers')) {
    return { ok: false, reason: 'You cannot invite people to this trip.' }
  }
  if (role !== 'editor' && role !== 'viewer') {
    return { ok: false, reason: 'Choose Editor or Viewer.' }
  }
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) {
    return { ok: false, reason: 'Enter a valid email address.' }
  }

  const existingUser = users.find((user) => user.email.toLowerCase() === email)
  if (existingUser && trip.members.some((member) => member.userId === existingUser.id)) {
    return { ok: false, reason: 'That person is already on this trip.' }
  }

  const now = input.now ?? new Date().toISOString()
  const profile = userFromInvite(email, input.name || existingUser?.name)
  const current = invitations.find(
    (invitation) => invitation.tripId === trip.id && invitation.email === email && isOpenInvitation(invitation),
  )

  /** @type {import('../types').Invitation} */
  const invitation = current
    ? {
        ...current,
        role,
        status: input.status === 'pending' || current.status === 'pending' ? 'pending' : (input.status ?? 'invited'),
        name: profile.name,
        inviteToken: current.inviteToken || input.token || createInviteToken(),
      }
    : {
        id: createId('inv'),
        tripId: trip.id,
        email,
        name: profile.name,
        role,
        status: input.status ?? 'pending',
        inviteToken: input.token ?? createInviteToken(),
        createdAt: now,
        invitedBy: actorId,
      }

  const nextInvitations = current
    ? invitations.map((item) => (item.id === invitation.id ? invitation : item))
    : [invitation, ...invitations]

  return { ok: true, invitation, invitations: nextInvitations, created: !current }
}

/**
 * @param {{
 *   trip: import('../types').Trip
 *   invitation: import('../types').Invitation
 *   users: import('../types').User[]
 *   actorId: string
 *   now?: string
 *   createUserId?: string
 * }} input
 */
export function acceptInvitation(input) {
  const { trip, invitation, users, actorId } = input
  if (!isOpenInvitation(invitation) || invitation.tripId !== trip.id) {
    return { ok: false, reason: 'This invitation is no longer open.' }
  }

  const actor = users.find((user) => user.id === actorId)
  if (!actor || normalizeEmail(actor.email) !== invitation.email) {
    return { ok: false, reason: 'This invitation belongs to someone else.' }
  }

  const alreadyMember = trip.members.some((member) => member.userId === actor.id)
  const nextTrip = alreadyMember
    ? trip
    : {
        ...trip,
        visibility: 'shared',
        members: [...trip.members, { userId: actor.id, role: invitation.role }],
      }

  return {
    ok: true,
    trip: nextTrip,
    invitation: {
      ...invitation,
      status: /** @type {const} */ ('joined'),
      joinedUserId: actor.id,
    },
    users,
    joinedUser: actor,
    now: input.now ?? new Date().toISOString(),
  }
}

/**
 * Join via invite link. Creates a local user for the invited email when needed.
 *
 * @param {{
 *   trip: import('../types').Trip
 *   invitation: import('../types').Invitation
 *   users: import('../types').User[]
 *   now?: string
 * }} input
 */
export function acceptInvitationAsInvitee(input) {
  const { trip, invitation } = input
  if (!isOpenInvitation(invitation) || invitation.tripId !== trip.id) {
    return { ok: false, reason: 'This invitation is no longer open.' }
  }
  const ensured = ensureUserForInvite(input.users, invitation.email, invitation.name)
  return acceptInvitation({
    trip,
    invitation,
    users: ensured.users,
    actorId: ensured.user.id,
    now: input.now,
  })
}

/**
 * @param {import('../types').Trip} trip
 * @param {string} actorId
 * @param {string} targetUserId
 * @param {'editor' | 'viewer'} nextRole
 */
export function changeMemberRole(trip, actorId, targetUserId, nextRole) {
  if (!canChangeMemberRole(trip, actorId, targetUserId, nextRole)) {
    return { ok: false, reason: 'That role cannot be changed.' }
  }
  return {
    ok: true,
    trip: {
      ...trip,
      members: trip.members.map((member) =>
        member.userId === targetUserId ? { ...member, role: nextRole } : member,
      ),
    },
  }
}

/**
 * Removes a member without touching historical expenses.
 *
 * @param {import('../types').Trip} trip
 * @param {string} actorId
 * @param {string} targetUserId
 */
export function removeMember(trip, actorId, targetUserId) {
  if (!canRemoveMember(trip, actorId, targetUserId)) {
    return { ok: false, reason: 'That person cannot be removed.' }
  }
  return {
    ok: true,
    trip: {
      ...trip,
      members: trip.members.filter((member) => member.userId !== targetUserId),
    },
  }
}

/**
 * @param {import('../types').TripPoll} poll
 * @param {string} userId
 * @param {string} optionId
 */
export function voteOnPoll(poll, userId, optionId) {
  if (!poll.options.some((option) => option.id === optionId)) {
    return { ok: false, reason: 'That option is not on this poll.' }
  }
  return {
    ok: true,
    poll: {
      ...poll,
      options: poll.options.map((option) => {
        const without = option.voterIds.filter((id) => id !== userId)
        if (option.id === optionId) {
          return { ...option, voterIds: [...without, userId] }
        }
        return { ...option, voterIds: without }
      }),
    },
  }
}

/**
 * @param {import('../types').TripPoll} poll
 * @param {string} userId
 */
export function getPollSelection(poll, userId) {
  return poll.options.find((option) => option.voterIds.includes(userId))?.id ?? null
}

/** @param {import('../types').TripPoll} poll */
export function getPollTotals(poll) {
  const counts = Object.fromEntries(poll.options.map((option) => [option.id, option.voterIds.length]))
  const total = poll.options.reduce((sum, option) => sum + option.voterIds.length, 0)
  return { counts, total }
}

export function canAccessTrip(trip, userId) {
  return getMemberRole(trip, userId) != null
}
