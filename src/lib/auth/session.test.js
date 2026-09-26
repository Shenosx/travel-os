import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  authUserFromSession,
  displayIdentity,
  fetchOwnProfile,
  formatAuthError,
  initialsFromName,
  isEmailConfirmationPending,
  mapAuthUser,
  visibleAccount,
} from './session.js'
import { CURRENT_USER_ID, trips, users } from '../../data/mock.js'
import { getUserStorageKey, STORAGE_KEY } from '../../data/storage.js'

function jwtWith(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`
}

test('mapAuthUser returns null without a user', () => {
  assert.equal(mapAuthUser(null), null)
})

test('authUserFromSession reads session.user when it has an id', () => {
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jamie@travelos.app' }
  assert.equal(authUserFromSession({ user }).id, user.id)
})

test('authUserFromSession recovers the auth id from a session that has no user', () => {
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const session = {
    access_token: jwtWith({ sub: id, email: 'new@travelos.app' }),
    refresh_token: 'refresh',
    expires_at: 4102444800,
  }
  const user = authUserFromSession(session)
  assert.equal(user.id, id)
  assert.equal(user.email, 'new@travelos.app')
  assert.equal(getUserStorageKey(user.id), `travel-os:data:v1:user:${id}`)
})

test('authUserFromSession ignores the supabase user-not-available proxy and uses the JWT', () => {
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '__isUserNotAvailableProxy') return true
        throw new Error(`must not read ${String(prop)} on the proxy`)
      },
    },
  )
  const user = authUserFromSession({
    access_token: jwtWith({ sub: id, email: 'proxy@travelos.app' }),
    user: proxy,
  })
  assert.equal(user.id, id)
})

test('authUserFromSession is null without a user or token subject', () => {
  assert.equal(authUserFromSession(null), null)
  assert.equal(authUserFromSession({ access_token: 'not-a-jwt' }), null)
})

test('mapAuthUser reads identity from auth.users, not a client-supplied id', () => {
  const mapped = mapAuthUser({
    id: 'user-1',
    email: 'jamie@travelos.app',
    email_confirmed_at: '2026-09-16T00:00:00Z',
    user_metadata: { name: 'Jamie Lim' },
  })
  assert.deepEqual(mapped, {
    id: 'user-1',
    email: 'jamie@travelos.app',
    name: 'Jamie Lim',
    emailConfirmed: true,
  })
})

test('mapAuthUser reads display_name from metadata when name is absent', () => {
  const mapped = mapAuthUser({
    id: 'auth-sio',
    email: 'sio@example.com',
    user_metadata: { display_name: 'Sio Kai Xin' },
  })
  assert.equal(mapped.name, 'Sio Kai Xin')
})

test('sign up without a session is treated as email confirmation pending', () => {
  assert.equal(isEmailConfirmationPending({ user: { id: '1' }, session: null }), true)
  assert.equal(isEmailConfirmationPending({ user: { id: '1' }, session: { access_token: 'x' } }), false)
})

test('auth errors stay specific without leaking internals', () => {
  assert.match(formatAuthError({ message: 'Email not confirmed' }), /Confirm this email/)
  assert.match(formatAuthError({ message: 'Invalid login credentials' }), /not right/)
  assert.match(formatAuthError({ message: 'User already registered' }), /already exists/)
})

test('initials fall back from name then email', () => {
  assert.equal(initialsFromName('Jamie Lim'), 'JL')
  assert.equal(initialsFromName('', 'oliver@example.com'), 'OL')
})

test('displayIdentity prefers the database profile over metadata', () => {
  const identity = displayIdentity(
    { id: 'user-1', name: 'Sio Kai Xin', short_name: 'Sio', email: 'sio@example.com', initials: 'SK' },
    { id: 'user-1', email: 'sio@example.com', user_metadata: { name: 'Other', display_name: 'Other' } },
  )
  assert.equal(identity.name, 'Sio Kai Xin')
  assert.equal(identity.shortName, 'Sio')
  assert.equal(identity.initials, 'SK')
})

test('auth user name and email appear on dashboard, sidebar, and account', () => {
  const identity = displayIdentity(
    { id: 'auth-sio', name: 'Sio Kai Xin', short_name: 'Sio', email: 'sio@example.com', initials: 'SK' },
    { id: 'auth-sio', email: 'sio@example.com', user_metadata: { name: 'Sio Kai Xin' } },
  )
  const view = visibleAccount(identity)
  assert.equal(view.greeting, 'Sio')
  assert.equal(view.name, 'Sio Kai Xin')
  assert.equal(view.email, 'sio@example.com')
  assert.equal(view.initials, 'SK')
})

test('a second auth user does not see Jamie as the current identity', () => {
  const identity = displayIdentity(null, {
    id: 'auth-oliver',
    email: 'oliver@example.com',
    user_metadata: { name: 'Oliver Tan' },
  })
  const view = visibleAccount(identity)
  assert.equal(view.greeting, 'Oliver')
  assert.equal(view.name, 'Oliver Tan')
  assert.equal(view.email, 'oliver@example.com')
  assert.equal(view.name.includes('Jamie'), false)
  assert.equal(view.email.includes('jamie@travelos.app'), false)
})

test('email fallback works if display name is unavailable', () => {
  const identity = displayIdentity(null, {
    id: 'auth-solo',
    email: 'solo@example.com',
    user_metadata: {},
  })
  const view = visibleAccount(identity)
  assert.equal(view.name, 'solo@example.com')
  assert.equal(view.greeting, 'solo')
  assert.equal(view.email, 'solo@example.com')
  assert.notEqual(view.greeting, 'Jamie')
})

test('seed demo users still exist as trip member data', () => {
  assert.equal(CURRENT_USER_ID, 'user-jamie')
  assert.ok(users.some((user) => user.id === 'user-jamie' && user.email === 'jamie@travelos.app'))
  assert.ok(trips.some((trip) => trip.members.some((member) => member.userId === 'user-jamie')))
})

test('storage isolation key remains the auth user id', () => {
  const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  assert.equal(getUserStorageKey(id), `travel-os:data:v1:user:${id}`)
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  assert.notEqual(getUserStorageKey(id), STORAGE_KEY)
})

test('fetchOwnProfile only selects the caller profile and never inserts', async () => {
  const calls = []
  const supabase = {
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                async maybeSingle() {
                  calls.push(['maybeSingle'])
                  return { data: { id: value, name: 'Jamie' }, error: null }
                },
              }
            },
          }
        },
        insert() {
          throw new Error('client must not insert profiles')
        },
        upsert() {
          throw new Error('client must not upsert profiles')
        },
      }
    },
  }

  const { profile, error } = await fetchOwnProfile(supabase, 'user-1')
  assert.equal(error, null)
  assert.equal(profile.id, 'user-1')
  assert.deepEqual(calls, [
    ['from', 'profiles'],
    ['select', 'id, name, short_name, email, initials'],
    ['eq', 'id', 'user-1'],
    ['maybeSingle'],
  ])
})
