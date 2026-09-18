import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleCloudPolls,
  cloudPollCapabilities,
  createCloudPoll,
  deleteCloudPoll,
  formatCloudPollError,
  getCloudTripPolls,
  mapCloudPoll,
  updateCloudPoll,
  voteCloudPoll,
} from './polls.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const pollId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const optionA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const optionB = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function thenable(result) {
  const promise = Promise.resolve(result)
  return { then: promise.then.bind(promise), catch: promise.catch.bind(promise) }
}

function mockPollReadClient({ polls = [], options = [], votes = [], error = null } = {}) {
  const calls = []
  return {
    calls,
    from(name) {
      calls.push(['from', name])
      return {
        select(columns) {
          calls.push(['select', name, columns])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                order(orderColumn, optionsArg) {
                  calls.push(['order', orderColumn, optionsArg])
                  return Promise.resolve({ data: polls, error })
                },
              }
            },
            in(column, value) {
              calls.push(['in', name, column, value])
              const data = name === 'poll_options' ? options : votes
              return Promise.resolve({ data, error: null })
            },
          }
        },
      }
    },
  }
}

function mockWriteClient({ rpc, insert, update, remove } = {}) {
  const calls = []
  return {
    calls,
    rpc(name, payload) {
      calls.push(['rpc', name, payload])
      return Promise.resolve(rpc ?? { data: pollId, error: null })
    },
    from(name) {
      calls.push(['from', name])
      return {
        insert(payload) {
          calls.push(['insert', payload])
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(insert ?? { data: { poll_id: pollId, option_id: optionA, user_id: session.user.id }, error: null })
                },
              }
            },
          }
        },
        update(payload) {
          calls.push(['update', payload])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                select() {
                  return {
                    maybeSingle() {
                      const resolved = typeof update === 'function' ? update(payload, value) : update
                      return Promise.resolve(resolved ?? { data: { id: value, question: payload.question }, error: null })
                    },
                  }
                },
              }
            },
          }
        },
        delete() {
          calls.push(['delete'])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                select() {
                  return {
                    maybeSingle() {
                      return Promise.resolve(remove ?? { data: { id: value }, error: null })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

function installStorage() {
  const writes = []
  globalThis.localStorage = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, String(value)]),
    removeItem: () => {},
    clear: () => {},
  }
  return { writes }
}

const pollRow = {
  id: pollId,
  trip_id: tripId,
  question: 'Where should we eat?',
  created_by: session.user.id,
  created_at: '2026-09-17T00:00:00Z',
  updated_at: '2026-09-17T00:00:00Z',
}

const optionRows = [
  { id: optionA, poll_id: pollId, label: 'Schnitzel', sort_order: 0, created_at: '2026-09-17T00:00:00Z', updated_at: '2026-09-17T00:00:00Z' },
  { id: optionB, poll_id: pollId, label: 'Tafelsptiz', sort_order: 1, created_at: '2026-09-17T00:00:00Z', updated_at: '2026-09-17T00:00:00Z' },
]

test('poll read returns an error when supabase is not configured', async () => {
  const result = await getCloudTripPolls({ client: null, session, tripId })
  assert.deepEqual(result.polls, [])
  assert.match(result.error, /not connected/)
})

test('poll read requires an authenticated session', async () => {
  const client = mockPollReadClient({ polls: [pollRow] })
  const result = await getCloudTripPolls({ client, session: null, tripId })
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('poll read maps one trip without a user-id filter', async () => {
  const client = mockPollReadClient({
    polls: [pollRow],
    options: optionRows,
    votes: [{ poll_id: pollId, user_id: session.user.id, option_id: optionA }],
  })
  const result = await getCloudTripPolls({ client, session, tripId })
  assert.equal(result.error, null)
  assert.equal(result.polls[0].question, 'Where should we eat?')
  assert.equal(result.polls[0].myVote, optionA)
  assert.equal(result.polls[0].totalVotes, 1)
  assert.equal(result.polls[0].options[0].voteCount, 1)
  assert.equal(result.polls[0].source, 'cloud')
  assert.deepEqual(client.calls[0], ['from', 'polls'])
  assert.deepEqual(client.calls[2], ['eq', 'trip_id', tripId])
  assert.equal(client.calls.some((call) => call[0] === 'eq' && call[1] === 'created_by'), false)
})

test('empty poll result stays empty', async () => {
  const result = await getCloudTripPolls({ client: mockPollReadClient({ polls: [] }), session, tripId })
  assert.deepEqual(result, { polls: [], error: null })
})

test('create poll requires authentication and uses the invoker RPC', async () => {
  const unsigned = await createCloudPoll({
    client: mockWriteClient(),
    session: null,
    tripId,
    input: { question: 'Dinner?', options: ['A', 'B'] },
  })
  assert.match(unsigned.error, /sign in/i)

  const client = mockWriteClient({ rpc: { data: pollId, error: null } })
  client.from = () => ({
    select() {
      return {
        eq() {
          return { order() { return Promise.resolve({ data: [pollRow], error: null }) } }
        },
        in() {
          return Promise.resolve({ data: optionRows, error: null })
        },
      }
    },
  })
  const result = await createCloudPoll({
    client,
    session,
    tripId,
    input: { question: 'Where should we eat?', options: ['Schnitzel', 'Tafelsptiz'], created_by: 'nope', id: 'x' },
  })
  assert.equal(result.error, null)
  const rpc = client.calls.find((call) => call[0] === 'rpc')
  assert.equal(rpc[1], 'create_poll')
  assert.deepEqual(rpc[2].p_options, ['Schnitzel', 'Tafelsptiz'])
  assert.equal(Object.prototype.hasOwnProperty.call(rpc[2], 'created_by'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(rpc[2], 'p_created_by'), false)
})

test('create poll rejects fewer than two options before calling supabase', async () => {
  const client = mockWriteClient()
  const result = await createCloudPoll({
    client,
    session,
    tripId,
    input: { question: 'Dinner?', options: ['Only one'] },
  })
  assert.match(result.error, /two options/)
  assert.equal(client.calls.length, 0)
})

test('update poll writes question only', async () => {
  const client = mockWriteClient({
    update: { data: { ...pollRow, question: 'Lunch?' }, error: null },
  })
  const result = await updateCloudPoll({ client, session, id: pollId, changes: { question: 'Lunch?', created_by: 'x' } })
  assert.equal(result.error, null)
  assert.equal(result.poll.question, 'Lunch?')
  const updated = client.calls.find((call) => call[0] === 'update')[1]
  assert.deepEqual(updated, { question: 'Lunch?' })
})

test('delete poll targets the poll uuid', async () => {
  const client = mockWriteClient()
  const result = await deleteCloudPoll({ client, session, id: pollId })
  assert.deepEqual(result, { ok: true, error: null })
  assert.deepEqual(client.calls[0], ['from', 'polls'])
})

test('vote insert does not send user_id', async () => {
  const client = mockWriteClient()
  const result = await voteCloudPoll({ client, session, pollId, optionId: optionA })
  assert.equal(result.error, null)
  const inserted = client.calls.find((call) => call[0] === 'insert')[1]
  assert.deepEqual(inserted, { poll_id: pollId, option_id: optionA })
  assert.equal(Object.prototype.hasOwnProperty.call(inserted, 'user_id'), false)
})

test('repeat vote updates the existing row instead of inserting a second vote', async () => {
  const client = mockWriteClient({
    insert: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    update: { data: { poll_id: pollId, user_id: session.user.id, option_id: optionB }, error: null },
  })
  const result = await voteCloudPoll({ client, session, pollId, optionId: optionB })
  assert.equal(result.error, null)
  assert.equal(result.vote.optionId, optionB)
  assert.equal(client.calls.some((call) => call[0] === 'update'), true)
})

test('unauthenticated vote is rejected', async () => {
  const client = mockWriteClient()
  const result = await voteCloudPoll({ client, session: null, pollId, optionId: optionA })
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('foreign key errors stay short and do not leak constraint names', () => {
  const error = formatCloudPollError(
    {
      code: '23503',
      message: 'insert or update on table "poll_votes" violates foreign key constraint "poll_votes_option_poll_fkey"',
    },
    'vote',
  )
  assert.equal(error, 'That option is not on this poll.')
  assert.equal(error.includes('option_poll'), false)
})

test('viewer can vote while only owner and editor can manage', () => {
  assert.deepEqual(cloudPollCapabilities('viewer'), {
    canRead: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canVote: true,
  })
  assert.equal(cloudPollCapabilities('editor').canCreate, true)
  assert.equal(cloudPollCapabilities('owner').canDelete, true)
})

test('assemble preserves vote counts and does not copy option objects into the poll', () => {
  const optionObject = { id: optionA, poll_id: pollId, label: 'Schnitzel', sort_order: 0 }
  const poll = mapCloudPoll(pollRow, [optionObject], [{ poll_id: pollId, user_id: session.user.id, option_id: optionA }], session.user.id)
  assert.equal(Object.prototype.hasOwnProperty.call(poll, 'optionObject'), false)
  assert.equal(poll.options[0].label, 'Schnitzel')
  assert.equal(assembleCloudPolls([pollRow], optionRows, [], session.user.id)[0].myVote, null)
})

test('cloud poll writes do not touch local storage', async () => {
  const { writes } = installStorage()
  const client = mockWriteClient()
  await voteCloudPoll({ client, session, pollId, optionId: optionA })
  await deleteCloudPoll({ client, session, id: pollId })
  assert.equal(writes.length, 0)
})

test('cloud poll code stays off the local store and service role', () => {
  const files = ['src/lib/trips/polls.js', 'src/hooks/useCloudTripPolls.js', 'src/components/trips/CloudPollsSheet.jsx']
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('voteOnPoll('), false, file)
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
    assert.equal(src.includes('service_role'), false, file)
  }
})
