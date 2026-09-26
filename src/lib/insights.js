/**
 * Trip Insights view model. Composes existing expense, balance, and repayment helpers.
 * Does not invent a second spending or settlement algorithm.
 */

import { roundMoney } from './currency.js'
import {
  getBalances,
  getExpenseActorIds,
  getExpensesForTrip,
  getSpendByCategory,
  getSpendingSummary,
} from './expenses.js'
import { spendingRatio } from './format.js'
import {
  getMySpending,
  getOutstandingDebts,
  getRepaymentValue,
  getUserOutstanding,
  isSharedTrip,
} from './repayments.js'

/**
 * @param {number | null | undefined} budgetAmount
 * @param {number} spent
 */
export function getBudgetStatus(budgetAmount, spent) {
  const total = roundMoney(Number(spent) || 0)
  const budget = Number(budgetAmount)
  if (!Number.isFinite(budget) || budget <= 0) {
    return {
      hasBudget: false,
      budget: 0,
      spent: total,
      remaining: 0,
      over: 0,
      near: false,
      ratio: 0,
    }
  }

  const delta = roundMoney(budget - total)
  const remaining = Math.max(delta, 0)
  const over = delta < 0 ? roundMoney(-delta) : 0
  const near = over === 0 && remaining > 0 && remaining <= roundMoney(budget * 0.1)

  return {
    hasBudget: true,
    budget,
    spent: total,
    remaining,
    over,
    near,
    ratio: spendingRatio(total, budget),
  }
}

/**
 * @param {import('../types').Repayment[]} repayments
 * @param {string} [currency]
 */
export function getRepaymentSummary(repayments, currency) {
  const ordered = [...repayments].sort(
    (a, b) =>
      String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')) || String(b.id).localeCompare(String(a.id)),
  )
  return {
    total: roundMoney(repayments.reduce((sum, item) => sum + getRepaymentValue(item, currency ?? item.currency), 0)),
    count: repayments.length,
    latest: ordered[0] ?? null,
  }
}

/**
 * Snapshot for one trip. Always filters expenses and repayments by trip.id.
 *
 * @param {{
 *   trip: import('../types').Trip,
 *   expenses: import('../types').Expense[],
 *   repayments?: import('../types').Repayment[],
 *   currentUserId: string,
 *   memberIds?: string[],
 * }} input
 */
export function getTripInsightsSnapshot({ trip, expenses, repayments = [], currentUserId, memberIds }) {
  const tripExpenses = getExpensesForTrip(expenses, trip.id)
  const tripRepayments = repayments.filter((item) => item.tripId === trip.id)
  const ids = memberIds ?? trip.members.map((member) => member.userId)
  const actors = getExpenseActorIds(tripExpenses, ids)
  const summary = getSpendingSummary(tripExpenses, currentUserId)
  const mySpending = getMySpending(tripExpenses, currentUserId)
  const balances = getBalances(tripExpenses, actors)
  const outstanding = getUserOutstanding(getOutstandingDebts(tripExpenses, tripRepayments), currentUserId)

  return {
    tripId: trip.id,
    shared: isSharedTrip(trip),
    empty: tripExpenses.length === 0,
    total: summary.total,
    yourShare: summary.yourShare,
    yourPaid: mySpending.total,
    outstanding: outstanding.youOweTotal,
    youAreOwed: outstanding.youAreOwedTotal,
    net: outstanding.net,
    categories: getSpendByCategory(tripExpenses),
    people: actors.map((userId) => ({
      userId,
      paid: balances[userId]?.paid ?? 0,
      share: balances[userId]?.share ?? 0,
    })),
    budget: getBudgetStatus(trip.budgetAmount, summary.total),
    repayments: getRepaymentSummary(tripRepayments, trip.currency),
    expenses: tripExpenses,
  }
}
