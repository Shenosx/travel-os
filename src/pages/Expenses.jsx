import { useMemo, useState } from 'react'
import { ExpenseRow } from '../components/expenses/ExpenseRow.jsx'
import { PaySheet } from '../components/expenses/PaySheet.jsx'
import { SettlementLedger } from '../components/expenses/SettlementLedger.jsx'
import { useExpenseComposer } from '../components/expenses/ExpenseComposer.jsx'
import { ProgressBar } from '../components/ui/ProgressBar.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import {
  CATEGORY_LABEL,
  getExpensesForTrip,
  getSpendByCategory,
  getSpendingSummary,
} from '../lib/expenses.js'
import { formatMoney } from '../lib/format.js'
import { HOME_CURRENCY } from '../lib/currency.js'
import { peopleForTrip } from '../lib/people.js'
import { canDeleteRepayment, canEditExpense, canOnTrip } from '../lib/permissions.js'
import { getMySpending, getOutstandingDebts, getUserOutstanding, isSharedTrip } from '../lib/repayments.js'

export function ExpensesPage() {
  const { expenses, repayments, trips, users, currentUser, addRepayment, deleteRepayment, restoreRepayment } =
    useAppData()
  const { openEdit, openCreate } = useExpenseComposer()
  const showToast = useToast()
  const [tripFilter, setTripFilter] = useState('all')
  const [spendView, setSpendView] = useState('everyone')
  const [payDraft, setPayDraft] = useState(null)

  const visible = useMemo(
    () => (tripFilter === 'all' ? expenses : getExpensesForTrip(expenses, tripFilter)),
    [expenses, tripFilter],
  )
  const sorted = useMemo(
    () => [...visible].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [visible],
  )
  const summary = getSpendingSummary(sorted, currentUser.id)
  const mySpending = getMySpending(sorted, currentUser.id)
  const categories = spendView === 'mine' ? mySpending.byCategory : getSpendByCategory(sorted)
  const maxCategory = categories[0]?.amount ?? 1
  const selectedTrip = trips.find((trip) => trip.id === tripFilter) ?? null
  const sharedSelected = isSharedTrip(selectedTrip)
  const canAdd = selectedTrip
    ? canOnTrip(selectedTrip, currentUser.id, 'addExpense')
    : trips.some((trip) => canOnTrip(trip, currentUser.id, 'addExpense'))

  const tripPeople = selectedTrip ? peopleForTrip(selectedTrip, sorted, users) : []
  const tripRepayments = selectedTrip
    ? repayments.filter((item) => item.tripId === selectedTrip.id)
    : []
  const outstanding = selectedTrip
    ? getUserOutstanding(getOutstandingDebts(sorted, tripRepayments), currentUser.id)
    : null

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
            {spendView === 'mine' ? 'My spending' : 'All spending'}
          </h1>
        </div>
        {canAdd ? (
          <button type="button" className="text-sm text-accent" onClick={() => openCreate(selectedTrip?.id)}>
            Add expense
          </button>
        ) : null}
      </div>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        Original currencies are kept. Totals are shown in {HOME_CURRENCY}. Repayments settle balances and never add to
        trip spending.
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

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip selected={spendView === 'mine'} onClick={() => setSpendView('mine')}>
          My spending
        </FilterChip>
        <FilterChip selected={spendView === 'everyone'} onClick={() => setSpendView('everyone')}>
          Everyone
        </FilterChip>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label={spendView === 'mine' ? 'You paid' : 'Total spent'}
          value={formatMoney(spendView === 'mine' ? mySpending.total : summary.total)}
        />
        <SummaryCard label="Your share" value={formatMoney(summary.yourShare)} />
        <SummaryCard label="Your paid" value={formatMoney(mySpending.total)} />
        <SummaryCard
          label="Your outstanding"
          value={sharedSelected && outstanding ? formatMoney(outstanding.youOweTotal) : '—'}
        />
      </div>

      {sharedSelected ? (
        <div className="mt-10">
          <SettlementLedger
            trip={selectedTrip}
            expenses={sorted}
            repayments={tripRepayments}
            members={tripPeople}
            currentUserId={currentUser.id}
            currency={selectedTrip.currency}
            canPay={canAdd}
            onPay={setPayDraft}
            canDeleteRepayment={(item) => canDeleteRepayment(selectedTrip, currentUser.id, item)}
            onDeleteRepayment={(item) => {
              const removed = deleteRepayment(item.id)
              if (removed) {
                showToast({
                  message: 'Repayment removed',
                  actionLabel: 'Undo',
                  onAction: () => restoreRepayment(removed),
                })
              }
            }}
          />
        </div>
      ) : null}

      {categories.length ? (
        <section className="mt-12">
          <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">
            {spendView === 'mine' ? 'Your categories' : 'Category breakdown'}
          </h2>
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
                    shared={isSharedTrip(trip)}
                    repayments={repayments.filter((item) => item.tripId === expense.tripId)}
                    onClick={editable ? () => openEdit(expense.id) : undefined}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-6">
            <EmptyState
              title={trips.length ? 'No expenses in this view' : 'No expenses yet'}
              body={
                canAdd
                  ? 'Save an amount, who paid, and each person’s share. Nothing is split equally unless you type it that way.'
                  : 'Spending will appear here once someone adds it to a trip you are on.'
              }
              action={
                canAdd ? (
                  <button type="button" className="text-sm text-accent" onClick={() => openCreate(selectedTrip?.id)}>
                    Add expense
                  </button>
                ) : null
              }
            />
          </div>
        )}
      </section>

      {payDraft && selectedTrip ? (
        <PaySheet
          trip={selectedTrip}
          expenses={sorted}
          repayments={tripRepayments}
          members={tripPeople}
          currentUserId={currentUser.id}
          draft={payDraft}
          onClose={() => setPayDraft(null)}
          onConfirm={addRepayment}
        />
      ) : null}
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
