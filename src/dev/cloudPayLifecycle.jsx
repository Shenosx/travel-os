import { createRoot } from 'react-dom/client'
import '../index.css'
import { AuthProvider } from '../hooks/useAuth.jsx'
import { AppDataProvider } from '../hooks/useAppData.jsx'
import { getCloudExpenseSettlement, mapCloudExpense, peopleForCloudExpenses } from '../lib/trips/expenses.js'
import { CloudTripsSection } from '../components/trips/CloudTripsSection.jsx'

const you = '00000000-0000-0000-0000-000000000001'
const alex = '00000000-0000-0000-0000-000000000002'
const jason = '00000000-0000-0000-0000-000000000003'
const trip = {
  id: '11111111-1111-1111-1111-111111111111',
  destination: 'Tokyo, Japan',
  startDate: '2026-10-01',
  endDate: '2026-10-08',
  budgetAmount: 3000,
  currency: 'MYR',
  visibility: 'shared',
  source: 'cloud',
  ownerId: you,
}

const expenses = [
  mapCloudExpense({
    id: '33333333-3333-3333-3333-333333333333',
    trip_id: trip.id,
    amount: '150.00',
    currency: 'MYR',
    converted_amount: '150.00',
    converted_currency: 'MYR',
    category: 'transport',
    date: '2026-10-01',
    description: 'Flight',
    paid_by: alex,
    created_by: you,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    expense_shares: [
      { user_id: you, amount: '40.00' },
      { user_id: alex, amount: '60.00' },
      { user_id: jason, amount: '50.00' },
    ],
  }),
]

const people = peopleForCloudExpenses(
  [
    { userId: you, name: 'Jamie Lim', shortName: 'Jamie', initials: 'JL', role: 'owner' },
    { userId: alex, name: 'Alex Wong', shortName: 'Alex', initials: 'AW', role: 'editor' },
    { userId: jason, name: 'Jason Tan', shortName: 'Jason', initials: 'JT', role: 'editor' },
  ],
  expenses,
)

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <AppDataProvider>
      <div className="min-h-svh bg-canvas p-8 text-ink">
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
          addRepayment={(input) => ({ id: 'repay-1', ...input })}
        />
      </div>
    </AppDataProvider>
  </AuthProvider>,
)
