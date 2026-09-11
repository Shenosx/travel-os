import { useMemo, useState } from 'react'
import { ExpenseRow } from '../components/expenses/ExpenseRow.jsx'
import { SettlementPanel } from '../components/expenses/SettlementPanel.jsx'
import { useExpenseComposer } from '../components/expenses/ExpenseComposer.jsx'
import { ProgressBar } from '../components/ui/ProgressBar.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { CATEGORY_LABEL, getBalances, getExpenseActorIds, getExpensesForTrip, getSettlements, getSpendByCategory, getSpendingSummary, getUserSettlement } from '../lib/expenses.js'
import { formatMoney } from '../lib/format.js'
import { HOME_CURRENCY } from '../lib/currency.js'
import { peopleForTrip } from '../lib/people.js'
import { canEditExpense, canOnTrip } from '../lib/permissions.js'

export function ExpensesPage() {
  const { expenses, trips, users, currentUser } = useAppData()
  const { openEdit, openCreate } = useExpenseComposer()
  const [tripFilter, setTripFilter] = useState('all')

  const visible = useMemo(
    () => (tripFilter === 'all' ? expenses : getExpensesForTrip(expenses, tripFilter)),
    [expenses, tripFilter],
  )
  const sorted = useMemo(
    () => [...visible].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [visible],
  )
  const summary = getSpendingSummary(sorted, currentUser.id)
  const categories = getSpendByCategory(sorted)
  const maxCategory = categories[0]?.amount ?? 1
  const selectedTrip = trips.find((trip) => trip.id === tripFilter) ?? null
  const canAdd = selectedTrip
    ? canOnTrip(selectedTrip, currentUser.id, 'addExpense')
    : trips.some((trip) => canOnTrip(trip, currentUser.id, 'addExpense'))

  const tripPeople = selectedTrip ? peopleForTrip(selectedTrip, sorted, users) : []
  const actorIds = selectedTrip
    ? getExpenseActorIds(sorted, selectedTrip.members.map((member) => member.userId))
    : []
  const balances = selectedTrip ? getBalances(sorted, actorIds) : null
  const transfers = balances ? getSettlements(balances) : []
  const userSettlement = balances ? getUserSettlement(transfers, currentUser.id) : null

  function membersForExpense(expense) {
    const trip = trips.find((item) => item.id === expense.tripId)
    return peopleForTrip(trip, [expense], users)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Expenses</p>
          <h1 className="font-display mt-2 text-[36px] leading-tight tracking-[-0.04em] sm:text-[44px]">
            All spending
          </h1>
        </div>
        {canAdd ? (
          <button type="button" className="text-sm text-accent" onClick={() => openCreate(selectedTrip?.id)}>
            Add expense
          </button>
        ) : null}
      </div>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        Original currencies are kept. Totals are shown in {HOME_CURRENCY}. Shares are assigned as exact amounts.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <FilterChip selected={tripFilter === 'all'} onClick={() => setTripFilter('all')}>
          All
        </FilterChip>
        {trips.map((trip) => (
          <FilterChip key={trip.id} selected={tripFilter === trip.id} onClick={() => setTripFilter(trip.id)}>
            {trip.city}
          </FilterChip>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Total spent" value={formatMoney(summary.total)} />
        <SummaryCard label="Your share" value={formatMoney(summary.yourShare)} />
        <SummaryCard label="Shared" value={formatMoney(summary.shared)} />
        <SummaryCard label="Personal" value={formatMoney(summary.personal)} />
      </div>

      {selectedTrip && userSettlement ? (
        <div className="mt-10">
          <SettlementPanel
            transfers={transfers}
            userSettlement={userSettlement}
            members={tripPeople}
            currentUserId={currentUser.id}
            currency={selectedTrip.currency}
          />
        </div>
      ) : null}

      {categories.length ? (
        <section className="mt-12">
          <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Category breakdown</h2>
          <ul className="mt-5 space-y-4">
            {categories.map((item) => (
              <li key={item.category}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{CATEGORY_LABEL[item.category]}</span>
                  <span className="text-sm tabular-nums text-ink-muted">{formatMoney(item.amount)}</span>
                </div>
                <ProgressBar value={(item.amount / maxCategory) * 100} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12">
        <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Recent expenses</h2>
        {sorted.length ? (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {sorted.map((expense) => {
              const trip = trips.find((item) => item.id === expense.tripId)
              const editable = canEditExpense(trip, currentUser.id, expense)
              return (
                <li key={expense.id}>
                  <p className="pt-5 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">
                    {trip?.destination}
                  </p>
                  <ExpenseRow
                    expense={expense}
                    members={membersForExpense(expense)}
                    currentUserId={currentUser.id}
                    onClick={editable ? () => openEdit(expense.id) : undefined}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-6 border border-line px-5 py-8 text-sm text-ink-muted">No expenses in this view.</p>
        )}
      </section>
    </div>
  )
}

function FilterChip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
        selected ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
      }`}
    >
      {children}
    </button>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-5">
      <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</p>
      <p className="font-display mt-3 text-[28px] leading-none tracking-[-0.04em] text-ink">{value}</p>
    </div>
  )
}
