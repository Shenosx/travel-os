import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUD_INVITATION_COLUMNS,
  acceptCloudInvitation,
  acceptSharedCloudInvite,
  accountPathForJoin,
  cloudInviteLink,
  cloudTripWorkspacePath,
  copyText,
  createCloudInvitation,
  formatCloudInvitationError,
  getCloudTripInvitations,
  invitationAcceptDiagnostic,
  looksLikeCloudInviteToken,
  mapCloudInvitation,
  normalizeInviteToken,
  prefersCloudJoin,
  readAcceptedTripId,
  resolveCloudInviteTrip,
  revokeCloudInvitation,
  safeCloudJoinPath,
  tripUsesCloudInvitations,
} from './invitations.js'
import { getCloudTrips } from './cloud.js'
import { canOnTrip } from '../permissions.js'
import { getUserStorageKey, STORAGE_KEY } from '../../data/storage.js'

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
              const single = Array.isArray(data) ? data[0] ?? null : data
              return thenable(
                { data, error },
                {
                  order(orderColumn, options) {
                    calls.push(['order', orderColumn, options])
                    return Promise.resolve({ data, error })
                  },
                  maybeSingle() {
                    calls.push(['maybeSingle'])
                    return Promise.resolve({ data: single, error })
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
  assert.equal(
    formatCloudInvitationError({ message: 'permission denied for function accept_invitation' }, 'accept'),
    'Sign in to continue.',
  )
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
    'src/components/trips/CloudPeoplePanel.jsx',
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

test('local trip uses local invite; cloud trip uses create_invitation', () => {
  const details = readFileSync(join(root, 'src/pages/TripDetails.jsx'), 'utf8')
  assert.match(details, /resolveCloudInviteTrip/)
  assert.match(details, /tripUsesCloudInvitations/)
  assert.match(details, /PeoplePanel/)

  const people = readFileSync(join(root, 'src/components/trip/PeoplePanel.jsx'), 'utf8')
  assert.match(people, /inviteMember/)
  assert.match(people, /CloudPeoplePanel/)
  assert.match(people, /tripUsesCloudInvitations/)
  assert.equal(people.includes('createInviteToken'), false)
  assert.equal(people.includes('createCloudInvitation'), false)

  const cloudPeople = readFileSync(join(root, 'src/components/trips/CloudPeoplePanel.jsx'), 'utf8')
  assert.match(cloudPeople, /useCloudTripPeople/)
  assert.match(cloudPeople, /CloudInviteSheet/)
  assert.equal(cloudPeople.includes('createInviteToken'), false)
  assert.equal(cloudPeople.includes('inviteMember'), false)

  const peopleHook = readFileSync(join(root, 'src/hooks/useCloudTripPeople.js'), 'utf8')
  assert.match(peopleHook, /createCloudInvitation/)
  assert.match(peopleHook, /inviteCode/)
  assert.equal(peopleHook.includes('createInviteToken'), false)
  assert.equal(peopleHook.includes('inviteMember'), false)

  const invitations = readFileSync(join(root, 'src/lib/trips/invitations.js'), 'utf8')
  assert.match(invitations, /rpc\('create_invitation'/)
  assert.match(invitations, /\/join\/\$\{encodeURIComponent\(String\(inviteCode/)
})

test('tripUsesCloudInvitations is true for cloud trips and completed migrations', () => {
  const cloudTrip = { id: tripId, source: 'cloud', inviteCode: 'lisbon-a1' }
  const localTrip = { id: 'trip-vienna', source: 'local' }
  assert.equal(tripUsesCloudInvitations(cloudTrip), true)
  assert.equal(tripUsesCloudInvitations({ id: tripId }), true)
  assert.equal(tripUsesCloudInvitations(localTrip), false)
  assert.equal(tripUsesCloudInvitations(localTrip, { status: 'running', cloudTripId: tripId }), false)
  assert.equal(tripUsesCloudInvitations(localTrip, { status: 'completed', cloudTripId: tripId }), true)

  const hosted = { id: tripId, inviteCode: 'lisbon-a1', source: 'cloud' }
  assert.equal(resolveCloudInviteTrip(localTrip, { cloudTrips: [hosted] })?.id, undefined)
  assert.equal(
    resolveCloudInviteTrip(localTrip, {
      migration: { status: 'completed', cloudTripId: tripId },
      cloudTrips: [hosted],
    })?.id,
    tripId,
  )
  assert.equal(resolveCloudInviteTrip(cloudTrip, { cloudTrips: [hosted] })?.inviteCode, 'lisbon-a1')
  assert.match(cloudInviteLink('lisbon-a1', rawToken, 'https://travelos.app'), /\/join\/lisbon-a1\/[0-9a-f]{64}$/)
})

test('local invitation system remains on the local join path', () => {
  const joinPage = readFileSync(join(root, 'src/pages/JoinTrip.jsx'), 'utf8')
  assert.match(joinPage, /findJoinTarget/)
  assert.match(joinPage, /joinByToken/)
  assert.match(joinPage, /acceptSharedCloudInvite/)
  assert.match(joinPage, /prefersCloudJoin/)
  assert.match(joinPage, /accountPathForJoin/)
  assert.equal(joinPage.includes('CURRENT_USER_ID'), false)
  assert.equal(joinPage.includes('user-jamie'), false)

  const people = readFileSync(join(root, 'src/components/trip/PeoplePanel.jsx'), 'utf8')
  assert.match(people, /inviteMember/)
  assert.match(people, /withdrawInvitation/)
  assert.match(people, /setSessionUserId/)
  assert.equal(people.includes('createCloudInvitation'), false)
  assert.equal(people.includes('acceptCloudInvitation'), false)
})

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const inviteeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const otherTripId = '33333333-3333-4333-8333-333333333333'
const ownerSession = { user: { id: ownerId, email: 'owner@example.com' } }
const inviteeSession = { user: { id: inviteeId, email: 'invitee@example.com' } }
const tripRow = {
  id: tripId,
  city: 'Lisbon',
  country: 'Portugal',
  destination: 'Lisbon',
  start_date: '2027-04-02',
  end_date: '2027-04-09',
  invite_code: 'lisbon-a1',
  visibility: 'shared',
}

function mockJoinClient({ rpc, trip = tripRow } = {}) {
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
              const match =
                table === 'trips' &&
                ((column === 'id' && value === trip.id) || (column === 'invite_code' && value === trip.invite_code))
              const row = match ? trip : null
              return {
                order() {
                  return Promise.resolve({ data: row ? [row] : [], error: null })
                },
                maybeSingle() {
                  return Promise.resolve({ data: row, error: null })
                },
              }
            },
            order() {
              return Promise.resolve({ data: [trip], error: null })
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
      return Promise.resolve(rpc ?? { data: tripId, error: null })
    },
  }
}

test('owner creates a cloud invitation with the existing RPC', async () => {
  const client = mockInviteClient({
    rpc: { data: { id: inviteId, token: rawToken, expires_at: '2026-09-30T00:00:00Z' }, error: null },
  })
  const result = await createCloudInvitation({
    client,
    session: ownerSession,
    tripId,
    email: 'invitee@example.com',
    role: 'viewer',
    invitedName: 'Invitee',
    inviteCode: 'lisbon-a1',
  })
  assert.equal(result.error, null)
  assert.equal(result.invitation.role, 'viewer')
  assert.equal(result.invitation.email, 'invitee@example.com')
  assert.match(result.link, /\/join\/lisbon-a1\//)
  assert.deepEqual(client.calls[0][0], 'rpc')
  assert.equal(client.calls[0][1], 'create_invitation')
})

test('invitee accepts using their auth identity, not a local user id', async () => {
  const { writes } = installStorage()
  const client = mockJoinClient({ rpc: { data: tripId, error: null } })
  const result = await acceptSharedCloudInvite({
    client,
    session: inviteeSession,
    rawToken,
    inviteCode: 'lisbon-a1',
  })
  assert.equal(result.error, null)
  assert.equal(result.tripId, tripId)
  assert.equal(result.alreadyMember, false)
  assert.equal(result.path, cloudTripWorkspacePath(tripId))
  assert.deepEqual(client.calls[0], ['rpc', 'accept_invitation', { p_raw_token: rawToken }])
  assert.equal(
    client.calls.some((call) => call[0] === 'rpc' && JSON.stringify(call).includes('user-jamie')),
    false,
  )
  assert.equal(writes.length, 0)
})

test('accepted invite makes the shared trip visible only to the invitee session', async () => {
  const inviteeClient = mockJoinClient()
  const accepted = await acceptSharedCloudInvite({
    client: inviteeClient,
    session: inviteeSession,
    rawToken,
    inviteCode: 'lisbon-a1',
  })
  assert.equal(accepted.tripId, tripId)

  const visible = await getCloudTrips({ client: inviteeClient, session: inviteeSession })
  assert.equal(visible.error, null)
  assert.ok(visible.trips.some((trip) => trip.id === tripId))
  assert.equal(
    visible.trips.some((trip) => trip.id === otherTripId),
    false,
  )

  const stranger = await getCloudTrips({
    client: {
      from() {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({ data: [], error: null })
              },
            }
          },
        }
      },
    },
    session: { user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } },
  })
  assert.equal(stranger.trips.length, 0)
})

test('viewer and editor permissions stay on the existing role model', async () => {
  const viewerTrip = {
    members: [
      { userId: inviteeId, role: 'viewer' },
      { userId: ownerId, role: 'owner' },
    ],
  }
  const editorTrip = {
    members: [
      { userId: inviteeId, role: 'editor' },
      { userId: ownerId, role: 'owner' },
    ],
  }
  assert.equal(canOnTrip(viewerTrip, inviteeId, 'viewTrip'), true)
  assert.equal(canOnTrip(viewerTrip, inviteeId, 'editItinerary'), false)
  assert.equal(canOnTrip(editorTrip, inviteeId, 'editItinerary'), true)
  assert.equal(canOnTrip(editorTrip, inviteeId, 'inviteMembers'), false)
})

test('accepting a cloud invitation does not copy another user local snapshot', async () => {
  const { writes } = installStorage()
  const ownerKey = getUserStorageKey(ownerId)
  const inviteeKey = getUserStorageKey(inviteeId)
  globalThis.localStorage.setItem(
    ownerKey,
    JSON.stringify({ trips: [{ id: 'trip-vienna', city: 'Vienna' }], invitations: [{ email: 'hidden' }] }),
  )

  const client = mockJoinClient({ rpc: { data: tripId, error: null } })
  await acceptSharedCloudInvite({
    client,
    session: inviteeSession,
    rawToken,
    inviteCode: 'lisbon-a1',
  })

  assert.equal(getUserStorageKey(ownerId), `travel-os:data:v1:user:${ownerId}`)
  assert.equal(getUserStorageKey(inviteeId), `travel-os:data:v1:user:${inviteeId}`)
  assert.notEqual(ownerKey, inviteeKey)
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  assert.equal(globalThis.localStorage.getItem(inviteeKey), null)
  assert.equal(JSON.parse(globalThis.localStorage.getItem(ownerKey)).trips[0].id, 'trip-vienna')
  assert.equal(
    writes.some(([key]) => key === inviteeKey || key === STORAGE_KEY),
    false,
  )
})

test('account next continuation still points at the join path', () => {
  const path = `/join/lisbon-a1/${rawToken}`
  assert.equal(accountPathForJoin(path), `/account?next=${encodeURIComponent(path)}`)
  assert.equal(prefersCloudJoin({ configured: true, session: inviteeSession }), true)
  assert.equal(prefersCloudJoin({ configured: true, session: null }), false)
  assert.equal(looksLikeCloudInviteToken(rawToken), true)
  assert.equal(looksLikeCloudInviteToken('m4y4-vienna-k7n2qp'), false)
})

test('already a member still opens the shared cloud trip', async () => {
  const client = mockJoinClient({
    rpc: { data: null, error: { message: 'Already a member of this trip' } },
  })
  const result = await acceptSharedCloudInvite({
    client,
    session: inviteeSession,
    rawToken,
    inviteCode: 'lisbon-a1',
  })
  assert.equal(result.error, null)
  assert.equal(result.alreadyMember, true)
  assert.equal(result.tripId, tripId)
  assert.equal(result.path, cloudTripWorkspacePath(tripId))
})

test('accept hydrates the supabase session before the RPC', async () => {
  const calls = []
  let attached = null
  const client = {
    calls,
    auth: {
      async getSession() {
        calls.push(['getSession'])
        return { data: { session: attached } }
      },
      async setSession(next) {
        calls.push(['setSession'])
        attached = {
          access_token: next.access_token,
          refresh_token: next.refresh_token,
          user: { id: inviteeId },
        }
        return { data: { session: attached } }
      },
    },
    rpc(name, params) {
      calls.push(['rpc', name, params])
      return Promise.resolve({ data: tripId, error: null })
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: tripRow, error: null })
                },
              }
            },
          }
        },
      }
    },
  }

  const result = await acceptSharedCloudInvite({
    client,
    session: { user: { id: inviteeId }, access_token: 'header.payload.sig', refresh_token: 'refresh' },
    rawToken,
    inviteCode: 'lisbon-a1',
  })
  assert.equal(result.error, null)
  assert.equal(result.tripId, tripId)
  assert.deepEqual(calls[0], ['getSession'])
  assert.deepEqual(calls[1], ['setSession'])
  assert.deepEqual(calls[2], ['rpc', 'accept_invitation', { p_raw_token: rawToken }])
})

