/**
 * Repayments are transfers between people, not expenses.
 * They never change trip spending. They only reduce outstanding balances.
 * Expense split math stays in src/lib/expenses.js.
 */

import { convert, getConvertedShares, getExpenseValue, HOME_CURRENCY, roundMoney } from './currency.js'
import { getBalances, getExpenseActorIds, getSettlements, getSpendByCategory, SHARE_TOLERANCE } from './expenses.js'

export const PAYMENT_METHODS = [
  { id: 'maybank', label: 'Maybank' },
  { id: 'cash', label: 'Cash' },
  { id: 'tng', label: "Touch 'n Go" },
  { id: 'other', label: 'Other' },
]

const PAYMENT_METHOD_IDS = new Set(PAYMENT_METHODS.map((item) => item.id))

/**
 * @param {string} method
 */
export function isPaymentMethod(method) {
  return PAYMENT_METHOD_IDS.has(method)
}

/**
 * @param {string} method
 */
export function paymentMethodLabel(method) {
  return PAYMENT_METHODS.find((item) => item.id === method)?.label ?? 'Other'
}

/**
 * A trip is personal when only one member is on it.
 *
 * @param {{ members?: { userId: string }[] } | null | undefined} trip
 */
export function isSharedTrip(trip) {
  return (trip?.members?.length ?? 0) > 1
}

/**
 * Home/trip-currency value of a repayment. Original amount is never rewritten.
 *
 * @param {import('../types').Repayment} repayment
 * @param {string} [to]
 */
export function getRepaymentValue(repayment, to = repayment.currency ?? HOME_CURRENCY) {
  return convert(repayment.amount, repayment.currency ?? to, to)
}

/**
 * Who owes the payer on each expense. One row per (expense, debtor, payer).
 * Uses converted shares so it stays aligned with getBalances.
 *
 * @param {import('../types').Expense[]} expenses
 */
export function getExpenseDebts(expenses) {
  /** @type {{ expenseId: string, fromId: string, toId: string, amount: number, currency: string, description: string, category: string }[]} */
  const debts = []
  for (const expense of expenses) {
    const currency = expense.convertedCurrency ?? HOME_CURRENCY
    for (const share of getConvertedShares(expense)) {
      if (share.userId === expense.payerId) continue
      const amount = roundMoney(share.convertedAmount)
      if (amount <= SHARE_TOLERANCE) continue
      debts.push({
        expenseId: expense.id,
        fromId: share.userId,
        toId: expense.payerId,
        amount,
        currency,
        description: expense.description,
        category: expense.category,
      })
    }
  }
  return debts
}

/**
 * Expense-based pair total from the existing settlement helper (netted).
 *
 * @param {import('../types').Expense[]} expenses
 * @param {string[]} memberIds
 * @param {string} fromId
 * @param {string} toId
 */
export function getExpenseBasedPairAmount(expenses, memberIds, fromId, toId) {
  const transfers = getSettlements(getBalances(expenses, memberIds))
  const match = transfers.find((item) => item.fromId === fromId && item.toId === toId)
  return match?.amount ?? 0
}

/**
 * Apply repayments onto per-expense debts.
 * Attributed repayments reduce that expense first.
 * Unattributed repayments reduce the same pair FIFO.
 *
 * @param {import('../types').Expense[]} expenses
 * @param {import('../types').Repayment[]} [repayments]
 */
export function getOutstandingDebts(expenses, repayments = []) {
  const debts = getExpenseDebts(expenses).map((debt) => ({
    ...debt,
    outstanding: debt.amount,
    repaid: 0,
  }))

  const ordered = [...repayments].sort((a, b) => {
    const date = String(a.paidAt ?? '').localeCompare(String(b.paidAt ?? ''))
    if (date) return date
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || String(a.id).localeCompare(String(b.id))
  })

  for (const repayment of ordered) {
    const value = getRepaymentValue(repayment, debts[0]?.currency ?? repayment.currency ?? HOME_CURRENCY)
    if (value <= SHARE_TOLERANCE) continue
    let remaining = value
    const targets = debts.filter((debt) => {
      if (debt.fromId !== repayment.fromUserId || debt.toId !== repayment.toUserId) return false
      if (repayment.expenseId) return debt.expenseId === repayment.expenseId
      return true
    })
    for (const debt of targets) {
      if (remaining <= SHARE_TOLERANCE) break
      const apply = roundMoney(Math.min(debt.outstanding, remaining))
      if (apply <= SHARE_TOLERANCE) continue
      debt.outstanding = roundMoney(debt.outstanding - apply)
      debt.repaid = roundMoney(debt.repaid + apply)
      remaining = roundMoney(remaining - apply)
    }
  }

  return debts
}

/**
 * @param {{ outstanding: number, fromId: string, toId: string, expenseId: string }[]} debts
 * @param {string} fromId
 * @param {string} toId
 * @param {string} [expenseId]
 */
