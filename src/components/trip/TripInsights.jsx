import { formatQuietDate } from '../../lib/dates.js'
import {
  CATEGORY_LABEL,
  getAverageSpendPerDay,
  getSpendByCategory,
  getSpendByDay,
  getSpendingSummary,
} from '../../lib/expenses.js'
import { formatMoney } from '../../lib/format.js'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'
import { SectionHeading } from '../dashboard/SectionHeading.jsx'

export function TripInsights({ trip, expenses, currentUserId, canAdd = false }) {
  const { openCreate } = useExpenseComposer()
  const summary = getSpendingSummary(expenses, currentUserId)
  const perDay = getAverageSpendPerDay(expenses)
  const categories = getSpendByCategory(expenses, trip.id)
  const maxCategory = categories[0]?.amount ?? 1
  const overTime = getSpendByDay(expenses)
  const maxDay = overTime.reduce((max, item) => Math.max(max, item.amount), 1)

  if (!expenses.length) {
    return (
      <EmptyState
        title="No spending to read yet"
        body="Totals, categories, and the days they landed on will appear once an expense is saved."
        action={
          canAdd ? (
            <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip.id)}>
              Add expense
            </button>
          ) : null
        }
      />
    )
  }

  return (
    <div>
      <section>
        <SectionHeading kicker="Spending" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          <InsightStat label="Total" value={formatMoney(summary.total, trip.currency)} />
          <InsightStat label="Per day" value={formatMoney(perDay, trip.currency)} />
          <InsightStat label="Shared" value={formatMoney(summary.shared, trip.currency)} />
          <InsightStat label="Your share" value={formatMoney(summary.yourShare, trip.currency)} />
        </div>
        {trip.budgetAmount ? (
          <p className="mt-6 text-[14px] text-ink-muted">
            Budget {formatMoney(trip.budgetAmount, trip.currency)}
            <span className="text-ink-subtle">
              {' '}
              · {formatMoney(Math.max(trip.budgetAmount - summary.total, 0), trip.currency)} remaining
            </span>
          </p>
        ) : null}
      </section>

      {categories.length ? (
        <section className="mt-14">
          <SectionHeading kicker="By category" />
          <ul className="space-y-4">
            {categories.map((item) => (
              <li key={item.category}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {formatMoney(item.amount, trip.currency)}
                  </span>
                </div>
                <ProgressBar value={(item.amount / maxCategory) * 100} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overTime.length ? (
        <section className="mt-14">
          <SectionHeading kicker="Over time" />
          <ul className="space-y-4">
            {overTime.map((item) => (
              <li key={item.date}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{formatQuietDate(item.date)}</span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {formatMoney(item.amount, trip.currency)}
                  </span>
                </div>
                <ProgressBar value={(item.amount / maxDay) * 100} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function InsightStat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 text-[15px] tabular-nums text-ink">{value}</p>
    </div>
  )
}
