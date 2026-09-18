import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collectLocalIdentityIds,
  describeIdentityRequirements,
  identityIsTripActor,
  mappedCloudUserId,
} from './identity.js'

const ME = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'

const localTrip = {
  id: 'trip-vienna',
  ownerId: 'user-jamie',
  members: [
    { userId: 'user-jamie', role: 'owner' },
    { userId: 'user-jason', role: 'viewer' },
  ],
}

const localUsers = [
  { id: 'user-jamie', name: 'Jamie Lim', shortName: 'Jamie', email: 'jamie@travelos.app' },
  { id: 'user-jason', name: 'Jason Tan', shortName: 'Jason', email: 'jason@example.com' },
]

test('collects identities from members, payers, shares, and voters', () => {
  const ids = collectLocalIdentityIds({
    localTrip,
    expenses: [
      {
        payerId: 'user-jamie',
        shares: [
          { userId: 'user-jamie', amount: 10 },
          { userId: 'user-jason', amount: 10 },
        ],
      },
    ],
    polls: [{ options: [{ voterIds: ['user-alex'] }] }],
  })
  assert.ok(ids.includes('user-jamie'))
  assert.ok(ids.includes('user-jason'))
  assert.ok(ids.includes('user-alex'))
})

test('self mapping uses the current Cloud user UUID only when chosen', () => {
  const mapped = mappedCloudUserId(
    { 'user-jamie': { type: 'self', cloudUserId: ME } },
    'user-jamie',
  )
  assert.equal(mapped, ME)
  assert.equal(mappedCloudUserId({}, 'user-jamie'), null)
})

test('unresolved payer and participant stay unmapped with no silent fallback', () => {
  const requirements = describeIdentityRequirements({
    localTrip,
    localUsers,
    currentUser: { id: ME },
    cloudMembers: [
      { userId: ME, role: 'owner', name: 'Cloud Jamie' },
      { userId: MEMBER, role: 'editor', name: 'Cloud Alex' },
    ],
    identityMappings: {},
    expenses: [
      {
        payerId: 'user-jason',
        shares: [{ userId: 'user-jason', amount: 20 }],
      },
    ],
  })
  const jason = requirements.find((item) => item.localUserId === 'user-jason')
  assert.equal(jason.status, 'unmapped')
  assert.equal(jason.mappedCloudUserId, null)
  assert.equal(identityIsTripActor({}, 'user-jason', [{ userId: ME, role: 'owner' }]), false)
  assert.equal(identityIsTripActor({}, 'user-jason', [{ userId: MEMBER, role: 'editor' }]), false)
})

test('invited-but-not-member remains unresolved for expenses', () => {
  const mappings = { 'user-jason': { type: 'member', cloudUserId: MEMBER } }
  assert.equal(identityIsTripActor(mappings, 'user-jason', [{ userId: ME, role: 'owner' }]), false)
  assert.equal(identityIsTripActor(mappings, 'user-jason', [{ userId: MEMBER, role: 'editor' }]), true)
})

test('explicit member mapping is required; same name does not auto-select', () => {
  const requirements = describeIdentityRequirements({
    localTrip,
    localUsers,
    currentUser: { id: ME },
    cloudMembers: [{ userId: ME, role: 'owner', name: 'Jamie Lim', email: 'jamie@travelos.app' }],
    identityMappings: {},
    expenses: [],
  })
  const jamie = requirements.find((item) => item.localUserId === 'user-jamie')
  assert.equal(jamie.status, 'unmapped')
  assert.equal(jamie.email, 'jamie@travelos.app')
})
