import { StatGrid } from '../components/dashboard/StatGrid.jsx'
import { ProgressBar } from '../components/ui/ProgressBar.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { CATEGORY_LABEL, getSpendByCategory } from '../lib/expenses.js'
import { formatMoney } from '../lib/format.js'
import { getTravelStats, getTripSpending } from '../lib/trips.js'

export function InsightsPage() {
  const { trips, expenses } = useAppData()
  const stats = getTravelStats(trips, expenses)
  const categories = getSpendByCategory(expenses)
  const max = categories[0]?.amount ?? 1

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

      <section className="mt-12">
        <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Spend by category</h2>
        <ul className="mt-5 space-y-4">
          {categories.map((item) => (
            <li key={item.category}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink">{CATEGORY_LABEL[item.category]}</span>
                <span className="text-sm tabular-nums text-ink-muted">{formatMoney(item.amount)}</span>
              </div>
              <ProgressBar value={(item.amount / max) * 100} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">By trip</h2>
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {trips.map((trip) => (
            <li key={trip.id} className="flex items-baseline justify-between gap-4 py-4">
              <span className="text-sm text-ink">{trip.destination}</span>
              <span className="text-sm tabular-nums text-ink-muted">
                {formatMoney(getTripSpending(expenses, trip.id), trip.currency)} /{' '}
                {formatMoney(trip.budgetAmount, trip.currency)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
