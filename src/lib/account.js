/**
 * Account-page helpers. Does not change AppData or cloud auth.
 */

import {
  STORAGE_VERSION,
  createEmptyAccountSnapshot,
  getUserStorageKey,
  loadSnapshotForAuthUser,
  saveSnapshot,
} from '../data/storage.js'

export function guestAccountDestination({ session, next, pendingConfirmationEmail } = {}) {
  if (session) return null
  if (pendingConfirmationEmail) return null
  if (next) return null
  return '/'
}

export function buildAccountExport(authUserId) {
  const { snapshot } = loadSnapshotForAuthUser(authUserId)
  return {
    kind: 'travel-os-local',
    exportedAt: new Date().toISOString(),
    version: STORAGE_VERSION,
    data: snapshot,
  }
}

export function planClearLocalData(confirmed) {
  if (confirmed !== true) return { ok: false, reason: 'confirmation-required' }
  return { ok: true }
}

export function clearLocalAccountSnapshot(authUserId) {
  const key = getUserStorageKey(authUserId)
  saveSnapshot(createEmptyAccountSnapshot(), key)
  return { ok: true, key }
}

export function exportHasSecrets(payload) {
  const raw = JSON.stringify(payload ?? {})
  return /access_token|refresh_token|service_role|anon_key/i.test(raw)
}
