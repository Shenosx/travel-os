import { StatGrid } from '../components/dashboard/StatGrid.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { ProgressBar } from '../components/ui/ProgressBar.jsx'
import { useExpenseComposer } from '../components/expenses/ExpenseComposer.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { formatQuietDate } from '../lib/dates.js'
import {
  CATEGORY_LABEL,
  getAverageSpendPerDay,
  getSpendByCategory,
  getSpendByDay,
  getSpendingSummary,
} from '../lib/expenses.js'
import { formatMoney } from '../lib/format.js'
import { getTravelStats, getTripSpending } from '../lib/trips.js'

export function InsightsPage() {
  const { trips, expenses, currentUser } = useAppData()
  const { openCreate } = useExpenseComposer()
  const stats = getTravelStats(trips, expenses)
  const summary = getSpendingSummary(expenses, currentUser.id)
  const perDay = getAverageSpendPerDay(expenses)
  const categories = getSpendByCategory(expenses)
  const maxCategory = categories[0]?.amount ?? 1
  const overTime = getSpendByDay(expenses)
  const maxDay = overTime.reduce((max, item) => Math.max(max, item.amount), 1)
  const recentDays = overTime.slice(-12)

  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Insights</p>
      <h1 className="font-display mt-2 text-[36px] leading-tight tracking-[-0.04em] sm:text-[44px]">
        Travel at a glance
      </h1>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        A quiet read of where the year is going — days, cities, and how the budget is moving.
      </p>

      <div className="mt-10">
        <StatGrid stats={stats} formatMoney={formatMoney} />
      </div>

      {!expenses.length ? (
        <div className="mt-12">
          <EmptyState
            title="No spending to read yet"
            body="Totals, shares, and the days they landed on will appear once an expense is saved."
            action={
              <button type="button" className="text-sm text-accent" onClick={() => openCreate()}>
                Add expense
              </button>
            }
          />
        </div>
      ) : (
        <>
          <section className="mt-12">
            <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Spending</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <InsightStat label="Total spending" value={formatMoney(summary.total)} />
              <InsightStat label="Spending per day" value={formatMoney(perDay)} />
              <InsightStat label="Shared spending" value={formatMoney(summary.shared)} />
              <InsightStat label="Personal share" value={formatMoney(summary.yourShare)} />
            </div>
          </section>

          {categories.length ? (
            <section className="mt-12">
              <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Spend by category</h2>
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

          {recentDays.length ? (
            <section className="mt-12">
              <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Spending over time</h2>
              <ul className="mt-5 space-y-4">
                {recentDays.map((item) => (
                  <li key={item.date}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink">{formatQuietDate(item.date)}</span>
                      <span className="text-sm tabular-nums text-ink-muted">{formatMoney(item.amount)}</span>
                    </div>
                    <ProgressBar value={(item.amount / maxDay) * 100} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {trips.length ? (
            <section className="mt-12">
              <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">By trip</h2>
              <ul className="mt-5 divide-y divide-line border-y border-line">
                {trips.map((trip) => (
                  <li key={trip.id} className="flex min-w-0 items-baseline justify-between gap-4 py-4">
                    <span className="min-w-0 truncate text-sm text-ink">{trip.destination}</span>
                    <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                      {formatMoney(getTripSpending(expenses, trip.id), trip.currency)} /{' '}
                      {formatMoney(trip.budgetAmount, trip.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function InsightStat({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-4">
      <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 text-sm tabular-nums text-ink">{value}</p>
    </div>
  )
}
