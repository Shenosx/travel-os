import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUD_INVITATION_COLUMNS,
  acceptCloudInvitation,
  accountPathForJoin,
  cloudInviteLink,
  copyText,
  createCloudInvitation,
  formatCloudInvitationError,
  getCloudTripInvitations,
  mapCloudInvitation,
  revokeCloudInvitation,
  safeCloudJoinPath,
} from './invitations.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const inviteId = '22222222-2222-2222-2222-222222222222'
const rawToken = 'a'.repeat(64)

function thenable(result, extra = {}) {
  const promise = Promise.resolve(result)
  return {
    ...extra,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

function mockInviteClient({ data = [], error = null, rpc } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            insert() {
              throw new Error('client must not insert invitations')
            },
            update() {
              throw new Error('client must not update invitations')
            },
            eq(column, value) {
              calls.push(['eq', column, value])
              return thenable(
                { data, error },
                {
                  order(orderColumn, options) {
                    calls.push(['order', orderColumn, options])
                    return Promise.resolve({ data, error })
                  },
                },
              )
            },
          }
        },
        insert() {
          throw new Error('client must not insert invitations')
        },
      }
    },
    rpc(name, params) {
      calls.push(['rpc', name, params])
      return Promise.resolve(rpc ?? { data: null, error: null })
    },
  }
}

function installStorage() {
  const writes = []
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      writes.push([key, String(value)])
      map.set(key, String(value))
    },
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  }
  return { writes }
}

const row = {
  id: inviteId,
  trip_id: tripId,
  email: 'maya@example.com',
  invited_name: 'Maya',
  role: 'editor',
  status: 'pending',
  token_hash: 'should-never-surface',
  expires_at: '2026-09-30T00:00:00Z',
  created_at: '2026-09-16T00:00:00Z',
  accepted_at: null,
}

test('invitation list omits token_hash', async () => {
  const client = mockInviteClient({ data: [row] })
  const result = await getCloudTripInvitations({ client, session, tripId })
  assert.equal(result.error, null)
  assert.equal(result.invitations.length, 1)
  assert.equal(Object.hasOwn(result.invitations[0], 'token_hash'), false)
  assert.equal(result.invitations[0].email, 'maya@example.com')
  assert.deepEqual(client.calls[0], ['from', 'trip_invitation_summaries'])
  assert.equal(CLOUD_INVITATION_COLUMNS.includes('token_hash'), false)
  assert.deepEqual(mapCloudInvitation(row).token_hash, undefined)
})

