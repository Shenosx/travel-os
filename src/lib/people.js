import { getUserById } from '../data/mock.js'

export const ROLE_ORDER = { owner: 0, editor: 1, viewer: 2 }

export const ROLE_LABEL = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
}

/**
 * @param {string} userId
 * @param {import('../types').User[]} users
 */
export function resolveUser(userId, users) {
  return (
    getUserById(userId, users) ?? {
      id: userId,
      name: 'Former traveller',
      shortName: 'Former',
      email: '',
      initials: '?',
    }
  )
}

/**
 * @param {string} name
 * @param {string} [email]
 */
export function initialsFromName(name, email = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  if (parts[0]?.length) return parts[0].slice(0, 2).toUpperCase()
  return (email[0] || '?').toUpperCase()
}

/**
 * @param {string} email
 * @param {string} [name]
 */
export function userFromInvite(email, name) {
  const local = email.split('@')[0] || 'Guest'
  const display = name?.trim() || local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const shortName = display.split(/\s+/)[0]
  return {
    name: display,
    shortName,
    email: email.trim().toLowerCase(),
    initials: initialsFromName(display, email),
  }
}

/**
 * Current members plus anyone still on historical expenses.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {import('../types').Expense[]} expenses
 * @param {import('../types').User[]} users
 */
export function peopleForTrip(trip, expenses = [], users = []) {
  if (!trip) return []
  const memberIds = trip.members.map((member) => member.userId)
  const actorIds = new Set(memberIds)
  for (const expense of expenses) {
    if (expense.tripId !== trip.id) continue
    actorIds.add(expense.payerId)
    for (const share of expense.shares) actorIds.add(share.userId)
  }

  const roleByUser = Object.fromEntries(trip.members.map((member) => [member.userId, member.role]))

  return [...actorIds]
    .map((userId) => ({
      userId,
      role: roleByUser[userId] ?? null,
      former: !roleByUser[userId],
      user: resolveUser(userId, users),
    }))
    .sort((a, b) => {
      const roleA = ROLE_ORDER[a.role] ?? 9
      const roleB = ROLE_ORDER[b.role] ?? 9
      if (roleA !== roleB) return roleA - roleB
      return a.user.name.localeCompare(b.user.name)
    })
}

/**
 * @param {import('../types').Trip} trip
 * @param {import('../types').User[]} users
 */
export function membersForTrip(trip, users) {
  return [...trip.members]
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .map((member) => ({
      ...member,
      user: resolveUser(member.userId, users),
    }))
}
