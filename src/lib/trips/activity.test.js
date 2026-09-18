import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cloudActivityActor,
  formatCloudActivity,
  formatCloudActivityError,
  formatCloudActivityTime,
  getCloudTripActivity,
  mapCloudActivity,
} from './activity.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const alex = '00000000-0000-0000-0000-000000000002'

const row = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  trip_id: tripId,
  actor_id: alex,
  type: 'place.add',
  meta: { title: 'Café Central' },
  created_at: '2026-09-17T12:00:00Z',
}

const members = [
  { userId: session.user.id, name: 'Jamie Lim', shortName: 'Jamie', initials: 'JL' },
  { userId: alex, name: 'Alex Wong', shortName: 'Alex', initials: 'AW' },
]

test('activity read returns an error when supabase is not configured', async () => {
  const result = await getCloudTripActivity({ client: null, session, tripId })
  assert.deepEqual(result.activities, [])
  assert.match(result.error, /not connected/)
})

test('activity read requires an authenticated session', async () => {
  const calls = []
  const client = {
    from(name) {
      calls.push(name)
      return { select() { return { eq() { return { order() { return Promise.resolve({ data: [], error: null }) } } } } } }
    },
  }
  const result = await getCloudTripActivity({ client, session: null, tripId })
  assert.match(result.error, /sign in/i)
  assert.equal(calls.length, 0)
})

test('activity read maps one trip newest first without a user filter', async () => {
  const calls = []
  const client = {
    from(name) {
      calls.push(['from', name])
      return {
        select(columns) {
          calls.push(['select', columns])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                order(orderColumn, options) {
                  calls.push(['order', orderColumn, options])
                  return Promise.resolve({ data: [row], error: null })
                },
              }
            },
          }
        },
      }
    },
  }
  const result = await getCloudTripActivity({ client, session, tripId })
  assert.equal(result.error, null)
  assert.deepEqual(result.activities[0], mapCloudActivity(row))
  assert.equal(result.activities[0].source, 'cloud')
  assert.deepEqual(calls[0], ['from', 'activities'])
  assert.deepEqual(calls[2], ['eq', 'trip_id', tripId])
  assert.deepEqual(calls[3], ['order', 'created_at', { ascending: false }])
  assert.equal(calls.some((call) => call[0] === 'eq' && call[1] === 'actor_id'), false)
})

test('activity errors stay short and do not leak codes', async () => {
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve({
                    data: null,
                    error: { message: 'new row violates row-level security policy', code: '42501' },
                  })
                },
              }
            },
          }
        },
      }
    },
  }
  const result = await getCloudTripActivity({ client, session, tripId })
  assert.match(result.error, /not available/)
  assert.equal(result.error.includes('42501'), false)
  assert.equal(formatCloudActivityError({ message: 'relation activities does not exist' }).includes('relation'), false)
})

test('actor names come from members and never expose a raw uuid', () => {
  assert.equal(cloudActivityActor(members, alex, session.user.id).shortName, 'Alex')
  assert.equal(cloudActivityActor(members, session.user.id, session.user.id).shortName, 'You')
  assert.equal(cloudActivityActor(members, 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', session.user.id).shortName, 'Someone')
  assert.equal(
    formatCloudActivity(mapCloudActivity(row), members, session.user.id),
    'Alex added “Café Central” to Places',
  )
  assert.equal(
    formatCloudActivity(
      mapCloudActivity({ ...row, type: 'poll.vote', meta: { question: 'Where should we eat?', title: 'Schnitzel' } }),
      members,
      session.user.id,
    ),
    'Alex voted in “Where should we eat?”',
  )
  assert.equal(
    formatCloudActivity(
      mapCloudActivity({ ...row, type: 'booking.document.add', meta: { title: 'invoice.pdf' } }),
      members,
      session.user.id,
    ),
    'Alex added “invoice.pdf”',
  )
})

test('relative timestamps stay short', () => {
  const now = Date.parse('2026-09-17T12:05:00Z')
  assert.equal(formatCloudActivityTime('2026-09-17T12:04:30Z', now), 'Just now')
  assert.equal(formatCloudActivityTime('2026-09-17T12:00:00Z', now), '5 min ago')
})

test('cloud activity code is read-only and stays off the local store', () => {
  const files = [
    'src/lib/trips/activity.js',
    'src/hooks/useCloudTripActivity.js',
    'src/components/trips/CloudActivitySheet.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('createActivity'), false, file)
    assert.equal(src.includes('.insert('), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
    assert.equal(src.includes('service_role'), false, file)
  }
})
