/**
 * Cloud trip polls. Poll + options are created through create_poll (invoker RPC).
 * Votes are written to poll_votes; user_id comes from tg_poll_votes_guard / auth.uid().
 * This module does not write to the local Travel OS store.
 */

import { isCloudTripId } from './cloud.js'

export const CLOUD_POLL_COLUMNS = ['id', 'trip_id', 'question', 'created_by', 'created_at', 'updated_at'].join(', ')

export const CLOUD_POLL_OPTION_COLUMNS = ['id', 'poll_id', 'label', 'sort_order', 'created_at', 'updated_at'].join(
  ', ',
)

export const CLOUD_POLL_VOTE_COLUMNS = ['poll_id', 'user_id', 'option_id', 'created_at', 'updated_at'].join(', ')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCloudPollId(value) {
  return UUID_RE.test(String(value ?? ''))
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudPollError(error, action = 'load') {
  const fallback = {
    load: 'Polls could not be loaded just now.',
    create: 'This poll could not be saved.',
    update: 'This poll could not be saved.',
    delete: 'This poll could not be deleted.',
    vote: 'That vote could not be saved.',
  }[action] ?? 'Polls could not be loaded just now.'
  const message = redactSecrets(String(error?.message ?? error ?? '').trim())
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim|must be authenticated/i.test(message)) {
    return 'Sign in to continue.'
  }
  if (/add a question/i.test(message)) return 'Add a question.'
  if (/at least two options/i.test(message)) return 'Add at least two options.'
  if (/does not belong to this poll|option_poll|foreign key|_trip_fkey/i.test(message) || code === '23503') {
    return 'That option is not on this poll.'
  }
  if (code === '23505' || /duplicate|unique/i.test(message)) {
    return action === 'vote' ? 'You already have a vote on this poll.' : fallback
  }
  if (/only trip members can vote/i.test(message)) return 'This poll is not available to this account.'
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    if (action === 'vote') return 'This poll is not available to this account.'
    if (action === 'create' || action === 'update') return 'This poll could not be saved.'
    if (action === 'delete') return 'This poll could not be deleted.'
    return 'Those polls are not available to this account.'
  }
  if (/column|relation|schema cache/i.test(message)) return fallback
  return fallback
}

function logCloudPollDetail(error) {
  try {
    if (import.meta?.env?.DEV) console.error('[cloud poll]', error)
  } catch {
    /* node tests and non-vite runtimes */
  }
}

export function mapCloudPollOption(row, voteCount = 0) {
  if (!row) return null
  return {
    id: row.id,
    pollId: row.poll_id,
    label: row.label,
    sortOrder: Number(row.sort_order ?? 0),
    voteCount: Number(voteCount ?? 0),
    source: 'cloud',
  }
}

export function mapCloudPoll(row, options = [], votes = [], currentUserId) {
  if (!row) return null
  const counts = new Map()
  let myVote = null
  for (const vote of votes) {
    if (vote.poll_id !== row.id) continue
    counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1)
    if (currentUserId && vote.user_id === currentUserId) myVote = vote.option_id
  }
  const mappedOptions = options
    .filter((option) => option.poll_id === row.id)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((option) => mapCloudPollOption(option, counts.get(option.id) ?? 0))
    .filter(Boolean)
  return {
    id: row.id,
    tripId: row.trip_id,
    question: row.question,
    options: mappedOptions,
    totalVotes: mappedOptions.reduce((sum, option) => sum + option.voteCount, 0),
    myVote,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'cloud',
  }
}

/** Presentation only. RLS remains the authorization boundary. */
export function cloudPollCapabilities(role) {
  const canRead = Boolean(role)
  const canManage = role === 'owner' || role === 'editor'
  const canVote = Boolean(role)
  return { canRead, canCreate: canManage, canEdit: canManage, canDelete: canManage, canVote }
}

export function assembleCloudPolls(pollRows = [], optionRows = [], voteRows = [], currentUserId) {
  return pollRows
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((row) => mapCloudPoll(row, optionRows, voteRows, currentUserId))
    .filter(Boolean)
}

function optionLabels(input) {
  const raw = Array.isArray(input?.options) ? input.options : []
  return raw
    .map((item) => (typeof item === 'string' ? item : item?.label))
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
}

