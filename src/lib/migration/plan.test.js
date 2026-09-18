import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMigrationPlan, collectMigrationCounts } from './plan.js'
import { SYNC_FIRST_MESSAGE } from './types.js'

const ME = '11111111-1111-4111-8111-111111111111'
const CLOUD_TRIP = '22222222-2222-4222-8222-222222222222'
const OTHER_TRIP = '33333333-3333-4333-8333-333333333333'
const MEMBER = '44444444-4444-4444-8444-444444444444'

const tokyo = {
  id: 'trip-tokyo',
  city: 'Tokyo',
  destination: 'Tokyo, Japan',
  ownerId: 'user-jamie',
  members: [{ userId: 'user-jamie', role: 'owner' }],
}

const vienna = {
  id: 'trip-vienna',
  city: 'Vienna',
  destination: 'Vienna, Austria',
  ownerId: 'user-jamie',
  members: [
    { userId: 'user-jamie', role: 'owner' },
    { userId: 'user-jason', role: 'viewer' },
  ],
}

const users = [
  { id: 'user-jamie', name: 'Jamie Lim', shortName: 'Jamie', email: 'jamie@travelos.app' },
  { id: 'user-jason', name: 'Jason Tan', shortName: 'Jason', email: 'jason@example.com' },
]

function baseArgs(overrides = {}) {
  return {
    localTrip: tokyo,
    path: 'create',
    currentUser: { id: ME },
    cloudMembers: [{ userId: ME, role: 'owner', name: 'You' }],
    pendingOps: [],
    localUsers: users,
    places: [{ id: 'place-1', name: 'Senso-ji' }],
    bookings: [{ id: 'booking-1', title: 'Flight', documents: [{ id: 'doc-1', name: 'hold.pdf' }] }],
    expenses: [
      {
        id: 'exp-1',
        description: 'Ramen',
        payerId: 'user-jamie',
        shares: [{ userId: 'user-jamie', amount: 20 }],
      },
    ],
    itinerary: {
      days: [
        {
          date: '2027-03-18',
          dayNumber: 1,
          title: 'Arrive',
          items: [{ id: 'item-1', title: 'Land' }],
        },
      ],
    },
    polls: [
      {
        id: 'poll-1',
        question: 'Dinner?',
        options: [
          { id: 'opt-1', label: 'Ramen', voterIds: ['user-jamie'] },
          { id: 'opt-2', label: 'Sushi', voterIds: ['user-jason'] },
        ],
      },
    ],
    activities: [{ id: 'act-1', tripId: 'trip-tokyo', type: 'place.add' }],
    identityMappings: { 'user-jamie': { type: 'self', cloudUserId: ME } },
    ...overrides,
  }
}

test('planner counts local records without network writes', () => {
  const args = baseArgs()
  const counts = collectMigrationCounts(args)
  const plan = buildMigrationPlan(args)
  assert.equal(counts.places, 1)
  assert.equal(counts.bookings, 1)
  assert.equal(counts.itineraryDays, 1)
  assert.equal(counts.itineraryItems, 1)
  assert.equal(counts.expenses, 1)
  assert.equal(counts.polls, 1)
  assert.equal(counts.documents, 1)
  assert.equal(plan.status, 'ready')
  assert.equal(plan.path, 'create')
  assert.deepEqual(plan.targetCloudTripId, null)
})

test('explicit destination is required; name matching is not used', () => {
  const unnamed = buildMigrationPlan(baseArgs({ path: null, targetCloudTrip: { id: CLOUD_TRIP, destination: 'Tokyo, Japan' } }))
  assert.equal(unnamed.status, 'blocked')
  assert.match(unnamed.blocked[0].reason, /Create new Cloud Trip|existing Cloud Trip/)

  const associateMissing = buildMigrationPlan(
    baseArgs({
      path: 'associate',
      targetCloudTrip: { destination: 'Tokyo, Japan' },
    }),
  )
  assert.equal(associateMissing.status, 'blocked')
  assert.match(associateMissing.blocked[0].reason, /Select a Cloud Trip/)

  const chosen = buildMigrationPlan(
    baseArgs({
      path: 'associate',
      targetCloudTrip: { id: OTHER_TRIP, destination: 'Tokyo, Japan' },
      cloudMembers: [{ userId: ME, role: 'owner' }],
    }),
  )
  assert.equal(chosen.status, 'ready')
  assert.equal(chosen.targetCloudTripId, OTHER_TRIP)
  assert.notEqual(chosen.targetCloudTripId, CLOUD_TRIP)
})

