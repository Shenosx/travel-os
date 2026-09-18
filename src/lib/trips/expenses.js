/**
 * Cloud trip expenses. Writes go only through save_expense / delete_expense RPCs.
 * This module does not write to the local Travel OS store.
 */

import { convert, HOME_CURRENCY, roundMoney } from '../currency.js'
import { getBalances, getExpenseActorIds, getSettlements, getShareDelta, SHARE_TOLERANCE } from '../expenses.js'
import { isCloudTripId } from './cloud.js'

export const CLOUD_EXPENSE_COLUMNS = [
  'id',
  'trip_id',
  'amount',
  'currency',
  'converted_amount',
  'converted_currency',
  'category',
  'date',
  'description',
  'paid_by',
  'booking_id',
  'place_id',
  'created_by',
  'created_at',
  'updated_at',
  'expense_shares(user_id, amount)',
].join(', ')

export const CLOUD_EXPENSE_CATEGORIES = [
  'flights',
  'lodging',
  'food',
  'transport',
  'activity',
  'shopping',
  'other',
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CURRENCY_RE = /^[A-Z]{3}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isCloudExpenseId(value) {
  return UUID_RE.test(String(value ?? ''))
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudExpenseError(error, action = 'load') {
  const message = redactSecrets(String(error?.message ?? error ?? '').trim())
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim|must be authenticated/i.test(message)) {
    return 'Sign in to continue.'
  }
  if (/viewers cannot/i.test(message)) {
    return 'You can view expenses on this trip, not change them.'
  }
  if (/editors can only modify their own/i.test(message)) {
    return 'You can only change expenses you added.'
  }
  if (/must sum to the expense amount/i.test(message)) {
    return 'Shares must add up to the total.'
  }
  if (/trip members or historical expense actors|invalid payer|invalid participant/i.test(message)) {
    return 'Choose people who are on this cloud trip.'
  }
  if (/expense not found/i.test(message)) {
    return 'That expense could not be found.'
  }
  if (/not a member of this trip/i.test(message)) {
    return 'Those expenses are not available to this account.'
  }
  if (code === '23503' || /_trip_fkey|foreign key/i.test(message)) {
    if (/place/i.test(message) && !/booking/i.test(message)) {
      return "That place doesn't belong to this trip."
    }
    if (/booking/i.test(message) && !/place/i.test(message)) {
      return "That booking doesn't belong to this trip."
    }
    return 'That booking or place is not on this cloud trip.'
  }
  if (/booking|place/i.test(message) && /not found|violates|does not belong/i.test(message)) {
    return 'That booking or place is not on this cloud trip.'
  }
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    if (action === 'create' || action === 'update') return 'This expense could not be saved.'
    if (action === 'delete') return 'This expense could not be deleted.'
    return 'Those expenses are not available to this account.'
  }
  if (action === 'create' || action === 'update') return 'This expense could not be saved.'
  if (action === 'delete') return 'This expense could not be deleted.'
  return 'Expenses could not be loaded just now.'
}

export function mapCloudExpenseShare(row) {
  if (!row) return null
  return {
    userId: row.user_id,
    amount: Number(row.amount ?? 0),
  }
}

export function mapCloudExpense(row) {
  if (!row) return null
  const shares = Array.isArray(row.expense_shares) ? row.expense_shares : Array.isArray(row.shares) ? row.shares : []
  return {
    id: row.id,
    tripId: row.trip_id,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    convertedAmount: Number(row.converted_amount ?? 0),
    convertedCurrency: row.converted_currency,
    category: row.category,
    date: row.date,
    description: row.description ?? '',
    payerId: row.paid_by,
    bookingId: row.booking_id ?? null,
    placeId: row.place_id ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shares: shares.map(mapCloudExpenseShare).filter(Boolean),
    source: 'cloud',
  }
}

