import { useState } from 'react'
import { Link } from 'react-router-dom'
import { displayName } from '../../data/mock.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { formatDateRange, formatQuietDate } from '../../lib/dates.js'
import { CATEGORY_LABEL } from '../../lib/expenses.js'
import { formatConvertedApprox, formatExpenseAmount, formatMoney } from '../../lib/format.js'
import { getTripInsightsSnapshot } from '../../lib/insights.js'
import { peopleForTrip } from '../../lib/people.js'
import { paymentMethodLabel } from '../../lib/repayments.js'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'

export function TripInsights({ trip, expenses, currentUserId, canAdd = false }) {
  const { repayments, users } = useAppData()
  const { openCreate } = useExpenseComposer()
  const [personView, setPersonView] = useState('paid')
  const currency = trip.currency
  const tripRepayments = repayments.filter((item) => item.tripId === trip.id)
  const view = getTripInsightsSnapshot({
    trip,
    expenses,
    repayments: tripRepayments,
    currentUserId,
  })
  const people = peopleForTrip(trip, view.expenses, users)
  const personMap = Object.fromEntries(people.map((member) => [member.userId, member.user]))

  return (
    <div className="min-w-0">
      <Link to={`/trips/${trip.id}`} className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5">
        <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
          {trip.city || trip.destination}
        </h2>
        <p className="mt-2 text-[14px] text-ink-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
        <p className="mt-4 max-w-[42ch] text-[15px] text-ink-muted">See where your trip budget is going.</p>
      </header>

      {view.empty ? (
        <div className="mt-12">
          <EmptyState
            title="No spending yet"
            body="Add your first expense to start tracking this trip."
            action={
              canAdd ? (
                <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={() => openCreate(trip.id)}>
                  Add expense
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="mt-10 space-y-14">
          <Overview trip={trip} view={view} currency={currency} />

          {view.shared ? (
            <PersonalShared view={view} currency={currency} />
          ) : (
            <PersonalSolo view={view} currency={currency} />
          )}

          <div className="grid gap-14 lg:grid-cols-2">
            <CategoryList categories={view.categories} currency={currency} />
            {view.shared ? (
              <PersonList
                people={view.people}
                personMap={personMap}
                currentUserId={currentUserId}
                personView={personView}
                onPersonView={setPersonView}
                currency={currency}
              />
            ) : null}
          </div>

          {view.shared ? (
            <div className="grid gap-14 lg:grid-cols-2">
              <SettlementSummary tripId={trip.id} view={view} currency={currency} />
              <RepaymentSummary
                summary={view.repayments}
                personMap={personMap}
                currentUserId={currentUserId}
                currency={currency}
              />
            </div>
          ) : null}

          <Timeline expenses={view.expenses} />
        </div>
      )}
    </div>
  )
}

function Overview({ trip, view, currency }) {
  const budget = view.budget

  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Trip spending</p>
      <div className="mt-5 grid gap-8 sm:grid-cols-3">
        <Stat label="Total trip spending" value={formatMoney(view.total, currency)} large />
        <Stat
          label="Budget"
          value={budget.hasBudget ? formatMoney(budget.budget, currency) : 'No budget set'}
          large={budget.hasBudget}
        />
        <Stat
          label={budget.over ? 'Over budget' : 'Remaining'}
          value={
            !budget.hasBudget
              ? '—'
              : budget.over
                ? formatMoney(budget.over, currency)
                : formatMoney(budget.remaining, currency)
          }
          large={budget.hasBudget}
        />
      </div>
      {budget.hasBudget ? (
        <div className="mt-8">
          <ProgressBar value={budget.ratio * 100} label="Budget progress" />
          <p className={`mt-3 text-[14px] ${budget.near || budget.over ? 'text-accent' : 'text-ink-muted'}`}>
            {budgetCopy(budget, trip.currency)}
          </p>
        </div>
      ) : null}
    </section>
  )
}

function budgetCopy(budget, currency) {
  if (budget.over) return `${formatMoney(budget.over, currency)} over budget`
  if (budget.near) return `${formatMoney(budget.remaining, currency)} remaining`
  return `${formatMoney(budget.remaining, currency)} remaining`
}

function PersonalShared({ view, currency }) {
  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Personal</p>
      <div className="mt-5 grid grid-cols-1 gap-8 sm:grid-cols-3">
        <Stat label="Your spending" value={formatMoney(view.yourPaid, currency)} large />
        <Stat label="Your share" value={formatMoney(view.yourShare, currency)} large />
        <Stat label="Outstanding" value={formatMoney(view.outstanding, currency)} large />
      </div>
      <p className="mt-4 text-[13px] text-ink-subtle">You paid {formatMoney(view.yourPaid, currency)} as the payer.</p>
    </section>
  )
}

function PersonalSolo({ view, currency }) {
  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Your spending</p>
      <p className="font-display mt-3 text-[36px] leading-none tracking-[-0.04em] tabular-nums text-ink">
        {formatMoney(view.yourPaid, currency)}
      </p>
    </section>
  )
}

