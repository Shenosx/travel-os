import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSpendByCategory, getSpendingSummary } from './expenses.js'
import { getBudgetStatus, getTripInsightsSnapshot } from './insights.js'
import { getMySpending } from './repayments.js'

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
  date: '2026-12-12',
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
  date: '2026-12-13',
  description: 'Shopping',
  payerId: ME,
  shares: [
    { userId: ALI, amount: 500 },
    { userId: ME, amount: 500 },
  ],
}

const otherTrip = {
  id: 'exp-other',
  tripId: 'trip-2',
  amount: 900,
  currency: 'MYR',
  convertedAmount: 900,
  convertedCurrency: 'MYR',
  category: 'food',
  date: '2026-12-14',
  description: 'Elsewhere',
  payerId: ME,
  shares: [{ userId: ME, amount: 900 }],
}

const trip = {
  id: 'trip-1',
  budgetAmount: 1500,
  currency: 'MYR',
  members: [{ userId: ME }, { userId: ALI }],
}

const personalTrip = {
  id: 'trip-1',
  budgetAmount: 1500,
  currency: 'MYR',
  members: [{ userId: ME }],
}

function repay(partial) {
  return {
    id: 'r-1',
    tripId: 'trip-1',
    fromUserId: ME,
    toUserId: ALI,
    amount: 200,
    currency: 'MYR',
    paymentMethod: 'maybank',
    paidAt: '2026-12-15',
    createdAt: '2026-12-15T02:00:00.000Z',
    ...partial,
  }
}

test('trip total only includes expenses from the current trip', () => {
  const view = getTripInsightsSnapshot({
    trip,
    expenses: [food, shopping, otherTrip],
    currentUserId: ME,
  })
  assert.equal(view.total, 1200)
  assert.equal(getSpendingSummary([food, shopping, otherTrip], ME).total, 2100)
})

test('my spending only includes expenses paid by the current user', () => {
  const view = getTripInsightsSnapshot({
    trip,
    expenses: [food, shopping, otherTrip],
    currentUserId: ME,
  })
  assert.equal(view.yourPaid, 1000)
  assert.equal(getMySpending([food, shopping], ME).total, 1000)
  assert.equal(getMySpending([food, shopping], ALI).total, 200)
})

test('my share uses expense shares, not payer totals', () => {
  const view = getTripInsightsSnapshot({
    trip,
    expenses: [food, shopping],
    currentUserId: ME,
  })
  assert.equal(view.yourShare, 600)
  assert.notEqual(view.yourShare, view.yourPaid)
})

test('repayments do not affect trip spending', () => {
  const without = getTripInsightsSnapshot({
    trip,
    expenses: [food, shopping],
    currentUserId: ME,
  })
  const withPay = getTripInsightsSnapshot({
    trip,
    expenses: [food, shopping],
    repayments: [repay()],
    currentUserId: ME,
  })
  assert.equal(without.total, 1200)
  assert.equal(withPay.total, 1200)
  assert.equal(withPay.repayments.total, 200)
  assert.equal(withPay.repayments.count, 1)
  assert.equal(without.outstanding, 100)
  assert.equal(withPay.outstanding, 0)
})

test('repayments do not affect category totals', () => {
  const expenses = [food, shopping]
  const categories = getSpendByCategory(expenses)
  const view = getTripInsightsSnapshot({
    trip,
    expenses,
    repayments: [repay()],
    currentUserId: ME,
  })
  assert.deepEqual(view.categories, categories)
  assert.equal(view.categories.find((item) => item.category === 'shopping').amount, 1000)
})

test('spending by person uses payer totals', () => {
  const view = getTripInsightsSnapshot({
    trip,
    expenses: [food, shopping],
    currentUserId: ME,
  })
  const me = view.people.find((row) => row.userId === ME)
  const ali = view.people.find((row) => row.userId === ALI)
  assert.equal(me.paid, 1000)
  assert.equal(ali.paid, 200)
  assert.equal(me.share, 600)
  assert.equal(ali.share, 600)
})

test('budget remaining is correct', () => {
  const under = getBudgetStatus(1500, 1200)
  assert.equal(under.hasBudget, true)
  assert.equal(under.remaining, 300)
  assert.equal(under.over, 0)
  assert.equal(under.near, false)
})

test('over-budget state is correct', () => {
  const over = getBudgetStatus(1500, 1740)
  assert.equal(over.hasBudget, true)
  assert.equal(over.remaining, 0)
  assert.equal(over.over, 240)
  assert.equal(getBudgetStatus(0, 200).hasBudget, false)
  assert.equal(getBudgetStatus(null, 200).hasBudget, false)
})

test('personal trips hide shared-trip sections', () => {
  const view = getTripInsightsSnapshot({
    trip: personalTrip,
    expenses: [shopping],
    repayments: [repay()],
    currentUserId: ME,
  })
  assert.equal(view.shared, false)
  assert.equal(view.total, 1000)
})

test('empty trip has the empty snapshot', () => {
  const view = getTripInsightsSnapshot({
    trip,
    expenses: [otherTrip],
    currentUserId: ME,
  })
  assert.equal(view.empty, true)
  assert.equal(view.total, 0)
  assert.equal(view.categories.length, 0)
})
