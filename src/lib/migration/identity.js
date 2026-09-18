/**
 * Explicit Local → Cloud person mapping. No name/email auto-match.
 */

import { isClientRowId } from '../trips/clientRowId.js'

export function localPersonLabel(user, fallbackId) {
  if (!user) return fallbackId || 'Unknown'
  return user.name || user.shortName || user.email || fallbackId || 'Unknown'
}

export function collectLocalIdentityIds(args = {}) {
  const ids = new Set()
  const trip = args.localTrip
  if (Array.isArray(trip?.members)) {
    for (const member of trip.members) {
      if (member?.userId) ids.add(member.userId)
    }
  }
  if (trip?.ownerId) ids.add(trip.ownerId)

  for (const expense of args.expenses ?? []) {
    if (expense?.payerId) ids.add(expense.payerId)
    for (const share of expense?.shares ?? []) {
      if (share?.userId) ids.add(share.userId)
    }
  }

  for (const poll of args.polls ?? []) {
    for (const option of poll?.options ?? []) {
      for (const voterId of option?.voterIds ?? []) {
        if (voterId) ids.add(voterId)
      }
    }
    if (poll?.createdBy) ids.add(poll.createdBy)
  }

  for (const invitation of args.invitations ?? []) {
    if (invitation?.invitedBy) ids.add(invitation.invitedBy)
  }

  return [...ids]
}

export function mappedCloudUserId(identityMappings, localUserId) {
  const entry = identityMappings?.[localUserId]
  if (!entry || typeof entry !== 'object') return null
  if (entry.type !== 'self' && entry.type !== 'member') return null
  if (!isClientRowId(entry.cloudUserId)) return null
  return entry.cloudUserId
}

export function isCurrentUserMapping(identityMappings, localUserId, currentCloudUserId) {
  const cloudId = mappedCloudUserId(identityMappings, localUserId)
  return Boolean(cloudId && currentCloudUserId && cloudId === currentCloudUserId)
}

export function cloudMemberIds(cloudMembers = []) {
  return new Set(
    (Array.isArray(cloudMembers) ? cloudMembers : [])
      .map((member) => member.userId)
      .filter((id) => isClientRowId(id)),
  )
}

export function identityIsTripActor(identityMappings, localUserId, cloudMembers) {
  const cloudId = mappedCloudUserId(identityMappings, localUserId)
  if (!cloudId) return false
  return cloudMemberIds(cloudMembers).has(cloudId)
}

export function describeIdentityRequirements(args = {}) {
  const users = args.localUsers ?? []
  const currentCloudUserId = args.currentUser?.id ?? null
  const members = args.cloudMembers ?? []
  const mappings = args.identityMappings ?? {}
  const tripMembers = args.localTrip?.members ?? []

  return collectLocalIdentityIds(args).map((localUserId) => {
    const user = users.find((item) => item.id === localUserId)
    const mapped = mappedCloudUserId(mappings, localUserId)
    const member = members.find((item) => item.userId === mapped)
    let status = 'unmapped'
    if (mapped && currentCloudUserId && mapped === currentCloudUserId) status = 'self'
    else if (mapped && member) status = 'member'
    else if (mapped) status = 'not-member'
    return {
      localUserId,
      name: localPersonLabel(user, localUserId),
      email: user?.email || '',
      role: tripMembers.find((item) => item.userId === localUserId)?.role ?? null,
      mappedCloudUserId: mapped,
      status,
    }
  })
}
