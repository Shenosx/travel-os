import { useState } from 'react'
import { getSpendingSummary, getUserSettlement } from '../../lib/expenses.js'
import { formatMoney } from '../../lib/format.js'
import { useCloudTripBookings } from '../../hooks/useCloudTripBookings.js'
import { useCloudTripExpenses } from '../../hooks/useCloudTripExpenses.js'
import { ExpenseRow } from '../expenses/ExpenseRow.jsx'
import { SettlementPanel } from '../expenses/SettlementPanel.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Button } from '../ui/Button.jsx'
import { Card } from '../ui/Card.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudExpenseForm } from './CloudExpenseForm.jsx'

export function CloudExpenseSheet({ trip, currentUserId, onClose }) {
  const cloud = useCloudTripExpenses(trip)
  const cloudBookings = useCloudTripBookings(trip)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const summary = getSpendingSummary(cloud.expenses, currentUserId)
  const userSettlement = getUserSettlement(cloud.settlement.transfers, currentUserId)

  async function handleSubmit(input) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.save(input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
  }

  async function handleDelete() {
    if (!draft?.expense?.id) return
    setBusy(true)
    setFormError(null)
    const result = await cloud.remove(draft.expense.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
  }

  return (
    <>
      <Sheet kicker="Cloud" title="Expenses" onClose={onClose} wide>
        <div className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trip spending</p>
              <p className="font-display mt-2 text-[32px] tracking-[-0.04em] tabular-nums">
                {formatMoney(summary.total, trip.currency)}
              </p>
              <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
            </div>
            {cloud.canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null)
                  setDirty(false)
                  setDraft({ type: 'create' })
                }}
              >
                Add expense
              </Button>
            ) : null}
          </div>

          {cloud.loading ? <p className="text-sm text-ink-muted">Loading expenses…</p> : null}
          {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
          <CloudLiveStatus error={cloud.liveError} />

          {!cloud.loading && !cloud.expenses.length ? (
            <p className="text-sm text-ink-muted">
              Add one with an amount, a payer, and each person’s share. Shares are exact amounts, not an equal split.
            </p>
          ) : null}

          {cloud.expenses.length ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Your share" value={formatMoney(summary.yourShare, trip.currency)} />
                <Stat label="Shared items" value={String(summary.sharedCount)} />
              </div>

              <SettlementPanel
                transfers={cloud.settlement.transfers}
                userSettlement={userSettlement}
                members={cloud.people}
                currentUserId={currentUserId}
                currency={trip.currency}
              />

              <Card className="p-5">
                <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Balances</p>
                <ul className="mt-4 divide-y divide-line">
                  {cloud.people.map((person) => {
                    const net = cloud.settlement.balances[person.userId]?.net ?? 0
                    return (
                      <li key={person.userId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <Avatar initials={person.initials || '?'} size="sm" emphasis={person.role === 'owner'} />
                          <div>
                            <span className="text-sm text-ink">
                              {person.userId === currentUserId ? 'You' : person.shortName || person.name}
                            </span>
                            {person.former ? (
                              <span className="ml-2 text-[12px] text-ink-subtle">Left the trip</span>
                            ) : null}
                          </div>
                        </div>
                        <span className={`text-sm tabular-nums ${net >= 0 ? 'text-ink' : 'text-accent'}`}>
                          {netCopy(person.userId === currentUserId, net, trip.currency)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Card>

              <div>
                <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Recent expenses</p>
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {cloud.expenses.map((expense) => {
                    const editable = cloud.canMutateExpense(expense)
                    return (
                      <li key={expense.id}>
                        <ExpenseRow
                          expense={expense}
                          members={cloud.people}
                          currentUserId={currentUserId}
                          onClick={
                            editable
                              ? () => {
                                  setFormError(null)
                                  setDirty(false)
                                  setDraft({ type: 'edit', expense })
                                }
                              : undefined
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      </Sheet>

      {draft ? (
        <Sheet
          kicker="Cloud"
          title={draft.expense ? 'Edit expense' : 'Add expense'}
          onClose={() => {
            if (busy) return
            setDraft(null)
            setFormError(null)
            setDirty(false)
          }}
          dirty={dirty}
        >
          <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <CloudExpenseForm
              trip={trip}
              people={cloud.people}
              currentUserId={currentUserId}
              expense={draft.expense}
              bookings={cloudBookings.bookings}
              error={formError}
              busy={busy}
              onSubmit={handleSubmit}
              onDelete={draft.expense && cloud.canMutateExpense(draft.expense) ? handleDelete : undefined}
              onCancel={() => {
                if (busy) return
                setDraft(null)
                setFormError(null)
                setDirty(false)
              }}
            />
          </div>
        </Sheet>
      ) : null}
    </>
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