test('create invitation requires authentication', async () => {
  const client = mockInviteClient({
    rpc: { data: { id: inviteId, token: rawToken }, error: null },
  })
  const result = await createCloudInvitation({
    client,
    session: null,
    tripId,
    email: 'maya@example.com',
    role: 'editor',
    inviteCode: 'lisbon-a1',
  })
  assert.equal(result.invitation, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('create invitation only allows editor or viewer', async () => {
  const client = mockInviteClient({
    rpc: { data: { id: inviteId, token: rawToken }, error: null },
  })
  const owner = await createCloudInvitation({
    client,
    session,
    tripId,
    email: 'maya@example.com',
    role: 'owner',
    inviteCode: 'lisbon-a1',
  })
  assert.equal(owner.invitation, null)
  assert.match(owner.error, /editors or viewers/)
  assert.equal(client.calls.length, 0)
})

test('create invitation calls the RPC and does not insert rows', async () => {
  const client = mockInviteClient({
    rpc: { data: { id: inviteId, token: rawToken, expires_at: '2026-09-30T00:00:00Z' }, error: null },
  })
  const logs = []
  const original = console.log
  console.log = (...args) => logs.push(args)
  const { writes } = installStorage()
  try {
    const result = await createCloudInvitation({
      client,
      session,
      tripId,
      email: 'Maya@example.com',
      role: 'editor',
      invitedName: 'Maya',
      inviteCode: 'lisbon-a1',
      origin: 'https://travelos.app',
    })
    assert.equal(result.error, null)
    assert.equal(result.invitation.id, inviteId)
    assert.equal(Object.hasOwn(result.invitation, 'token'), false)
    assert.equal(Object.hasOwn(result.invitation, 'token_hash'), false)
    assert.equal(result.link, cloudInviteLink('lisbon-a1', rawToken, 'https://travelos.app'))
    assert.deepEqual(client.calls[0], [
      'rpc',
      'create_invitation',
      {
        p_trip_id: tripId,
        p_email: 'maya@example.com',
        p_role: 'editor',
        p_invited_name: 'Maya',
      },
    ])
    assert.equal(
      client.calls.some((call) => call[0] === 'from'),
      false,
    )
    assert.equal(writes.length, 0)
    assert.equal(logs.length, 0)
  } finally {
    console.log = original
  }
})

test('revoke uses the revoke_invitation RPC', async () => {
  const client = mockInviteClient({ rpc: { data: null, error: null } })
  const result = await revokeCloudInvitation({ client, session, id: inviteId })
  assert.equal(result.ok, true)
  assert.deepEqual(client.calls[0], ['rpc', 'revoke_invitation', { p_id: inviteId }])
  assert.equal(
    client.calls.some((call) => call[0] === 'from'),
    false,
  )
})

test('accept uses the accept_invitation RPC', async () => {
  const client = mockInviteClient({ rpc: { data: tripId, error: null } })
  const logs = []
  const original = console.log
  console.log = (...args) => logs.push(args)
  try {
    const result = await acceptCloudInvitation({ client, session, rawToken })
    assert.equal(result.error, null)
    assert.equal(result.tripId, tripId)
    assert.deepEqual(client.calls[0], ['rpc', 'accept_invitation', { p_raw_token: rawToken }])
    assert.equal(
      client.calls.some((call) => call[0] === 'from'),
      false,
    )
    assert.equal(logs.length, 0)
  } finally {
    console.log = original
  }
})

test('accept does not run without a session', async () => {
  const client = mockInviteClient({ rpc: { data: tripId, error: null } })
  const result = await acceptCloudInvitation({ client, session: null, rawToken })
  assert.equal(result.tripId, null)
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('invitation errors stay short and never echo secrets', () => {
  assert.equal(
    formatCloudInvitationError({ message: `Invitation is invalid ${rawToken}` }),
    'This invite link is no longer valid.',
  )
  assert.equal(formatCloudInvitationError({ message: 'Invitation has expired' }).includes(rawToken), false)
  assert.match(formatCloudInvitationError({ message: 'This invitation belongs to someone else' }), /different account/)
  assert.equal(formatCloudInvitationError({ message: 'column token_hash does not exist' }).includes('token_hash'), false)
})

test('join return path keeps the token in the URL only', () => {
  const path = `/join/lisbon-a1/${rawToken}`
  assert.equal(safeCloudJoinPath(path), path)
  assert.equal(safeCloudJoinPath('https://evil.example/join/x/y'), null)
  assert.equal(accountPathForJoin(path), `/account?next=${encodeURIComponent(path)}`)
})

test('copyText uses the clipboard API without throwing', async () => {
  const writes = []
  const result = await copyText('https://travelos.app/join/a/b', {
    writeText: async (value) => {
      writes.push(value)
    },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(writes, ['https://travelos.app/join/a/b'])
})

test('cloud invitation code never generates or stores tokens locally', () => {
  const files = [
    'src/lib/trips/invitations.js',
    'src/lib/trips/members.js',
    'src/hooks/useCloudTripPeople.js',
    'src/components/trips/CloudPeopleSheet.jsx',
    'src/components/trips/CloudInviteSheet.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('createInviteToken'), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('localStorage'), false, file)
    assert.equal(src.includes('console.log'), false, file)
  }

  const invitations = readFileSync(join(root, 'src/lib/trips/invitations.js'), 'utf8')
  assert.match(invitations, /rpc\('create_invitation'/)
  assert.match(invitations, /rpc\('revoke_invitation'/)
  assert.match(invitations, /rpc\('accept_invitation'/)
  assert.equal(invitations.includes('.insert('), false)
  assert.equal(invitations.includes('secure_random'), false)
  assert.equal(invitations.includes('sha256'), false)
})

test('local invitation system remains on the local join path', () => {
  const joinPage = readFileSync(join(root, 'src/pages/JoinTrip.jsx'), 'utf8')
  assert.match(joinPage, /findJoinTarget/)
  assert.match(joinPage, /joinByToken/)
  assert.match(joinPage, /acceptCloudInvitation/)

  const people = readFileSync(join(root, 'src/components/trip/PeoplePanel.jsx'), 'utf8')
  assert.match(people, /inviteMember/)
  assert.match(people, /withdrawInvitation/)
  assert.match(people, /setSessionUserId/)
  assert.equal(people.includes('createCloudInvitation'), false)
  assert.equal(people.includes('acceptCloudInvitation'), false)
})
