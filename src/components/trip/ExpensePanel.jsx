import { useMemo, useState } from 'react'
import { formatMoney } from '../../lib/format.js'
import { CATEGORY_LABEL, getSpendByCategory, getSpendingSummary } from '../../lib/expenses.js'
import { canDeleteRepayment } from '../../lib/permissions.js'
import { getMySpending, getOutstandingDebts, getUserOutstanding, isSharedTrip } from '../../lib/repayments.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { ExpenseRow } from '../expenses/ExpenseRow.jsx'
import { PaySheet } from '../expenses/PaySheet.jsx'
import { SettlementLedger } from '../expenses/SettlementLedger.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'
import { useToast } from '../ui/Toast.jsx'

export function ExpensePanel({
  trip,
  expenses,
  members,
  currency,
  currentUserId,
  canAdd = true,
  canEditExpense = () => true,
}) {
  const { repayments, addRepayment, deleteRepayment, restoreRepayment } = useAppData()
  const { openCreate, openEdit } = useExpenseComposer()
  const showToast = useToast()
  const shared = isSharedTrip(trip)
  const [spendView, setSpendView] = useState('everyone')
  const [payDraft, setPayDraft] = useState(null)

  const tripRepayments = useMemo(
    () => repayments.filter((item) => item.tripId === trip.id),
    [repayments, trip.id],
  )
  const summary = getSpendingSummary(expenses, currentUserId)
  const mySpending = getMySpending(expenses, currentUserId)
  const outstanding = getUserOutstanding(getOutstandingDebts(expenses, tripRepayments), currentUserId)
  const categories = spendView === 'mine' ? mySpending.byCategory : getSpendByCategory(expenses)
  const maxCategory = categories[0]?.amount ?? 1

  if (!expenses.length) {
    return (
      <EmptyState
        title="No expenses yet"
        body="Add one with an amount, a payer, and each person’s share. Shares are exact amounts, not an equal split."
        action={
          canAdd ? (
            <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip?.id)}>
              Add expense
            </button>
          ) : null
        }
      />
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Trip spending</p>
          <p className="font-display mt-2 text-[32px] tracking-[-0.04em] tabular-nums">
            {formatMoney(spendView === 'mine' ? mySpending.total : summary.total, currency)}
          </p>
        </div>
        {canAdd ? (
          <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip?.id)}>
            Add expense
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip selected={spendView === 'mine'} onClick={() => setSpendView('mine')}>
          My spending
        </FilterChip>
        <FilterChip selected={spendView === 'everyone'} onClick={() => setSpendView('everyone')}>
          Everyone
        </FilterChip>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${shared ? 'lg:grid-cols-3' : ''}`}>
        <Stat label="Your paid" value={formatMoney(mySpending.total, currency)} />
        {shared ? <Stat label="Your share" value={formatMoney(summary.yourShare, currency)} /> : null}
        {shared ? <Stat label="Your outstanding" value={formatMoney(outstanding.youOweTotal, currency)} /> : null}
      </div>

      {categories.length ? (
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">
            {spendView === 'mine' ? 'Your categories' : 'Category breakdown'}
          </p>
          <ul className="mt-4 space-y-4">
            {categories.map((item) => (
              <li key={item.category}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{CATEGORY_LABEL[item.category]}</span>
                  <span className="text-sm tabular-nums text-ink-muted">{formatMoney(item.amount, currency)}</span>
                </div>
                <ProgressBar value={(item.amount / maxCategory) * 100} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shared ? (
        <SettlementLedger
          trip={trip}
          expenses={expenses}
          repayments={tripRepayments}
          members={members}
          currentUserId={currentUserId}
          currency={currency}
          canPay={canAdd}
          onPay={setPayDraft}
          canDeleteRepayment={(item) => canDeleteRepayment(trip, currentUserId, item)}
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
      ) : null}

      <div>
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Recent expenses</p>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {expenses.map((expense) => {
            const editable = canEditExpense(expense)
            return (
              <li key={expense.id}>
                <ExpenseRow
                  expense={expense}
                  members={members}
                  currentUserId={currentUserId}
                  shared={shared}
                  repayments={tripRepayments}
                  onClick={editable ? () => openEdit(expense.id) : undefined}
                />
              </li>
            )
          })}
        </ul>
      </div>

      {payDraft ? (
        <PaySheet
          trip={trip}
          expenses={expenses}
          repayments={tripRepayments}
          members={members}
          currentUserId={currentUserId}
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

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-4">
      <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 text-sm tabular-nums text-ink">{value}</p>
    </div>
  )
}