export async function getCloudTripPolls(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId
  const currentUserId = args.currentUserId ?? session?.user?.id ?? null

  if (!client) return { polls: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { polls: [], error: 'Sign in to see polls on this trip.' }
  if (!isCloudTripId(tripId)) return { polls: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('polls')
    .select(CLOUD_POLL_COLUMNS)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  if (error) {
    logCloudPollDetail(error)
    return { polls: [], error: formatCloudPollError(error) }
  }

  const pollRows = data ?? []
  const pollIds = pollRows.map((row) => row.id)
  if (!pollIds.length) return { polls: [], error: null }

  const [optionResult, voteResult] = await Promise.all([
    client.from('poll_options').select(CLOUD_POLL_OPTION_COLUMNS).in('poll_id', pollIds),
    client.from('poll_votes').select(CLOUD_POLL_VOTE_COLUMNS).in('poll_id', pollIds),
  ])

  if (optionResult.error) {
    logCloudPollDetail(optionResult.error)
    return { polls: [], error: formatCloudPollError(optionResult.error) }
  }
  if (voteResult.error) {
    logCloudPollDetail(voteResult.error)
    return { polls: [], error: formatCloudPollError(voteResult.error) }
  }

  return {
    polls: assembleCloudPolls(pollRows, optionResult.data ?? [], voteResult.data ?? [], currentUserId),
    error: null,
  }
}

export async function createCloudPoll(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId
  const question = String(args.input?.question ?? '').trim()
  const options = optionLabels(args.input)

  if (!client) return { poll: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { poll: null, error: 'Sign in to add a poll.' }
  if (!isCloudTripId(tripId)) return { poll: null, error: 'That cloud trip could not be found.' }
  if (!question) return { poll: null, error: 'Add a question.' }
  if (options.length < 2) return { poll: null, error: 'Add at least two options.' }

  const { data, error } = await client.rpc('create_poll', {
    p_trip_id: tripId,
    p_question: question,
    p_options: options,
  })

  if (error) {
    logCloudPollDetail(error)
    return { poll: null, error: formatCloudPollError(error, 'create') }
  }

  const id = data
  const loaded = await getCloudTripPolls({ client, session, tripId, currentUserId: session.user.id })
  const poll = loaded.polls.find((item) => item.id === id) ?? {
    id,
    tripId,
    question,
    options: options.map((label, sortOrder) => ({
      id: null,
      pollId: id,
      label,
      sortOrder,
      voteCount: 0,
      source: 'cloud',
    })),
    totalVotes: 0,
    myVote: null,
    createdBy: session.user.id,
    createdAt: null,
    updatedAt: null,
    source: 'cloud',
  }
  return { poll, error: loaded.error }
}

export async function updateCloudPoll(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const question = String(args.changes?.question ?? '').trim()

  if (!client) return { poll: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { poll: null, error: 'Sign in to update a poll.' }
  if (!isCloudPollId(id)) return { poll: null, error: 'That poll could not be found.' }
  if (!question) return { poll: null, error: 'Add a question.' }

  const { data, error } = await client
    .from('polls')
    .update({ question })
    .eq('id', id)
    .select(CLOUD_POLL_COLUMNS)
    .maybeSingle()

  if (error) {
    logCloudPollDetail(error)
    return { poll: null, error: formatCloudPollError(error, 'update') }
  }
  if (!data) return { poll: null, error: 'This poll cannot be changed.' }
  return { poll: mapCloudPoll(data, [], [], session.user.id), error: null }
}

export async function deleteCloudPoll(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete a poll.' }
  if (!isCloudPollId(id)) return { ok: false, error: 'That poll could not be found.' }

  const { data, error } = await client.from('polls').delete().eq('id', id).select('id').maybeSingle()
  if (error) {
    logCloudPollDetail(error)
    return { ok: false, error: formatCloudPollError(error, 'delete') }
  }
  if (!data) return { ok: false, error: 'This poll could not be deleted.' }
  return { ok: true, error: null }
}

export async function voteCloudPoll(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const pollId = args.pollId
  const optionId = args.optionId

  if (!client) return { vote: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { vote: null, error: 'Sign in to vote.' }
  if (!isCloudPollId(pollId) || !isCloudPollId(optionId)) {
    return { vote: null, error: 'That option is not on this poll.' }
  }

  const payload = { poll_id: pollId, option_id: optionId }
  const inserted = await client.from('poll_votes').insert(payload).select(CLOUD_POLL_VOTE_COLUMNS).single()

  if (!inserted.error) {
    return {
      vote: { pollId, optionId, userId: inserted.data?.user_id ?? session.user.id, source: 'cloud' },
      error: null,
    }
  }

  const code = String(inserted.error.code ?? '')
  const duplicate = code === '23505' || /duplicate|unique/i.test(String(inserted.error.message ?? ''))
  if (!duplicate) {
    logCloudPollDetail(inserted.error)
    return { vote: null, error: formatCloudPollError(inserted.error, 'vote') }
  }

  const updated = await client
    .from('poll_votes')
    .update({ option_id: optionId })
    .eq('poll_id', pollId)
    .select(CLOUD_POLL_VOTE_COLUMNS)
    .maybeSingle()

  if (updated.error) {
    logCloudPollDetail(updated.error)
    return { vote: null, error: formatCloudPollError(updated.error, 'vote') }
  }
  if (!updated.data) return { vote: null, error: 'That vote could not be saved.' }
  return {
    vote: { pollId, optionId: updated.data.option_id, userId: updated.data.user_id, source: 'cloud' },
    error: null,
  }
}
