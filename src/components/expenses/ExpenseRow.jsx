import { displayName } from '../../data/mock.js'
import { formatConvertedApprox, formatExpenseAmount, formatMoney } from '../../lib/format.js'
import { CATEGORY_LABEL } from '../../lib/expenses.js'
import { formatLongDate } from '../../lib/dates.js'
import { getConvertedShareAmount } from '../../lib/currency.js'
import { getExpenseRepayments, paymentMethodLabel } from '../../lib/repayments.js'

export function ExpenseRow({
  expense,
  members,
  currentUserId,
  onClick,
  shared = true,
  repayments = [],
}) {
  const payer = members.find((member) => member.userId === expense.payerId)?.user
  const approx = formatConvertedApprox(expense)
  const yourShare = getConvertedShareAmount(expense, currentUserId)
  const home = expense.convertedCurrency ?? 'MYR'
  const latest = getExpenseRepayments(repayments, expense.id, currentUserId)[0]

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="break-words text-[16px] font-medium tracking-[-0.02em] text-ink">{expense.description}</p>
          <p className="mt-1 text-[13px] text-ink-subtle">
            {formatLongDate(expense.date)} · {CATEGORY_LABEL[expense.category]}
            {shared ? ` · Paid by ${displayName(payer, currentUserId)}` : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm tabular-nums text-ink">{formatExpenseAmount(expense)}</p>
          {approx ? <p className="mt-0.5 text-[12px] text-ink-subtle">{approx}</p> : null}
        </div>
      </div>
      {shared ? (
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[13px] text-ink-muted">
            Your share
            <span className="ml-1.5 tabular-nums text-ink">{formatMoney(yourShare, home)}</span>
          </p>
          {latest ? (
            <p className="text-[12px] text-ink-subtle">
              {formatMoney(latest.amount, latest.currency || home)} repaid · {paymentMethodLabel(latest.paymentMethod)}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )

  if (!onClick) return <div className="py-5">{content}</div>

  return (
    <button type="button" onClick={onClick} className="block w-full py-5 text-left">
      {content}
    </button>
  )
}