export function peopleForCloudExpenses(members = [], expenses = []) {
  const byId = new Map()
  for (const member of members) {
    byId.set(member.userId, {
      ...member,
      former: false,
      user: {
        id: member.userId,
        name: member.name || '',
        shortName: member.shortName || '',
        email: member.email || '',
        initials: member.initials || '?',
      },
    })
  }
  for (const expense of expenses) {
    const ids = [expense.payerId, ...(expense.shares ?? []).map((share) => share.userId)]
    for (const userId of ids) {
      if (!userId || byId.has(userId)) continue
      byId.set(userId, {
        userId,
        role: null,
        name: 'Former traveller',
        shortName: 'Former',
        email: '',
        initials: '?',
        former: true,
        source: 'cloud',
        user: {
          id: userId,
          name: 'Former traveller',
          shortName: 'Former',
          email: '',
          initials: '?',
        },
      })
    }
  }
  return [...byId.values()]
}

/** Presentation only. RLS/RPC remain authoritative. */
export function cloudExpenseCapabilities(role, userId, expense) {
  const canRead = Boolean(role)
  const canCreate = role === 'owner' || role === 'editor'
  const owns = Boolean(expense?.createdBy && userId && expense.createdBy === userId)
  const canEdit = role === 'owner' || (role === 'editor' && owns)
  const canDelete = canEdit && Boolean(expense)
  return { canRead, canCreate, canEdit, canDelete }
}

export function getCloudExpenseSettlement(expenses, memberIds = []) {
  const actorIds = getExpenseActorIds(expenses, memberIds)
  const balances = getBalances(expenses, actorIds)
  const transfers = getSettlements(balances)
  return { actorIds, balances, transfers }
}

function normalizeShares(shares = []) {
  return shares.map((share) => ({
    user_id: share.user_id ?? share.userId,
    amount: roundMoney(Number(share.amount) || 0),
  }))
}

export function cloudExpenseRpcPayload(input = {}, options = {}) {
  const amount = roundMoney(Number(input.amount) || 0)
  const currency = String(input.currency ?? HOME_CURRENCY).trim().toUpperCase()
  const tripCurrency = String(options.tripCurrency ?? input.convertedCurrency ?? currency).trim().toUpperCase()
  const convertedAmount =
    input.convertedAmount != null && input.convertedCurrency
      ? roundMoney(Number(input.convertedAmount) || 0)
      : convert(amount, currency, tripCurrency)
  const shares = normalizeShares(input.shares)

  const payload = {
    p_trip_id: input.tripId,
    p_amount: amount,
    p_currency: currency,
    p_converted_amount: convertedAmount,
    p_converted_currency: tripCurrency,
    p_category: input.category,
    p_date: input.date,
    p_description: String(input.description ?? ''),
    p_paid_by: input.payerId,
    p_shares: shares,
    p_booking_id: input.bookingId ?? null,
    p_place_id: input.placeId ?? null,
  }

  if (input.id) payload.p_id = input.id
  return payload
}

function validateWriteInput(input, payload, actorIds) {
  if (!isCloudTripId(input.tripId)) return 'That cloud trip could not be found.'
  if (!(payload.p_amount > 0)) return 'Enter an amount.'
  if (!CURRENCY_RE.test(payload.p_currency) || !CURRENCY_RE.test(payload.p_converted_currency)) {
    return 'Use a 3-letter currency code.'
  }
  if (!CLOUD_EXPENSE_CATEGORIES.includes(payload.p_category)) return 'Choose a category.'
  if (!DATE_RE.test(String(payload.p_date ?? ''))) return 'Check the date, then try again.'
  if (!isCloudExpenseId(payload.p_paid_by)) return 'Choose who paid.'
  if (!payload.p_shares.length) return 'Assign each person’s share.'
  if (Math.abs(getShareDelta(payload.p_amount, payload.p_shares.map((share) => ({ amount: share.amount })))) >= SHARE_TOLERANCE) {
    return 'Shares must add up to the total.'
  }
  if (payload.p_id && !isCloudExpenseId(payload.p_id)) return 'That expense could not be found.'
  if (payload.p_booking_id && !isCloudExpenseId(payload.p_booking_id)) {
    return 'That booking or place is not on this cloud trip.'
  }
  if (payload.p_place_id && !isCloudExpenseId(payload.p_place_id)) {
    return 'That booking or place is not on this cloud trip.'
  }
  if (Array.isArray(actorIds) && actorIds.length) {
    const allowed = new Set(actorIds)
    if (!allowed.has(payload.p_paid_by)) return 'Choose people who are on this cloud trip.'
    for (const share of payload.p_shares) {
      if (!allowed.has(share.user_id) || !isCloudExpenseId(share.user_id)) {
        return 'Choose people who are on this cloud trip.'
      }
    }
  }
  return null
}

