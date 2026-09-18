import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAverageSpendPerDay, getSpendByCategory, getSpendByDay, getSpendingSummary } from './expenses.js'

const expenses = [
  {
    id: 'a',
    tripId: 'trip-1',
    amount: 100,
    currency: 'MYR',
    convertedAmount: 100,
    convertedCurrency: 'MYR',
    category: 'food',
    date: '2026-09-01',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 60 },
      { userId: 'user-alex', amount: 40 },
    ],
  },
  {
    id: 'b',
    tripId: 'trip-1',
    amount: 50,
    currency: 'MYR',
    convertedAmount: 50,
    convertedCurrency: 'MYR',
    category: 'food',
    date: '2026-09-01',
    payerId: 'user-jamie',
    shares: [{ userId: 'user-jamie', amount: 50 }],
  },
  {
    id: 'c',
    tripId: 'trip-1',
    amount: 80,
    currency: 'MYR',
    convertedAmount: 80,
    convertedCurrency: 'MYR',
    category: 'transport',
    date: '2026-09-02',
    payerId: 'user-alex',
    shares: [
      { userId: 'user-jamie', amount: 40 },
      { userId: 'user-alex', amount: 40 },
    ],
  },
]

test('insights helpers are derived from expenses, not hard-coded', () => {
  const summary = getSpendingSummary(expenses, 'user-jamie')
  assert.equal(summary.total, 230)
  assert.equal(summary.shared, 180)
  assert.equal(summary.personal, 50)
  assert.equal(summary.yourShare, 150)

  const byDay = getSpendByDay(expenses)
  assert.deepEqual(byDay, [
    { date: '2026-09-01', amount: 150 },
    { date: '2026-09-02', amount: 80 },
  ])
  assert.equal(getAverageSpendPerDay(expenses), 115)

  const categories = getSpendByCategory(expenses)
  assert.equal(categories[0].category, 'food')
  assert.equal(categories[0].amount, 150)
})