test('accept reads a uuid from wrapped RPC data instead of failing closed', async () => {
  const client = mockJoinClient({ rpc: { data: { accept_invitation: tripId }, error: null } })
  const result = await acceptCloudInvitation({ client, session: inviteeSession, rawToken })
  assert.equal(result.error, null)
  assert.equal(result.tripId, tripId)
})

test('null RPC data without an error still fails closed and keeps a diagnostic', async () => {
  const client = mockInviteClient({ rpc: { data: null, error: null } })
  const result = await acceptCloudInvitation({ client, session: inviteeSession, rawToken })
  assert.equal(result.tripId, null)
  assert.equal(result.error, 'This invite could not be accepted.')
  assert.equal(result.diagnostic.rpc, 'accept_invitation')
  assert.equal(result.diagnostic.token.length, 64)
  assert.equal(result.diagnostic.token.prefix, 'aaaa')
  assert.equal(JSON.stringify(result.diagnostic).includes(rawToken), false)
  assert.equal(result.diagnostic.args.p_raw_token, '[redacted]')
})

test('URI-encoded invite tokens are normalized before the RPC', async () => {
  const encoded = encodeURIComponent(rawToken)
  assert.equal(normalizeInviteToken(encoded), rawToken)
  assert.equal(looksLikeCloudInviteToken(encoded), true)
  const client = mockInviteClient({ rpc: { data: tripId, error: null } })
  const result = await acceptCloudInvitation({ client, session: inviteeSession, rawToken: encoded })
  assert.equal(result.error, null)
  assert.deepEqual(client.calls[0], ['rpc', 'accept_invitation', { p_raw_token: rawToken }])
})

test('permission denied for the RPC is treated as a missing auth session', async () => {
  const client = mockInviteClient({
    rpc: { data: null, error: { message: 'permission denied for function accept_invitation', code: '42501' } },
  })
  const result = await acceptCloudInvitation({ client, session: inviteeSession, rawToken })
  assert.equal(result.tripId, null)
  assert.equal(result.error, 'Sign in to continue.')
  assert.equal(result.diagnostic.error.message, 'permission denied for function accept_invitation')
  assert.equal(result.diagnostic.error.code, '42501')
})

test('accept diagnostic never includes the raw token', () => {
  const diagnostic = invitationAcceptDiagnostic({
    userId: inviteeId,
    rawToken,
    data: tripId,
    error: { message: `bad ${rawToken}`, code: 'P0001', details: rawToken, hint: rawToken },
  })
  const raw = JSON.stringify(diagnostic)
  assert.equal(raw.includes(rawToken), false)
  assert.equal(diagnostic.args.p_raw_token, '[redacted]')
  assert.equal(readAcceptedTripId({ trip_id: tripId }), tripId)
})
