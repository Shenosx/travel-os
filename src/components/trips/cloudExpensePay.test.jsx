import './cloudExpensePay.dom.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '../../hooks/useAuth.jsx'
import { AppDataProvider } from '../../hooks/useAppData.jsx'
import {
  getCloudExpenseSettlement,
  mapCloudExpense,
  peopleForCloudExpenses,
} from '../../lib/trips/expenses.js'
import { getOutstandingDebts, getUserOutstanding, isPayDraft, payDraftFromDebt } from '../../lib/repayments.js'
import { CloudTripsSection } from './CloudTripsSection.jsx'

const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'
const jason = '00000000-0000-0000-0000-000000000003'
const trip = {
  id: '11111111-1111-1111-1111-111111111111',
  destination: 'Osaka, Japan',
  startDate: '2026-10-01',
  endDate: '2026-10-08',
  budgetAmount: 3000,
  currency: 'MYR',
  visibility: 'shared',
  source: 'cloud',
  ownerId: you,
}

const cloudRow = {
  id: '33333333-3333-3333-3333-333333333333',
  trip_id: trip.id,
  amount: '150.00',
  currency: 'MYR',
  converted_amount: '150.00',
  converted_currency: 'MYR',
  category: 'food',
  date: '2026-10-01',
  description: 'Ramen',
  paid_by: alex,
  booking_id: null,
  place_id: null,
  created_by: you,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  expense_shares: [
    { user_id: you, amount: '40.00' },
    { user_id: alex, amount: '60.00' },
    { user_id: jason, amount: '50.00' },
  ],
}

const expenses = [mapCloudExpense(cloudRow)]
const people = peopleForCloudExpenses(
  [
    { userId: you, name: 'Jamie Lim', shortName: 'Jamie', email: 'jamie@travelos.app', initials: 'JL', role: 'owner' },
    { userId: alex, name: 'Alex Wong', shortName: 'Alex', email: 'alex@example.com', initials: 'AW', role: 'editor' },
    { userId: jason, name: 'Jason Tan', shortName: 'Jason', email: 'jason@example.com', initials: 'JT', role: 'editor' },
  ],
  expenses,
)

function buttonNamed(name) {
  return [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === name)
}

function paymentModal() {
  return document.querySelector('[data-cloud-payment-modal]')
}

test('cloud debt item from a mapped expense row becomes a pay draft', () => {
  const item = getUserOutstanding(getOutstandingDebts(expenses, []), you).youOwe[0].items[0]
  assert.equal(item.toId, alex)
  assert.equal(item.outstanding, 40)
  const draft = payDraftFromDebt(item)
  assert.deepEqual(draft, {
    toUserId: alex,
    expenseId: cloudRow.id,
    amount: 40,
    label: 'Ramen',
  })
  assert.equal(isPayDraft(draft), true)
})

test('Cloud Trips Record payment opens the page-owned modal and save calls addRepayment', async () => {
  const rootNode = document.getElementById('root')
  const root = createRoot(rootNode)
  const saved = []

  await act(async () => {
    root.render(
      <AuthProvider>
        <AppDataProvider>
          <CloudTripsSection
            trips={[trip]}
            currentUserId={you}
            onCreate={async () => ({ error: null })}
            onUpdate={async () => ({ error: null })}
            onDelete={async () => ({ error: null })}
            expenseFixture={{
              expenses,
              people,
              settlement: getCloudExpenseSettlement(expenses, [you, alex, jason]),
              canCreate: true,
              repayments: [],
            }}
            addRepayment={(input, context) => {
              saved.push({ input, context })
              return { id: 'repay-1', ...input }
            }}
          />
        </AppDataProvider>
      </AuthProvider>,
    )
  })

  assert.match(document.body.textContent, /Osaka, Japan/)
  assert.equal(paymentModal(), null)

  await act(async () => {
    buttonNamed('Expenses').click()
  })

  assert.ok(document.querySelector('[data-cloud-expense-sheet]'), 'Cloud Expenses should open from Cloud Trips')
  assert.match(document.body.textContent, /Record payment/)
  assert.equal(paymentModal(), null)

  await act(async () => {
    buttonNamed('Record payment').click()
  })

  const modal = paymentModal()
  assert.ok(modal, 'payment modal should open from Cloud Trips activeRepayment')
  assert.equal(modal.style.zIndex, '9999')
  assert.equal(document.querySelector('[data-cloud-expense-sheet]').contains(modal), false)
  assert.match(modal.textContent, /Alex/)
  assert.match(modal.textContent, /Ramen/)
  assert.match(modal.textContent, /Outstanding/)
  assert.match(modal.textContent, /Record payment/)

  const amount = modal.querySelector('input[type="number"]')
  assert.ok(amount)
  assert.equal(amount.value, '40')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(amount, '25')
    amount.dispatchEvent(new window.Event('input', { bubbles: true }))
    amount.dispatchEvent(new window.Event('change', { bubbles: true }))
  })

  await act(async () => {
    [...modal.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Save').click()
  })

  assert.equal(saved.length, 1)
  assert.equal(saved[0].input.amount, 25)
  assert.equal(saved[0].input.fromUserId, you)
  assert.equal(saved[0].input.toUserId, alex)
  assert.equal(saved[0].input.expenseId, expenses[0].id)
  assert.equal(saved[0].input.tripId, trip.id)
  assert.equal(saved[0].input.paymentMethod, 'maybank')
  assert.ok(Array.isArray(saved[0].context.expenses))
  assert.equal(paymentModal(), null)
  assert.ok(document.querySelector('[data-cloud-expense-sheet]'), 'Expenses sheet should stay open after save')

  await act(async () => {
    buttonNamed('Record payment').click()
  })
  assert.ok(paymentModal())

  await act(async () => {
    ;[...paymentModal().querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel').click()
  })
  assert.equal(paymentModal(), null)
  assert.ok(document.querySelector('[data-cloud-expense-sheet]'))

  await act(async () => {
    root.unmount()
  })
})
