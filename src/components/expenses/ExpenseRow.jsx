import { displayName } from '../../data/mock.js'
import { formatConvertedApprox, formatExpenseAmount, formatMoney } from '../../lib/format.js'
import { CATEGORY_LABEL } from '../../lib/expenses.js'
import { formatLongDate } from '../../lib/dates.js'
import { getConvertedShareAmount } from '../../lib/currency.js'

export function ExpenseRow({ expense, members, currentUserId, onClick }) {
  const payer = members.find((member) => member.userId === expense.payerId)?.user
  const approx = formatConvertedApprox(expense)
  const yourShare = getConvertedShareAmount(expense, currentUserId)
  const home = expense.convertedCurrency ?? 'MYR'

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[16px] font-medium tracking-[-0.02em] text-ink">{expense.description}</p>
          <p className="mt-1 text-[13px] text-ink-subtle">
            {formatLongDate(expense.date)} · {CATEGORY_LABEL[expense.category]} · Paid by{' '}
            {displayName(payer, currentUserId)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm tabular-nums text-ink">{formatExpenseAmount(expense)}</p>
          {approx ? <p className="mt-0.5 text-[12px] text-ink-subtle">{approx}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {expense.shares.map((share) => (
            <li key={share.userId} className="text-[13px] text-ink-muted">
              {displayName(members.find((member) => member.userId === share.userId)?.user, currentUserId)}
              <span className="text-ink-subtle"> · {formatMoney(share.amount, expense.currency)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-subtle">
          Your share {formatMoney(yourShare, home)}
        </p>
      </div>
    </>
  )

  if (!onClick) return <div className="py-5">{content}</div>

  return (
    <button type="button" onClick={onClick} className="block w-full py-5 text-left">
      {content}
    </button>
  )
}
