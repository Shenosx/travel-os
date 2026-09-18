import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLOUD_MEMBER_COLUMNS, getCloudTripMembers, mapCloudTripMember } from './members.js'

function mockMemberClient({ data = [], error = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return Promise.resolve({ data, error })
            },
          }
        },
      }
    },
  }
}

const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'

const ownerRow = {
  user_id: '00000000-0000-0000-0000-000000000001',
  role: 'owner',
  joined_at: '2026-09-16T00:00:00Z',
  profiles: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Jamie Lim',
    short_name: 'Jamie',
    email: 'jamie@travelos.app',
    initials: 'JL',
    avatar_url: null,
  },
}

test('membership read requires an authenticated session', async () => {
  const client = mockMemberClient({ data: [ownerRow] })
  const result = await getCloudTripMembers({ client, session: null, tripId })
  assert.deepEqual(result.members, [])
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('authenticated membership read maps profile fields', async () => {
  const client = mockMemberClient({ data: [ownerRow] })
  const result = await getCloudTripMembers({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.members[0], mapCloudTripMember(ownerRow))
  assert.equal(result.members[0].name, 'Jamie Lim')
  assert.equal(result.members[0].email, 'jamie@travelos.app')
  assert.equal(result.members[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'trip_members'])
  assert.deepEqual(client.calls[1], ['select', CLOUD_MEMBER_COLUMNS])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.equal(
    client.calls.some((call) => call[0] === 'eq' && call[1] === 'user_id'),
    false,
  )
})

test('non-member membership read stays empty and user-facing', async () => {
  const hidden = await getCloudTripMembers({
    client: mockMemberClient({ data: [] }),
    session,
    tripId,
  })
  assert.deepEqual(hidden.members, [])
  assert.equal(hidden.error, null)

  const denied = await getCloudTripMembers({
    client: mockMemberClient({
      error: { message: 'new row violates row-level security policy', code: '42501' },
    }),
    session,
    tripId,
  })
  assert.deepEqual(denied.members, [])
  assert.match(denied.error, /not available/)
  assert.equal(denied.error.includes('42501'), false)
})