/**
 * @param {{ client?: { from: Function } | null, session?: object | null, tripId?: string }} [args]
 */
export async function getCloudTripExpenses(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId

  if (!client) return { expenses: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { expenses: [], error: 'Sign in to see expenses on this trip.' }
  if (!isCloudTripId(tripId)) return { expenses: [], error: 'That cloud trip could not be found.' }

  const { data, error } = await client
    .from('expenses')
    .select(CLOUD_EXPENSE_COLUMNS)
    .eq('trip_id', tripId)
    .order('date', { ascending: false })

  if (error) return { expenses: [], error: formatCloudExpenseError(error) }

  return {
    expenses: (data ?? []).map(mapCloudExpense).filter(Boolean),
    error: null,
  }
}

async function saveThroughRpc(args, { isUpdate }) {
  const client = args.client ?? null
  const session = args.session ?? null
  const input = { ...(args.input ?? {}), tripId: args.tripId ?? args.input?.tripId, id: args.id ?? args.input?.id }
  const actorIds = args.actorIds

  if (!client) return { expense: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) {
    return { expense: null, error: isUpdate ? 'Sign in to update an expense.' : 'Sign in to add an expense.' }
  }

  const payload = cloudExpenseRpcPayload(input, { tripCurrency: args.tripCurrency })
  if (isUpdate) {
    if (!payload.p_id) return { expense: null, error: 'That expense could not be found.' }
  } else if (isCloudExpenseId(args.id)) {
    payload.p_id = args.id
  } else {
    delete payload.p_id
  }

  const invalid = validateWriteInput(input, payload, actorIds)
  if (invalid) return { expense: null, error: invalid }

  const { data, error } = await client.rpc('save_expense', payload)
  if (error) return { expense: null, error: formatCloudExpenseError(error, isUpdate ? 'update' : 'create') }

  const id = typeof data === 'string' ? data : data?.toString?.() ?? payload.p_id
  if (!id) return { expense: null, error: 'This expense could not be saved.' }

  return {
    expense: {
      id,
      tripId: payload.p_trip_id,
      amount: payload.p_amount,
      currency: payload.p_currency,
      convertedAmount: payload.p_converted_amount,
      convertedCurrency: payload.p_converted_currency,
      category: payload.p_category,
      date: payload.p_date,
      description: payload.p_description,
      payerId: payload.p_paid_by,
      bookingId: payload.p_booking_id,
      placeId: payload.p_place_id,
      createdBy: isUpdate ? input.createdBy : session.user.id,
      shares: payload.p_shares.map((share) => ({ userId: share.user_id, amount: share.amount })),
      source: 'cloud',
    },
    error: null,
  }
}

export async function createCloudExpense(args = {}) {
  return saveThroughRpc(args, { isUpdate: false })
}

export async function updateCloudExpense(args = {}) {
  return saveThroughRpc({ ...args, id: args.id ?? args.input?.id }, { isUpdate: true })
}

/**
 * @param {{ client?: { rpc: Function } | null, session?: object | null, id?: string }} [args]
 */
export async function deleteCloudExpense(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete an expense.' }
  if (!isCloudExpenseId(id)) return { ok: false, error: 'That expense could not be found.' }

  const { error } = await client.rpc('delete_expense', { p_id: id })
  if (error) return { ok: false, error: formatCloudExpenseError(error, 'delete') }
  return { ok: true, error: null }
}
