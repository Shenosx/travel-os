import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSpendingSummary } from './expenses.js'
import {
  getMySpending,
  getOutstandingDebts,
  getPairOutstanding,
  getUserOutstanding,
  isSharedTrip,
  validateRepayment,
} from './repayments.js'

const ALI = 'user-ali'
const ME = 'user-jamie'

const food = {
  id: 'exp-food',
  tripId: 'trip-1',
  amount: 200,
  currency: 'MYR',
  convertedAmount: 200,
  convertedCurrency: 'MYR',
  category: 'food',
  date: '2026-09-01',
  description: 'Food',
  payerId: ALI,
  shares: [
    { userId: ALI, amount: 100 },
    { userId: ME, amount: 100 },
  ],
}

const shopping = {
  id: 'exp-shop',
  tripId: 'trip-1',
  amount: 1000,
  currency: 'MYR',
  convertedAmount: 1000,
  convertedCurrency: 'MYR',
  category: 'shopping',
  date: '2026-09-02',
  description: 'Shopping',
  payerId: ALI,
  shares: [
    { userId: ALI, amount: 500 },
    { userId: ME, amount: 500 },
  ],
}

const expenses = [food, shopping]

function repay(partial) {
  return {
    id: partial.id,
    tripId: 'trip-1',
    fromUserId: ME,
    toUserId: ALI,
    currency: 'MYR',
    paymentMethod: 'maybank',
    paidAt: '2026-09-25',
    createdAt: '2026-09-25T02:00:00.000Z',
    ...partial,
  }
}

test('no repayments keeps the original expense-based balance', () => {
  const debts = getOutstandingDebts(expenses, [])
  assert.equal(getPairOutstanding(expenses, [], ME, ALI), 600)
  assert.equal(getPairOutstanding(expenses, [], ME, ALI, 'exp-food'), 100)
  assert.equal(getPairOutstanding(expenses, [], ME, ALI, 'exp-shop'), 500)
  assert.equal(getSpendingSummary(expenses, ME).total, 1200)
  assert.equal(
    debts.reduce((sum, debt) => sum + debt.outstanding, 0),
    600,
  )
})

test('full repayment brings outstanding to zero', () => {
  const repayments = [repay({ id: 'r-full', amount: 600 })]
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI), 0)
  const view = getUserOutstanding(getOutstandingDebts(expenses, repayments), ME)
  assert.equal(view.youOweTotal, 0)
})

test('partial repayment leaves the correct remaining balance', () => {
  const repayments = [repay({ id: 'r-part', amount: 200 })]
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI), 400)
})

test('multiple repayments accumulate against the same pair', () => {
  const repayments = [
    repay({ id: 'r-1', amount: 100, paidAt: '2026-09-20' }),
    repay({ id: 'r-2', amount: 150, paidAt: '2026-09-21' }),
  ]
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI), 350)
})

test('separate Food and Shopping repayments do not settle the other expense', () => {
  const repayments = [repay({ id: 'r-food', amount: 100, expenseId: 'exp-food' })]
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI, 'exp-food'), 0)
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI, 'exp-shop'), 500)
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI), 500)
})

test('repayment never changes total trip spending', () => {
  const before = getSpendingSummary(expenses, ME).total
  const repayments = [repay({ id: 'r-spend', amount: 200, expenseId: 'exp-food' })]
  const after = getSpendingSummary(expenses, ME).total
  assert.equal(before, 1200)
  assert.equal(after, 1200)
  assert.equal(getPairOutstanding(expenses, repayments, ME, ALI), 500)
})

test('my spending only counts expenses paid by the current user', () => {
  const mine = getMySpending(expenses, ME)
  const ali = getMySpending(expenses, ALI)
  assert.equal(mine.total, 0)
  assert.equal(mine.count, 0)
  assert.equal(ali.total, 1200)
  assert.equal(ali.byCategory[0].category, 'shopping')
  assert.equal(ali.byCategory[0].amount, 1000)
  assert.equal(ali.byCategory[1].category, 'food')
  assert.equal(ali.byCategory[1].amount, 200)
})

test('my share is calculated independently from my spending', () => {
  const transport = {
    id: 'exp-taxi',
    tripId: 'trip-1',
    amount: 150,
    currency: 'MYR',
    convertedAmount: 150,
    convertedCurrency: 'MYR',
    category: 'transport',
    date: '2026-09-03',
    description: 'Taxi',
    payerId: ME,
    shares: [
      { userId: ME, amount: 75 },
      { userId: ALI, amount: 75 },
    ],
  }
  const mixed = [...expenses, transport]
  const spending = getMySpending(mixed, ME)
  const summary = getSpendingSummary(mixed, ME)
  assert.equal(spending.total, 150)
  assert.equal(summary.yourShare, 675)
  assert.notEqual(spending.total, summary.yourShare)
})

test('personal trip has no settlement', () => {
  assert.equal(isSharedTrip({ members: [{ userId: ME }] }), false)
  assert.equal(isSharedTrip({ members: [{ userId: ME }, { userId: ALI }] }), true)
  assert.equal(isSharedTrip({ members: [] }), false)
  assert.equal(isSharedTrip(null), false)
})

test('cannot repay more than the outstanding amount', () => {
  const over = validateRepayment(
    {
      tripId: 'trip-1',
      fromUserId: ME,
      toUserId: ALI,
      amount: 601,
      paymentMethod: 'cash',
    },
    expenses,
    [],
    [ME, ALI],
  )
  assert.equal(over.ok, false)
  assert.match(over.error, /outstanding/i)

  const foodPaid = [repay({ id: 'r-food', amount: 100, expenseId: 'exp-food' })]
  const overFood = validateRepayment(
    {
      tripId: 'trip-1',
      fromUserId: ME,
      toUserId: ALI,
      amount: 1,
      paymentMethod: 'maybank',
      expenseId: 'exp-food',
    },
    expenses,
    foodPaid,
    [ME, ALI],
  )
  assert.equal(overFood.ok, false)

  const ok = validateRepayment(
    {
      tripId: 'trip-1',
      fromUserId: ME,
      toUserId: ALI,
      amount: 200,
      paymentMethod: 'tng',
      expenseId: 'exp-shop',
    },
    expenses,
    foodPaid,
    [ME, ALI],
  )
  assert.equal(ok.ok, true)
  assert.equal(ok.outstanding, 500)
})
