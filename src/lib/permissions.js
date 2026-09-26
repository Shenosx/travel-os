/**
 * Central permission rules for shared trips.
 * UI should hide unavailable actions, and data mutations must also call these.
 *
 * @typedef {'viewTrip' | 'editTrip' | 'editItinerary' | 'addExpense' | 'editExpense' | 'deleteExpense' | 'addPlace' | 'editPlace' | 'deletePlace' | 'addBooking' | 'editBooking' | 'deleteBooking' | 'viewMembers' | 'manageMembers' | 'inviteMembers' | 'changeMemberRole' | 'removeMember' | 'deleteTrip' | 'votePoll'} PermissionAction
 */

/** @type {Record<import('../types').MemberRole, Set<string>>} */
const ROLE_GRANTS = {
  owner: new Set([
    'viewTrip',
    'editTrip',
    'editItinerary',
    'addExpense',
    'editExpense',
    'deleteExpense',
    'addPlace',
    'editPlace',
    'deletePlace',
    'addBooking',
    'editBooking',
    'deleteBooking',
    'viewMembers',
    'manageMembers',
    'inviteMembers',
    'changeMemberRole',
    'removeMember',
    'deleteTrip',
    'votePoll',
  ]),
  editor: new Set([
    'viewTrip',
    'editItinerary',
    'addExpense',
    'addPlace',
    'editPlace',
    'addBooking',
    'editBooking',
    'viewMembers',
    'votePoll',
  ]),
  viewer: new Set(['viewTrip', 'viewMembers', 'votePoll']),
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @returns {import('../types').MemberRole | null}
 */
export function getMemberRole(trip, userId) {
  if (!trip || !userId) return null
  return trip.members.find((member) => member.userId === userId)?.role ?? null
}

/**
 * @param {import('../types').MemberRole | null} role
 * @param {PermissionAction} action
 */
export function can(role, action) {
  if (!role) return false
  return ROLE_GRANTS[role]?.has(action) === true
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {PermissionAction} action
 */
export function canOnTrip(trip, userId, action) {
  return can(getMemberRole(trip, userId), action)
}

/** @param {import('../types').Expense} expense */
export function getExpenseOwnerId(expense) {
  return expense.createdBy ?? expense.payerId
}

/**
 * Editors may change only expenses they created. Owners may change any.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Expense} expense
 */
export function canEditExpense(trip, userId, expense) {
  const role = getMemberRole(trip, userId)
  if (role === 'owner') return true
  if (role === 'editor') return getExpenseOwnerId(expense) === userId
  return false
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Expense} expense
 */
export function canDeleteExpense(trip, userId, expense) {
  return canEditExpense(trip, userId, expense)
}

/**
 * Owners may remove any repayment. Editors may remove only ones they recorded.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Repayment} repayment
 */
export function canDeleteRepayment(trip, userId, repayment) {
  const role = getMemberRole(trip, userId)
  if (role === 'owner') return true
  if (role === 'editor') return getRecordOwnerId(repayment) === userId
  return false
}

/** @param {{ createdBy?: string }} record */
export function getRecordOwnerId(record) {
  return record?.createdBy ?? null
}

/**
 * Editors may edit any place on the trip. Owners may always edit.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Place} [place]
 */
export function canEditPlace(trip, userId, place) {
  if (!canOnTrip(trip, userId, 'editPlace')) return false
  return Boolean(place)
}

/**
 * Editors may delete only places they created. Owners may delete any.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Place} place
 */
export function canDeletePlace(trip, userId, place) {
  const role = getMemberRole(trip, userId)
  if (role === 'owner') return true
  if (role === 'editor') return getRecordOwnerId(place) === userId
  return false
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Booking} [booking]
 */
export function canEditBooking(trip, userId, booking) {
  if (!canOnTrip(trip, userId, 'editBooking')) return false
  return Boolean(booking)
}

/**
 * Packing follows the existing trip edit model: owners and editors may change
 * it, viewers may only look.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 */
export function canEditPacking(trip, userId) {
  return canOnTrip(trip, userId, 'editItinerary')
}

/**
 * Checklist follows the same trip edit model as packing.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 */
export function canEditChecklist(trip, userId) {
  return canOnTrip(trip, userId, 'editItinerary')
}

/**
 * Notes follow the same trip edit model as packing and checklist.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 */
export function canEditNotes(trip, userId) {
  return canOnTrip(trip, userId, 'editItinerary')
}

/**
 * Editors may delete only bookings they created. Owners may delete any.
 *
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 * @param {import('../types').Booking} booking
 */
export function canDeleteBooking(trip, userId, booking) {
  const role = getMemberRole(trip, userId)
  if (role === 'owner') return true
  if (role === 'editor') return getRecordOwnerId(booking) === userId
  return false
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} actorId
 * @param {string} targetUserId
 * @param {import('../types').MemberRole} nextRole
 */
export function canChangeMemberRole(trip, actorId, targetUserId, nextRole) {
  if (!canOnTrip(trip, actorId, 'changeMemberRole')) return false
  if (targetUserId === trip.ownerId) return false
  if (nextRole === 'owner') return false
  const target = trip.members.find((member) => member.userId === targetUserId)
  if (!target || target.role === 'owner') return false
  return nextRole === 'editor' || nextRole === 'viewer'
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} actorId
 * @param {string} targetUserId
 */
export function canRemoveMember(trip, actorId, targetUserId) {
  if (!canOnTrip(trip, actorId, 'removeMember')) return false
  if (targetUserId === trip.ownerId) return false
  const target = trip.members.find((member) => member.userId === targetUserId)
  return Boolean(target && target.role !== 'owner')
}

/**
 * @param {import('../types').Trip | null | undefined} trip
 * @param {string} userId
 */
export function getTripPermissions(trip, userId) {
  const role = getMemberRole(trip, userId)
  return {
    role,
    canView: can(role, 'viewTrip'),
    canEditTrip: can(role, 'editTrip'),
    canEditItinerary: can(role, 'editItinerary'),
    canEditPacking: can(role, 'editItinerary'),
    canEditChecklist: can(role, 'editItinerary'),
    canEditNotes: can(role, 'editItinerary'),
    canAddExpense: can(role, 'addExpense'),
    canAddPlace: can(role, 'addPlace'),
    canAddBooking: can(role, 'addBooking'),
    canViewMembers: can(role, 'viewMembers'),
    canManageMembers: can(role, 'manageMembers'),
    canInvite: can(role, 'inviteMembers'),
    canChangeMemberRole: can(role, 'changeMemberRole'),
    canRemoveMember: can(role, 'removeMember'),
    canDeleteTrip: can(role, 'deleteTrip'),
    canVote: can(role, 'votePoll'),
    canEditExpense: (expense) => canEditExpense(trip, userId, expense),
    canDeleteExpense: (expense) => canDeleteExpense(trip, userId, expense),
    canEditPlace: (place) => canEditPlace(trip, userId, place),
    canDeletePlace: (place) => canDeletePlace(trip, userId, place),
    canEditBooking: (booking) => canEditBooking(trip, userId, booking),
    canDeleteBooking: (booking) => canDeleteBooking(trip, userId, booking),
  }
}
