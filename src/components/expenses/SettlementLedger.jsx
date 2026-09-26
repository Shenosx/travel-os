import { displayName } from '../../data/mock.js'
import { formatLongDate } from '../../lib/dates.js'
import { formatMoney } from '../../lib/format.js'
import { CATEGORY_LABEL } from '../../lib/expenses.js'
import {
  getOutstandingDebts,
  getUserOutstanding,
  isSharedTrip,
  paymentMethodLabel,
} from '../../lib/repayments.js'
import { Avatar } from '../ui/Avatar.jsx'
import { Card } from '../ui/Card.jsx'

export function SettlementLedger({
  trip,
  expenses,
  repayments = [],
  members,
  currentUserId,
  currency,
  canPay = false,
  onPay,
  onDeleteRepayment,
  canDeleteRepayment = () => false,
}) {
  if (!isSharedTrip(trip)) return null

  const debts = getOutstandingDebts(expenses, repayments)
  const view = getUserOutstanding(debts, currentUserId)
  const memberMap = Object.fromEntries(members.map((member) => [member.userId, member.user]))
  const history = [...repayments].sort(
    (a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')) || String(b.id).localeCompare(String(a.id)),
  )

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Settlement</p>
        <p className="mt-2 text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Your net balance</p>
        <p className="font-display mt-2 text-[34px] tracking-[-0.04em] tabular-nums text-ink">
          {formatMoney(view.net, currency)}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">You owe</p>
          {view.youOwe.length ? (
            <ul className="mt-5 space-y-6">
              {view.youOwe.map((group) => (
                <li key={group.userId}>
                  <p className="text-[15px] text-ink">{displayName(memberMap[group.userId], currentUserId)}</p>
                  <ul className="mt-3 space-y-3">
                    {group.items.map((item) => (
                      <li
                        key={`${item.expenseId}-${item.toId}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <p className="text-sm text-ink">
                            {item.description || CATEGORY_LABEL[item.category] || 'Expense'}
                          </p>
                          <p className="mt-0.5 text-[13px] tabular-nums text-ink-muted">
                            {formatMoney(item.outstanding, currency)} outstanding
                          </p>
                        </div>
                        {canPay && onPay ? (
                          <button
                            type="button"
                            className="text-[13px] text-accent hover:text-accent-hover"
                            onClick={() =>
                              onPay({
                                toUserId: item.toId,
                                expenseId: item.expenseId,
                                amount: item.outstanding,
                                label: item.description || CATEGORY_LABEL[item.category] || 'Expense',
                              })
                            }
                          >
                            Pay {item.description || CATEGORY_LABEL[item.category] || 'this'}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">Nothing to pay.</p>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">You are owed</p>
          {view.youAreOwed.length ? (
            <ul className="mt-5 space-y-6">
              {view.youAreOwed.map((group) => (
                <li key={group.userId}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[15px] text-ink">
                      <Avatar initials={memberMap[group.userId]?.initials} size="sm" />
                      {displayName(memberMap[group.userId], currentUserId)}
                    </span>
                    <span className="font-display text-[22px] tracking-[-0.03em] tabular-nums">
                      {formatMoney(group.total, currency)}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <li key={`${item.expenseId}-${item.fromId}`} className="flex justify-between gap-3 text-sm">
                        <span className="text-ink-muted">
                          {item.description || CATEGORY_LABEL[item.category] || 'Expense'}
                        </span>
                        <span className="tabular-nums text-ink">{formatMoney(item.outstanding, currency)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">No one owes you.</p>
          )}
        </Card>
      </div>

      {history.length ? (
        <Card className="p-5 sm:p-6">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Repayment history</p>
          <ul className="mt-4 divide-y divide-line">
            {history.map((item) => {
              const expense = expenses.find((entry) => entry.id === item.expenseId)
              const removable = canDeleteRepayment(item)
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-display text-[26px] tracking-[-0.03em] tabular-nums text-ink">
                      {formatMoney(item.amount, item.currency || currency)}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {displayName(memberMap[item.fromUserId], currentUserId)} →{' '}
                      {displayName(memberMap[item.toUserId], currentUserId)}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {expense?.description || 'Trip'}
                      {' · '}
                      {paymentMethodLabel(item.paymentMethod)}
                      {' · '}
                      {item.paidAt ? formatLongDate(item.paidAt) : ''}
                    </p>
                    {item.note ? <p className="mt-1 text-[13px] text-ink-subtle">{item.note}</p> : null}
                  </div>
                  {removable && onDeleteRepayment ? (
                    <button
                      type="button"
                      className="text-[13px] text-ink-subtle hover:text-ink"
                      onClick={() => onDeleteRepayment(item)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
