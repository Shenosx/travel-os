/**
 * Pure Local → Cloud migration planner. Zero network writes.
 */

import { isCloudTripId } from '../trips/cloud.js'
import { isClientRowId } from '../trips/clientRowId.js'
import {
  describeIdentityRequirements,
  identityIsTripActor,
  localPersonLabel,
  mappedCloudUserId,
} from './identity.js'
import { findRelevantPendingOps, localEntityIdsForTrip, pendingOpsBlockReason } from './pendingOps.js'
import {
  ACTIVITY_SKIP_REASON,
  DOCUMENT_SKIP_REASON,
  MIGRATION_STEPS,
  OWNERSHIP_WARNING,
} from './types.js'

function issue(entity, localId, title, reason) {
  return { entity, localId: localId ?? null, title: title || '', reason }
}

export function collectMigrationCounts(args = {}) {
  const days = args.itinerary?.days ?? []
  const documents = (args.bookings ?? []).flatMap((booking) =>
    Array.isArray(booking.documents) ? booking.documents : [],
  )
  let pollVotes = 0
  for (const poll of args.polls ?? []) {
    const voters = new Set()
    for (const option of poll.options ?? []) {
      for (const voterId of option.voterIds ?? []) voters.add(voterId)
    }
    pollVotes += voters.size
  }
  return {
    places: (args.places ?? []).length,
    bookings: (args.bookings ?? []).length,
    itineraryDays: days.length,
    itineraryItems: days.reduce((sum, day) => sum + (day.items?.length ?? 0), 0),
    expenses: (args.expenses ?? []).length,
    polls: (args.polls ?? []).length,
    pollVotes,
    documents: documents.length,
    activities: (args.activities ?? []).length,
  }
}

export function collectUnsupportedRecords(args = {}) {
  const skipped = []
  for (const booking of args.bookings ?? []) {
    for (const doc of booking.documents ?? []) {
      const name = doc.name || 'Untitled document'
      skipped.push(
        issue('document', doc.id, name, `${name} ${DOCUMENT_SKIP_REASON}`.trim()),
      )
    }
  }
  if ((args.activities ?? []).length) {
    skipped.push(issue('activity', args.localTrip?.id, 'Activity', ACTIVITY_SKIP_REASON))
  }
  return skipped
}

function currentCloudRole(args) {
  if (args.path === 'create') return 'owner'
  const userId = args.currentUser?.id
  const members = args.cloudMembers ?? []
  return members.find((member) => member.userId === userId)?.role ?? null
}

function destinationBlock(args) {
  const path = args.path
  if (path !== 'create' && path !== 'associate') {
    return issue('trip', args.localTrip?.id, args.localTrip?.city, 'Choose Create new Cloud Trip or an existing Cloud Trip.')
  }
  if (path === 'associate') {
    const targetId = args.targetCloudTrip?.id ?? args.targetCloudTripId
    if (!isCloudTripId(targetId)) {
      return issue('trip', args.localTrip?.id, args.localTrip?.city, 'Select a Cloud Trip. Matching by name or dates is not used.')
    }
  }
  return null
}

function sessionBlock(args) {
  if (!args.currentUser?.id || !isClientRowId(args.currentUser.id)) {
    return issue('session', null, 'Account', 'Sign in to move this trip to Cloud.')
  }
  return null
}

function permissionBlock(args) {
  const dest = destinationBlock(args)
  if (dest) return dest
  const role = currentCloudRole(args)
  if (args.path === 'associate' && role === 'viewer') {
    return issue('permissions', args.targetCloudTrip?.id, args.targetCloudTrip?.destination, 'Viewers cannot move records into this Cloud Trip.')
  }
  if (args.path === 'associate' && !role) {
    return issue('permissions', args.targetCloudTrip?.id, args.targetCloudTrip?.destination, 'This Cloud Trip is not available to this account.')
  }
  return null
}