test('viewer destination is blocked', () => {
  const plan = buildMigrationPlan(
    baseArgs({
      path: 'associate',
      targetCloudTrip: { id: CLOUD_TRIP, destination: 'Kyoto' },
      cloudMembers: [{ userId: ME, role: 'viewer' }],
    }),
  )
  assert.equal(plan.status, 'blocked')
  assert.ok(plan.blocked.some((item) => item.entity === 'permissions'))
})

test('relevant pendingOps block the plan', () => {
  const plan = buildMigrationPlan(
    baseArgs({
      pendingOps: [{ id: 'op-1', status: 'retryable', localEntityId: 'place-1', cloudTripId: null }],
    }),
  )
  assert.equal(plan.status, 'blocked')
  assert.ok(plan.blocked.some((item) => item.reason === SYNC_FIRST_MESSAGE))
})

test('unrelated pendingOps do not block', () => {
  const plan = buildMigrationPlan(
    baseArgs({
      pendingOps: [{ id: 'op-2', status: 'pending', cloudTripId: OTHER_TRIP, localEntityId: 'place-elsewhere' }],
    }),
  )
  assert.equal(plan.status, 'ready')
})

test('identity requirements are detected and unmapped Jason blocks his expense', () => {
  const plan = buildMigrationPlan(
    baseArgs({
      localTrip: vienna,
      expenses: [
        {
          id: 'exp-dinner',
          description: 'Dinner',
          payerId: 'user-jamie',
          shares: [
            { userId: 'user-jamie', amount: 40 },
            { userId: 'user-jason', amount: 40 },
          ],
        },
      ],
      identityMappings: { 'user-jamie': { type: 'self', cloudUserId: ME } },
    }),
  )
  assert.ok(plan.identityRequirements.some((item) => item.localUserId === 'user-jason' && item.status === 'unmapped'))
  assert.ok(plan.blocked.some((item) => item.localId === 'exp-dinner' && /Jason/.test(item.reason)))
  assert.equal(plan.status, 'ready')
})

test('invited-but-not-member still blocks expenses', () => {
  const plan = buildMigrationPlan(
    baseArgs({
      path: 'associate',
      targetCloudTrip: { id: CLOUD_TRIP, destination: 'Vienna, Austria' },
      localTrip: vienna,
      cloudMembers: [{ userId: ME, role: 'owner' }],
      identityMappings: {
        'user-jamie': { type: 'self', cloudUserId: ME },
        'user-jason': { type: 'member', cloudUserId: MEMBER },
      },
      expenses: [
        {
          id: 'exp-dinner',
          description: 'Dinner',
          payerId: 'user-jamie',
          shares: [
            { userId: 'user-jamie', amount: 40 },
            { userId: 'user-jason', amount: 40 },
          ],
        },
      ],
    }),
  )
  assert.ok(plan.blocked.some((item) => /has not joined the Cloud trip/.test(item.reason)))
})

test('documents and historical activity are skipped, other-user votes are skipped', () => {
  const plan = buildMigrationPlan(baseArgs())
  assert.ok(plan.skipped.some((item) => item.entity === 'document' && /hold.pdf/.test(item.reason)))
  assert.ok(plan.skipped.some((item) => item.entity === 'activity'))
  assert.ok(plan.skipped.some((item) => item.entity === 'poll-vote' && /Jason/.test(item.reason)))
})

test('editor cannot invite; owner can', () => {
  const editor = buildMigrationPlan(
    baseArgs({
      path: 'associate',
      targetCloudTrip: { id: CLOUD_TRIP, destination: 'Osaka' },
      cloudMembers: [{ userId: ME, role: 'editor' }],
    }),
  )
  assert.equal(editor.canInvite, false)
  assert.ok(editor.warnings.some((item) => /cannot create invitations/.test(item)))

  const owner = buildMigrationPlan(
    baseArgs({
      path: 'associate',
      targetCloudTrip: { id: CLOUD_TRIP, destination: 'Osaka' },
      cloudMembers: [{ userId: ME, role: 'owner' }],
    }),
  )
  assert.equal(owner.canInvite, true)
})