function CategoryList({ categories, currency }) {
  const max = categories[0]?.amount ?? 1
  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">By category</p>
      <ul className="mt-5 space-y-4">
        {categories.map((item) => (
          <li key={item.category}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink">{CATEGORY_LABEL[item.category] ?? item.category}</span>
              <span className="text-sm tabular-nums text-ink-muted">{formatMoney(item.amount, currency)}</span>
            </div>
            <ProgressBar value={(item.amount / max) * 100} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function PersonList({ people, personMap, currentUserId, personView, onPersonView, currency }) {
  const rows = [...people].sort((a, b) => (personView === 'paid' ? b.paid - a.paid : b.share - a.share))
  const max = Math.max(...rows.map((row) => (personView === 'paid' ? row.paid : row.share)), 1)

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">By person</p>
        <div className="flex gap-2">
          <FilterChip selected={personView === 'paid'} onClick={() => onPersonView('paid')}>
            Paid
          </FilterChip>
          <FilterChip selected={personView === 'share'} onClick={() => onPersonView('share')}>
            Share
          </FilterChip>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-ink-subtle">
        {personView === 'paid' ? 'Money each person paid as the expense payer.' : 'Each person’s share of the expenses.'}
      </p>
      <ul className="mt-5 space-y-4">
        {rows.map((row) => {
          const amount = personView === 'paid' ? row.paid : row.share
          return (
            <li key={row.userId}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink">{displayName(personMap[row.userId], currentUserId)}</span>
                <span className="text-sm tabular-nums text-ink-muted">{formatMoney(amount, currency)}</span>
              </div>
              <ProgressBar value={(amount / max) * 100} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SettlementSummary({ tripId, view, currency }) {
  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Settlement</p>
      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Stat label="You owe" value={formatMoney(view.outstanding, currency)} />
        <Stat label="You are owed" value={formatMoney(view.youAreOwed, currency)} />
        <Stat label="Net balance" value={formatMoney(view.net, currency)} />
      </div>
      <Link
        to={`/trips/${tripId}?tab=expenses`}
        className="mt-5 inline-flex min-h-11 items-center text-sm text-accent hover:text-accent-hover"
      >
        View settlement
      </Link>
    </section>
  )
}

function RepaymentSummary({ summary, personMap, currentUserId, currency }) {
  const latest = summary.latest
  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Repayments</p>
      {summary.count ? (
        <>
          <p className="font-display mt-4 text-[36px] leading-none tracking-[-0.04em] tabular-nums text-ink">
            {formatMoney(summary.total, latest?.currency || currency)}
          </p>
          <p className="mt-2 text-[14px] text-ink-muted">
            {summary.count} {summary.count === 1 ? 'payment' : 'payments'}
          </p>
          {latest ? (
            <p className="mt-4 text-[14px] text-ink-muted">
              Latest: {displayName(personMap[latest.fromUserId], currentUserId)} →{' '}
              {displayName(personMap[latest.toUserId], currentUserId)}
              <span className="text-ink">
                {' '}
                · {formatMoney(latest.amount, latest.currency || currency)} · {paymentMethodLabel(latest.paymentMethod)}
              </span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">No repayments yet. Transfers never add to trip spending.</p>
      )}
    </section>
  )
}

function Timeline({ expenses }) {
  const days = groupExpensesByDate(expenses)
  return (
    <section>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Spending timeline</p>
      <ol className="mt-6 space-y-7">
        {days.map((day) => (
          <li key={day.date}>
            <p className="text-[13px] text-ink-subtle">{formatQuietDate(day.date)}</p>
            <ul className="mt-3 space-y-2">
              {day.items.map((expense) => {
                const approx = formatConvertedApprox(expense)
                return (
                  <li key={expense.id} className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">{expense.description || CATEGORY_LABEL[expense.category]}</span>
                    <span className="text-sm tabular-nums text-ink-muted">
                      {formatExpenseAmount(expense)}
                      {approx ? <span className="ml-2 text-[12px] text-ink-subtle">{approx}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

function groupExpensesByDate(expenses) {
  /** @type {Map<string, typeof expenses>} */
  const groups = new Map()
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  for (const expense of sorted) {
    const current = groups.get(expense.date) ?? []
    current.push(expense)
    groups.set(expense.date, current)
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }))
}

function Stat({ label, value, large = false }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">{label}</p>
      <p
        className={
          large
            ? 'font-display mt-3 text-[32px] leading-none tracking-[-0.04em] tabular-nums text-ink sm:text-[36px]'
            : 'mt-2 text-[15px] tabular-nums text-ink'
        }
      >
        {value}
      </p>
    </div>
  )
}

function FilterChip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-md px-3 text-[13px] transition-colors ${
        selected ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
      }`}
    >
      {children}
    </button>
  )
}
