import './cloudExpensePay.dom.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  getCloudExpenseSettlement,
  mapCloudExpense,
  peopleForCloudExpenses,
} from '../../lib/trips/expenses.js'
import { getOutstandingDebts, getUserOutstanding, isPayDraft, payDraftFromDebt } from '../../lib/repayments.js'
import { CloudExpenseView } from './CloudExpenseView.jsx'
import { CloudPayHost } from './CloudPayHost.jsx'

const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'
const jason = '00000000-0000-0000-0000-000000000003'
const trip = {
  id: '11111111-1111-1111-1111-111111111111',
  destination: 'Osaka, Japan',
  currency: 'MYR',
  visibility: 'shared',
  source: 'cloud',
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

function recordPaymentButtons() {
  return [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Record payment')
}

function dialogTitles() {
  return [...document.querySelectorAll('[role="dialog"] h2')].map((node) => node.textContent.trim())
}

function payHost() {
  return document.querySelector('[data-cloud-pay-host]')
}

function expenseSheet() {
  return document.querySelector('[data-cloud-expense-sheet]')
}

function paySheetMountedOutsideExpenses() {
  const form = document.getElementById('pay-sheet-form')
  const host = payHost()
  const sheet = expenseSheet()
  return Boolean(
    form &&
      host &&
      host.contains(form) &&
      dialogTitles().includes('Confirm payment') &&
      sheet &&
      !sheet.contains(form) &&
      !form.closest('[data-cloud-expense-sheet]'),
  )
}

function tap(node) {
  const EventCtor = window.PointerEvent ?? window.MouseEvent
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    node.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true }))
  }
}

function CloudExpensePayTree({ onAddRepayment, onExpensesClose }) {
  const [paySession, setPaySession] = useState(null)
  return (
    <>
      <div data-cloud-expense-sheet="">
        <CloudExpenseView
          trip={trip}
          currentUserId={you}
          expenses={expenses}
          people={people}
          settlement={getCloudExpenseSettlement(expenses, [you, alex, jason])}
          canCreate
          repayments={[]}
          onPay={setPaySession}
          onClose={onExpensesClose}
        />
      </div>
      <CloudPayHost
        session={paySession}
        currentUserId={you}
        onClose={() => setPaySession(null)}
        onConfirm={onAddRepayment}
      />
    </>
  )
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
  assert.deepEqual(payDraftFromDebt(draft), draft)
})

test('Record payment mounts PaySheet outside CloudExpenseSheet and save uses addRepayment', async () => {
  const rootNode = document.getElementById('root')
  const root = createRoot(rootNode)
  let saved = null
  let expensesClosed = false

  await act(async () => {
    root.render(
      <CloudExpensePayTree
        onAddRepayment={(input) => {
          saved = input
          return { id: 'repay-1', ...input }
        }}
        onExpensesClose={() => {
          expensesClosed = true
        }}
      />,
    )
  })

  assert.ok(expenseSheet(), 'Cloud Expenses sheet should mount')
  assert.equal(payHost(), null)
  assert.equal(dialogTitles().includes('Confirm payment'), false)
  assert.ok(dialogTitles().includes('Expenses'))

  const buttons = recordPaymentButtons()
  assert.ok(buttons.length > 0, 'Cloud Expenses should render Record payment')

  await act(async () => {
    tap(buttons[0])
  })

  assert.equal(paySheetMountedOutsideExpenses(), true)
  assert.equal(document.body.contains(payHost()), true)
  assert.equal(payHost().parentElement, document.body)
  assert.ok(document.body.textContent.includes('Confirm payment'))
  assert.ok(dialogTitles().includes('Expenses'))
  assert.match(document.body.textContent, /Alex/)
  assert.match(document.body.textContent, /Ramen/)
  assert.match(document.body.textContent, /Outstanding/)
  assert.equal(expensesClosed, false)

  const amount = document.querySelector('#pay-sheet-form input[type="number"]')
  const method = document.querySelector('#pay-sheet-form select, #pay-sheet-form button')
  const date = document.querySelector('#pay-sheet-form input[type="date"]')
  const note = document.querySelector('#pay-sheet-form textarea')
  const form = document.getElementById('pay-sheet-form')
  assert.ok(amount, 'editable payment amount should be visible')
  assert.equal(amount.value, '40')
  assert.ok(method, 'payment method should be visible')
  assert.ok(date, 'date should be visible')
  assert.ok(note, 'optional note should be visible')
  assert.ok(form)

  await act(async () => {
    form.requestSubmit()
  })

  assert.equal(saved?.amount, 40)
  assert.equal(saved?.fromUserId, you)
  assert.equal(saved?.toUserId, alex)
  assert.equal(saved?.expenseId, expenses[0].id)
  assert.equal(payHost(), null)
  assert.equal(dialogTitles().includes('Confirm payment'), false)
  assert.ok(dialogTitles().includes('Expenses'))

  await act(async () => {
    recordPaymentButtons()[0].click()
  })
  assert.equal(paySheetMountedOutsideExpenses(), true)

  await act(async () => {
    const cancel = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel')
    cancel.click()
  })
  assert.equal(payHost(), null)
  assert.equal(dialogTitles().includes('Confirm payment'), false)
  assert.ok(dialogTitles().includes('Expenses'))
  assert.equal(expensesClosed, false)

  await act(async () => {
    root.unmount()
  })
})