function expenseIdentityIssues(args) {
  const blocked = []
  const users = args.localUsers ?? []
  const mappings = args.identityMappings ?? {}
  const members = args.cloudMembers ?? []

  for (const expense of args.expenses ?? []) {
    const title = expense.description || 'Expense'
    const people = []
    if (expense.payerId) people.push({ localUserId: expense.payerId, kind: 'payer' })
    for (const share of expense.shares ?? []) {
      if (share.userId) people.push({ localUserId: share.userId, kind: 'participant' })
    }
    const missing = []
    for (const person of people) {
      const name = localPersonLabel(
        users.find((user) => user.id === person.localUserId),
        person.localUserId,
      )
      const mapped = mappedCloudUserId(mappings, person.localUserId)
      if (!mapped) {
        missing.push({ name, kind: person.kind, reason: 'unmapped' })
        continue
      }
      if (!identityIsTripActor(mappings, person.localUserId, members) && args.path === 'associate') {
        missing.push({ name, kind: person.kind, reason: 'invited' })
        continue
      }
      if (args.path === 'create' && mapped !== args.currentUser?.id) {
        missing.push({ name, kind: person.kind, reason: 'invited' })
      }
    }
    if (!missing.length) continue
    const first = missing[0]
    const reason =
      first.reason === 'invited'
        ? `${first.name} was invited, but has not joined the Cloud trip, so expenses involving ${first.name} were not migrated.`
        : `Participant "${first.name}" has no Cloud identity mapping.`
    blocked.push(issue('expense', expense.id, title, `Expense "${title}" blocked: ${reason}`))
  }
  return blocked
}

function pollVoteIssues(args) {
  const skipped = []
  const mappings = args.identityMappings ?? {}
  const currentId = args.currentUser?.id
  const users = args.localUsers ?? []
  for (const poll of args.polls ?? []) {
    const voters = new Set()
    for (const option of poll.options ?? []) {
      for (const voterId of option.voterIds ?? []) voters.add(voterId)
    }
    for (const voterId of voters) {
      const mapped = mappedCloudUserId(mappings, voterId)
      if (mapped && currentId && mapped === currentId) continue
      const name = localPersonLabel(
        users.find((user) => user.id === voterId),
        voterId,
      )
      skipped.push(
        issue(
          'poll-vote',
          poll.id,
          poll.question || 'Poll',
          `${name}'s vote was not migrated because only the signed-in account's vote can move.`,
        ),
      )
    }
  }
  return skipped
}

export function buildMigrationPlan(args = {}) {
  const localTrip = args.localTrip
  const path = args.path
  const targetCloudTripId = args.targetCloudTrip?.id ?? args.targetCloudTripId ?? null
  const counts = collectMigrationCounts(args)
  const identityRequirements = describeIdentityRequirements(args)
  const blocked = []
  const skipped = collectUnsupportedRecords(args)
  const warnings = []

  if (!localTrip?.id) {
    blocked.push(issue('trip', null, 'Trip', 'Choose a local trip to move.'))
  }

  const dest = destinationBlock(args)
  if (dest) blocked.push(dest)

  const session = sessionBlock(args)
  if (session) blocked.push(session)

  const permission = permissionBlock(args)
  if (permission && permission.entity === 'permissions') blocked.push(permission)

  const relevantOps = findRelevantPendingOps({
    pendingOps: args.pendingOps,
    targetCloudTripId: path === 'associate' ? targetCloudTripId : null,
    sourceTripId: localTrip?.id,
    localTrip,
    places: args.places,
    bookings: args.bookings,
    expenses: args.expenses,
    polls: args.polls,
    invitations: args.invitations,
    activities: args.activities,
    itinerary: args.itinerary,
    localEntityIds: localEntityIdsForTrip(args),
  })
  const pendingReason = pendingOpsBlockReason(relevantOps)
  if (pendingReason) {
    blocked.push(issue('pendingOps', localTrip?.id, localTrip?.city, pendingReason))
  }

  skipped.push(...pollVoteIssues(args))
  blocked.push(...expenseIdentityIssues(args))

  const role = currentCloudRole(args)
  if (role === 'editor') {
    warnings.push('Editors can move trip records, but cannot create invitations.')
  }
  if (path === 'create' && localTrip?.ownerId) {
    const ownerMapped = mappedCloudUserId(args.identityMappings, localTrip.ownerId)
    if (ownerMapped && ownerMapped !== args.currentUser?.id) {
      warnings.push(OWNERSHIP_WARNING)
    } else if (localTrip.ownerId) {
      warnings.push(OWNERSHIP_WARNING)
    }
  }
  if (path === 'associate') {
    warnings.push('The selected Cloud Trip header is left unchanged.')
  }

  const hardBlocks = blocked.filter((item) =>
    ['trip', 'session', 'permissions', 'pendingOps'].includes(item.entity),
  )

  return {
    status: hardBlocks.length ? 'blocked' : 'ready',
    sourceTripId: localTrip?.id ?? null,
    targetCloudTripId: path === 'associate' && isCloudTripId(targetCloudTripId) ? targetCloudTripId : null,
    path: path === 'associate' ? 'associate' : path === 'create' ? 'create' : null,
    role,
    counts,
    identityRequirements,
    blocked,
    skipped,
    warnings,
    steps: [...MIGRATION_STEPS],
    relevantPendingOpIds: relevantOps.map((op) => op.id),
    canInvite: role === 'owner',
  }
}
