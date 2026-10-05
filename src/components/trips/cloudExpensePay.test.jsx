import './cloudExpensePay.dom.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { peopleForCloudExpenses, getCloudExpenseSettlement } from '../../lib/trips/expenses.js'
import { CloudExpenseView } from './CloudExpenseView.jsx'

const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'
const trip = {
  id: '11111111-1111-1111-1111-111111111111',
  destination: 'Osaka, Japan',
  currency: 'MYR',
  visibility: 'shared',
  source: 'cloud',
}

const expenses = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    tripId: trip.id,
    amount: 100,
    currency: 'MYR',
    convertedAmount: 100,
    convertedCurrency: 'MYR',
    category: 'food',
    date: '2026-10-01',
    description: 'Ramen',
    payerId: alex,
    shares: [
      { userId: you, amount: 40 },
      { userId: alex, amount: 60 },
    ],
    source: 'cloud',
  },
]

const people = peopleForCloudExpenses(
  [
    { userId: you, name: 'Jamie Lim', shortName: 'Jamie', email: 'jamie@travelos.app', initials: 'JL', role: 'owner' },
    { userId: alex, name: 'Alex Wong', shortName: 'Alex', email: 'alex@example.com', initials: 'AW', role: 'editor' },
  ],
  expenses,
)

function recordPaymentButtons() {
  return [...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Record payment')
}

function dialogTitles() {
  return [...document.querySelectorAll('[role="dialog"] h2')].map((node) => node.textContent.trim())
}

test('clicking Record payment opens the payment sheet in Cloud Expenses', async () => {
  const rootNode = document.getElementById('root')
  const root = createRoot(rootNode)
  let saved = null

  await act(async () => {
    root.render(
      <CloudExpenseView
        trip={trip}
        currentUserId={you}
        expenses={expenses}
        people={people}
        settlement={getCloudExpenseSettlement(expenses, [you, alex])}
        canCreate
        repayments={[]}
        onAddRepayment={(input) => {
          saved = input
          return { id: 'repay-1', ...input }
        }}
        onClose={() => {}}
      />,
    )
  })

  assert.deepEqual(dialogTitles(), ['Expenses'])
  assert.equal(document.body.textContent.includes('Confirm payment'), false)

  const buttons = recordPaymentButtons()
  assert.ok(buttons.length > 0, 'Cloud Expenses should render Record payment')

  await act(async () => {
    buttons[0].click()
  })

  assert.ok(dialogTitles().includes('Expenses'), 'Cloud Expenses sheet should stay open')
  assert.ok(dialogTitles().includes('Confirm payment'), 'PaySheet should mount after Record payment')
  assert.match(document.body.textContent, /Outstanding/)
  assert.match(document.body.textContent, /Ramen/)

  const amount = document.querySelector('input[type="number"]')
  const form = document.getElementById('pay-sheet-form')
  assert.ok(amount, 'payment amount field should be visible')
  assert.equal(amount.value, '40')
  assert.ok(form, 'payment form should be mounted')

  await act(async () => {
    form.requestSubmit()
  })

  assert.equal(saved?.amount, 40)
  assert.equal(saved?.fromUserId, you)
  assert.equal(saved?.toUserId, alex)
  assert.equal(saved?.expenseId, expenses[0].id)
  assert.equal(dialogTitles().includes('Confirm payment'), false)

  await act(async () => {
    recordPaymentButtons()[0].click()
  })
  assert.ok(dialogTitles().includes('Confirm payment'))

  await act(async () => {
    const cancel = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel')
    cancel.click()
  })
  assert.equal(dialogTitles().includes('Confirm payment'), false)
  assert.ok(dialogTitles().includes('Expenses'))

  await act(async () => {
    root.unmount()
  })
})
