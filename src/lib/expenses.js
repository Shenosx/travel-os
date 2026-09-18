/**
 * Expense helpers. Splits are always stored as explicit amounts per person.
 * Equal split is never assumed — callers must provide each share.
 * Payer and shares are independent.
 */

import { getConvertedShareAmount, getConvertedShares, getExpenseValue, roundMoney } from './currency.js'

export const SHARE_TOLERANCE = 0.009

/**
 * @param {import('../types').Expense} expense
 */
export function getShareTotal(expense) {
  return roundMoney(expense.shares.reduce((sum, share) => sum + share.amount, 0))
}

/**
 * @param {number} amount
 * @param {{ amount: number }[]} shares
 */
export function getShareDelta(amount, shares) {
  const total = roundMoney(shares.reduce((sum, share) => sum + (Number(share.amount) || 0), 0))
  return roundMoney((Number(amount) || 0) - total)
}

/**
 * @param {import('../types').Expense} expense
 */
export function sharesMatchAmount(expense) {
  return Math.abs(getShareTotal(expense) - expense.amount) < SHARE_TOLERANCE
}

/**
 * @param {import('../types').Expense[]} expenses
 * @param {string} tripId
 */
export function getExpensesForTrip(expenses, tripId) {
  return expenses
    .filter((expense) => expense.tripId === tripId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/**
 * @param {import('../types').Expense[]} expenses
 * @param {string} [tripId]
 */
export function getSpendByCategory(expenses, tripId) {
  const source = tripId ? expenses.filter((expense) => expense.tripId === tripId) : expenses
  /** @type {Record<string, number>} */
  const totals = {}
  for (const expense of source) {
    const value = getExpenseValue(expense)
    totals[expense.category] = roundMoney((totals[expense.category] ?? 0) + value)
  }
  return Object.entries(totals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Current members plus anyone still on a historical expense.
 * Removing a member must not drop them from settlement math.
 *
 * @param {import('../types').Expense[]} expenses
 * @param {string[]} [memberIds]
 */
export function getExpenseActorIds(expenses, memberIds = []) {
  const ids = new Set(memberIds)
  for (const expense of expenses) {
    if (expense.payerId) ids.add(expense.payerId)
    for (const share of expense.shares) ids.add(share.userId)
  }
  return [...ids]
}

/**
 * Net balance per member in converted/home currency.
 * paid uses the expense total; share uses that person's converted share.
 * Positive means they should receive money.
 *
 * @param {import('../types').Expense[]} expenses
 * @param {string[]} memberIds
 */
export function getBalances(expenses, memberIds) {
  /** @type {Record<string, { paid: number, share: number, net: number }>} */
  const balances = {}
  for (const userId of memberIds) {
    balances[userId] = { paid: 0, share: 0, net: 0 }
  }
  for (const expense of expenses) {
    const value = getExpenseValue(expense)
    if (balances[expense.payerId]) {
      balances[expense.payerId].paid = roundMoney(balances[expense.payerId].paid + value)
    }
    for (const share of getConvertedShares(expense)) {
      if (balances[share.userId]) {
        balances[share.userId].share = roundMoney(balances[share.userId].share + share.convertedAmount)
      }
    }
  }
  for (const userId of memberIds) {
    balances[userId].net = roundMoney(balances[userId].paid - balances[userId].share)
  }
  return balances
}

/**
 * Greedy settlement: debtors pay creditors. No reciprocal pairs.
 *
 * @param {Record<string, { net: number }>} balances
 * @returns {import('../types').SettlementTransfer[]}
 */
export function getSettlements(balances) {
  const debtors = []
  const creditors = []

  for (const [userId, row] of Object.entries(balances)) {
    const net = roundMoney(row.net)
    if (net < -SHARE_TOLERANCE) debtors.push({ userId, amount: roundMoney(-net) })
    else if (net > SHARE_TOLERANCE) creditors.push({ userId, amount: net })
  }

  debtors.sort((a, b) => b.amount - a.amount)
  creditors.sort((a, b) => b.amount - a.amount)

  /** @type {import('../types').SettlementTransfer[]} */
  const transfers = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = roundMoney(Math.min(debtors[i].amount, creditors[j].amount))
    if (amount > SHARE_TOLERANCE) {
      transfers.push({
        fromId: debtors[i].userId,
        toId: creditors[j].userId,
        amount,
      })
    }
    debtors[i].amount = roundMoney(debtors[i].amount - amount)
    creditors[j].amount = roundMoney(creditors[j].amount - amount)
    if (debtors[i].amount <= SHARE_TOLERANCE) i += 1
    if (creditors[j].amount <= SHARE_TOLERANCE) j += 1
  }
  return transfers
}

/**
 * @param {import('../types').SettlementTransfer[]} transfers
 * @param {string} userId
 */
export function getUserSettlement(transfers, userId) {
  const youOwe = transfers.filter((item) => item.fromId === userId)
  const youReceive = transfers.filter((item) => item.toId === userId)
  return {
    youOwe,
    youReceive,
    youOweTotal: roundMoney(youOwe.reduce((sum, item) => sum + item.amount, 0)),
    youReceiveTotal: roundMoney(youReceive.reduce((sum, item) => sum + item.amount, 0)),
  }
}

/**
 * @param {import('../types').Expense[]} expenses
 * @param {string} userId
 */
export function getSpendingSummary(expenses, userId) {
  let total = 0
  let personal = 0
  let shared = 0
  let yourShare = 0
  let sharedCount = 0

  for (const expense of expenses) {
    const value = getExpenseValue(expense)
    const yours = getConvertedShareAmount(expense, userId)
    const isShared = expense.shares.length > 1
    total = roundMoney(total + value)
    yourShare = roundMoney(yourShare + yours)
    if (isShared) {
      shared = roundMoney(shared + value)
      sharedCount += 1
    } else {
      personal = roundMoney(personal + value)
    }
  }

  return { total, personal, shared, yourShare, sharedCount, count: expenses.length }
}

/**
 * @param {import('../types').Expense[]} expenses
 */
export function getSpendByDay(expenses) {
  /** @type {Record<string, number>} */
  const totals = {}
  for (const expense of expenses) {
    if (!expense?.date) continue
    const value = getExpenseValue(expense)
    totals[expense.date] = roundMoney((totals[expense.date] ?? 0) + value)
  }
  return Object.entries(totals)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * @param {import('../types').Expense[]} expenses
 */
export function getAverageSpendPerDay(expenses) {
  const days = getSpendByDay(expenses)
  if (!days.length) return 0
  const total = roundMoney(days.reduce((sum, item) => sum + item.amount, 0))
  return roundMoney(total / days.length)
}

export const CATEGORY_LABEL = {
  flights: 'Flights',
  lodging: 'Lodging',
  food: 'Food',
  transport: 'Transport',
  activity: 'Activity',
  shopping: 'Shopping',
  other: 'Other',
}

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL)
