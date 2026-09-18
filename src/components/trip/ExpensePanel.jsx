import { displayName } from '../../data/mock.js'
import { formatMoney } from '../../lib/format.js'
import { getBalances, getExpenseActorIds, getSettlements, getSpendingSummary, getUserSettlement } from '../../lib/expenses.js'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { ExpenseRow } from '../expenses/ExpenseRow.jsx'
import { SettlementPanel } from '../expenses/SettlementPanel.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Card } from '../ui/Card.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'

export function ExpensePanel({
  trip,
  expenses,
  members,
  currency,
  currentUserId,
  canAdd = true,
  canEditExpense = () => true,
}) {
  const { openCreate, openEdit } = useExpenseComposer()
  const actorIds = getExpenseActorIds(expenses, members.filter((member) => !member.former).map((member) => member.userId))
  const balances = getBalances(expenses, actorIds)
  const transfers = getSettlements(balances)
  const userSettlement = getUserSettlement(transfers, currentUserId)
  const summary = getSpendingSummary(expenses, currentUserId)
  const balancePeople = actorIds.map((userId) => members.find((member) => member.userId === userId)).filter(Boolean)

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
            {formatMoney(summary.total, currency)}
          </p>
        </div>
        {canAdd ? (
          <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip?.id)}>
            Add expense
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Your share" value={formatMoney(summary.yourShare, currency)} />
        <Stat label="Shared" value={formatMoney(summary.shared, currency)} />
        <Stat label="Personal" value={formatMoney(summary.personal, currency)} />
        <Stat label="Shared items" value={String(summary.sharedCount)} />
      </div>

      <SettlementPanel
        transfers={transfers}
        userSettlement={userSettlement}
        members={members}
        currentUserId={currentUserId}
        currency={currency}
      />

      <Card className="p-5 sm:p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Balances</p>
        <ul className="mt-4 divide-y divide-line">
          {balancePeople.map((member) => {
            const row = balances[member.userId]
            const net = row?.net ?? 0
            return (
              <li key={member.userId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Avatar initials={member.user.initials} size="sm" emphasis={member.role === 'owner'} />
                  <div>
                    <span className="text-sm text-ink">{displayName(member.user, currentUserId)}</span>
                    {member.former ? (
                      <span className="ml-2 text-[12px] text-ink-subtle">Left the trip</span>
                    ) : null}
                  </div>
                </div>
                <span className={`text-sm tabular-nums ${net >= 0 ? 'text-ink' : 'text-accent'}`}>
                  {netCopy(member.userId === currentUserId, net, currency)}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>

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
                  onClick={editable ? () => openEdit(expense.id) : undefined}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function netCopy(isYou, net, currency) {
  const amount = formatMoney(Math.abs(net), currency)
  if (net >= 0) return isYou ? `are owed ${amount}` : `is owed ${amount}`
  return isYou ? `owe ${amount}` : `owes ${amount}`
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-4">
      <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 text-sm tabular-nums text-ink">{value}</p>
    </div>
  )
}
