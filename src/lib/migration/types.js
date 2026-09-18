/**
 * Local → Cloud migration shared constants. No network I/O.
 */

export const MIGRATION_PATHS = Object.freeze(['create', 'associate'])

export const MIGRATION_STEPS = Object.freeze([
  'validate-source',
  'validate-destination',
  'validate-session',
  'validate-permissions',
  'validate-pending-ops',
  'resolve-identity',
  'create-or-reuse-trip',
  'create-places',
  'create-bookings',
  'create-or-reuse-days',
  'create-itinerary-items',
  'create-expenses',
  'create-polls',
  'migrate-votes',
  'optional-invitations',
  'report',
])

export const PENDING_OP_BLOCKING_STATUSES = Object.freeze([
  'pending',
  'syncing',
  'retryable',
  'blocked',
  'failed',
])

export const SYNC_FIRST_MESSAGE = 'Sync changes first before moving this trip to Cloud.'

export const ACTIVITY_SKIP_REASON = 'Historical local activity was not migrated.'

export const DOCUMENT_SKIP_REASON = 'was not migrated because no file is stored on this device.'

export const OWNERSHIP_WARNING =
  'Cloud ownership stays with the signed-in account. Local ownership is not transferred.'
