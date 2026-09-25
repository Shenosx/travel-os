import { formatMoney, spendingPercent } from '../../lib/format.js'
import { ProgressBar } from '../ui/ProgressBar.jsx'
import { SectionHeading } from './SectionHeading.jsx'

export function HomeSpending({ spent, budget, currency, emptyAction }) {
  const hasBudget = budget > 0
  const remaining = budget - spent
  const percent = spendingPercent(spent, budget)

  return (
    <section>
      <SectionHeading kicker="Spending" />
      {!hasBudget && spent <= 0 ? (
        <div className="border border-line px-5 py-8 text-center">
          <p className="text-sm text-ink-muted">No spending on file yet</p>
          <p className="mt-1 text-[13px] text-ink-subtle">Totals appear once a trip has a budget or an expense.</p>
          {emptyAction ? <div className="mt-4">{emptyAction}</div> : null}
        </div>
      ) : (
        <div className="border border-line px-5 py-6 sm:px-6">
          <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Spent</p>
          <p className="font-display mt-2 text-[32px] leading-none tracking-[-0.04em] text-ink">
            {formatMoney(spent, currency)}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Budget</p>
              <p className="mt-1.5 text-[15px] text-ink">{hasBudget ? formatMoney(budget, currency) : '—'}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Remaining</p>
              <p className="mt-1.5 text-[15px] text-ink">
                {hasBudget
                  ? remaining >= 0
                    ? formatMoney(remaining, currency)
                    : `−${formatMoney(Math.abs(remaining), currency)}`
                  : '—'}
              </p>
            </div>
          </div>
          {hasBudget ? (
            <>
              <ProgressBar value={percent} label="Budget used" className="mt-6" />
              <p className="mt-2 text-[12px] text-ink-subtle">
                {remaining >= 0 ? `${percent}% used` : 'Over budget'}
              </p>
            </>
          ) : (
            <p className="mt-6 text-[12px] text-ink-subtle">No budget set for this trip.</p>
          )}
        </div>
      )}
    </section>
  )
}