export function getOutstandingAmount(debts, fromId, toId, expenseId) {
  return roundMoney(
    debts
      .filter((debt) => {
        if (debt.fromId !== fromId || debt.toId !== toId) return false
        if (expenseId) return debt.expenseId === expenseId
        return true
      })
      .reduce((sum, debt) => sum + debt.outstanding, 0),
  )
}

/**
 * @param {{ outstanding: number, fromId: string, toId: string, expenseId: string, description: string, category: string, repaid: number, amount: number }[]} debts
 * @param {string} userId
 */
export function getUserOutstanding(debts, userId) {
  const open = debts.filter((debt) => debt.outstanding > SHARE_TOLERANCE)
  const youOweItems = open.filter((debt) => debt.fromId === userId)
  const youAreOwedItems = open.filter((debt) => debt.toId === userId)

  function group(items, key) {
    /** @type {Map<string, { userId: string, total: number, items: typeof items }>} */
    const groups = new Map()
    for (const item of items) {
      const id = item[key]
      const current = groups.get(id) ?? { userId: id, total: 0, items: [] }
      current.total = roundMoney(current.total + item.outstanding)
      current.items.push(item)
      groups.set(id, current)
    }
    return [...groups.values()]
  }

  const youOwe = group(youOweItems, 'toId')
  const youAreOwed = group(youAreOwedItems, 'fromId')
  const youOweTotal = roundMoney(youOwe.reduce((sum, row) => sum + row.total, 0))
  const youAreOwedTotal = roundMoney(youAreOwed.reduce((sum, row) => sum + row.total, 0))

  return {
    youOwe,
    youAreOwed,
    youOweTotal,
    youAreOwedTotal,
    net: roundMoney(youAreOwedTotal - youOweTotal),
  }
}

/**
 * Pair outstanding after repayments, using per-expense debts (not a new settlement algorithm).
 *
 * @param {import('../types').Expense[]} expenses
 * @param {import('../types').Repayment[]} repayments
 * @param {string} fromId
 * @param {string} toId
 * @param {string} [expenseId]
 */
export function getPairOutstanding(expenses, repayments, fromId, toId, expenseId) {
  return getOutstandingAmount(getOutstandingDebts(expenses, repayments), fromId, toId, expenseId)
}

/**
 * Amount the current user actually paid as payer. Not their share.
 *
 * @param {import('../types').Expense[]} expenses
 * @param {string} userId
 */
export function getMySpending(expenses, userId) {
  const mine = expenses.filter((expense) => expense.payerId === userId)
  const total = roundMoney(mine.reduce((sum, expense) => sum + getExpenseValue(expense), 0))
  return {
    total,
    count: mine.length,
    byCategory: getSpendByCategory(mine),
  }
}

/**
 * Latest repayment on an expense from one person to another.
 *
 * @param {import('../types').Repayment[]} repayments
 * @param {string} expenseId
 * @param {string} [fromId]
 */
export function getExpenseRepayments(repayments, expenseId, fromId) {
  return repayments
    .filter((item) => item.expenseId === expenseId && (!fromId || item.fromUserId === fromId))
    .sort((a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')) || String(b.id).localeCompare(String(a.id)))
}

/**
 * @param {Partial<import('../types').Repayment>} input
 * @param {import('../types').Expense[]} expenses
 * @param {import('../types').Repayment[]} repayments
 * @param {string[]} [memberIds]
 */
export function validateRepayment(input, expenses, repayments = [], memberIds = []) {
  const fromUserId = input.fromUserId
  const toUserId = input.toUserId
  const tripId = input.tripId
  const amount = Number(input.amount)
  const paymentMethod = input.paymentMethod

  if (!tripId || typeof tripId !== 'string') return { ok: false, error: 'Choose a trip.' }
  if (!fromUserId || !toUserId) return { ok: false, error: 'Choose who paid and who received.' }
  if (fromUserId === toUserId) return { ok: false, error: 'A repayment needs two different people.' }
  if (!isPaymentMethod(paymentMethod)) return { ok: false, error: 'Choose a payment method.' }
  if (!Number.isFinite(amount) || amount <= SHARE_TOLERANCE) return { ok: false, error: 'Enter an amount above zero.' }

  const tripExpenses = expenses.filter((expense) => expense.tripId === tripId)
  const actors = new Set(getExpenseActorIds(tripExpenses, memberIds))
  if (!actors.has(fromUserId) || !actors.has(toUserId)) {
    return { ok: false, error: 'Both people need to be on this trip.' }
  }

  const tripRepayments = repayments.filter((item) => item.tripId === tripId && item.id !== input.id)
  const outstanding = getPairOutstanding(tripExpenses, tripRepayments, fromUserId, toUserId, input.expenseId || undefined)
  if (roundMoney(amount) - outstanding > SHARE_TOLERANCE) {
    return { ok: false, error: 'That is more than the outstanding amount.' }
  }

  return { ok: true, error: '', outstanding }
}
