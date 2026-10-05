import { useMemo, useState } from 'react'
import { getSpendingSummary } from '../../lib/expenses.js'
import { isPayDraft, payDraftFromDebt } from '../../lib/repayments.js'
import { formatMoney } from '../../lib/format.js'
import { ExpenseRow } from '../expenses/ExpenseRow.jsx'
import { PaySheet } from '../expenses/PaySheet.jsx'
import { SettlementLedger } from '../expenses/SettlementLedger.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Button } from '../ui/Button.jsx'
import { Card } from '../ui/Card.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudExpenseForm } from './CloudExpenseForm.jsx'

export function CloudExpenseView({
  trip,
  currentUserId,
  expenses = [],
  people = [],
  settlement,
  loading = false,
  error = null,
  liveError = null,
  canCreate = false,
  canMutateExpense = () => false,
  repayments = [],
  bookings = [],
  onAddRepayment,
  onDeleteRepayment,
  onSaveExpense,
  onDeleteExpense,
  onClose,
}) {
  const [draft, setDraft] = useState(null)
  const [payDraft, setPayDraft] = useState(null)
  const [payDebug, setPayDebug] = useState({
    event: '',
    requestPay: false,
    item: null,
    fromDebt: null,
    isPayDraft: false,
    setPayDraftCalled: false,
  })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const summary = getSpendingSummary(expenses, currentUserId)
  const tripRepayments = useMemo(
    () => repayments.filter((item) => item.tripId === trip.id),
    [repayments, trip.id],
  )
  const actorIds = people.map((person) => person.userId)

  async function handleSubmit(input) {
    setBusy(true)
    setFormError(null)
    const result = await onSaveExpense?.(input)
    setBusy(false)
    if (result?.error) {
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
    const result = await onDeleteExpense?.(draft.expense.id)
    setBusy(false)
    if (result?.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
  }

  function openPayDraft(next) {
    const draft = payDraftFromDebt(next)
    const accepted = isPayDraft(draft)
    setPayDebug((current) => ({
      ...current,
      fromDebt: draft,
      isPayDraft: accepted,
      setPayDraftCalled: accepted,
    }))
    if (!accepted) return
    setPayDraft(draft)
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
            {canCreate ? (
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

          {loading ? <p className="text-sm text-ink-muted">Loading expenses…</p> : null}
          {error ? <p className="text-sm text-ink-muted">{error}</p> : null}
          <CloudLiveStatus error={liveError} />

          {!loading && !expenses.length ? (
            <p className="text-sm text-ink-muted">
              Add one with an amount, a payer, and each person’s share. Shares are exact amounts, not an equal split.
            </p>
          ) : null}

          {expenses.length ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Your share" value={formatMoney(summary.yourShare, trip.currency)} />
                <Stat label="Shared items" value={String(summary.sharedCount)} />
              </div>

              <div
                data-pay-debug-panel=""
                style={{ background: '#ffe14a', color: '#111', fontWeight: 700, fontSize: 13, padding: 12 }}
              >
                <p>PAY DEBUG</p>
                <p>last event: {payDebug.event || 'none'}</p>
                <p>requestPay called: {payDebug.requestPay ? 'YES' : 'NO'}</p>
                <p>item: {payDebug.item ? JSON.stringify(payDebug.item) : 'null'}</p>
                <p>payDraftFromDebt(item): {payDebug.fromDebt ? JSON.stringify(payDebug.fromDebt) : 'null'}</p>
                <p>isPayDraft(payDraftFromDebt(item)): {String(Boolean(payDebug.isPayDraft))}</p>
                <p>setPayDraft called: {payDebug.setPayDraftCalled ? 'YES' : 'NO'}</p>
                <p>payDraft state: {payDraft ? JSON.stringify(payDraft) : 'null'}</p>
                <p>PaySheet mounted: {isPayDraft(payDraft) ? 'YES' : 'NO'}</p>
              </div>
              <SettlementLedger
                trip={trip}
                expenses={expenses}
                repayments={tripRepayments}
                members={people}
                currentUserId={currentUserId}
                currency={trip.currency}
                canPay={canCreate}
                debugPay
                onPayDebug={(info) => setPayDebug((current) => ({ ...current, ...info }))}
                onPay={openPayDraft}
                canDeleteRepayment={(item) => item.createdBy === currentUserId || item.fromUserId === currentUserId}
                onDeleteRepayment={(item) => {
                  onDeleteRepayment?.(item.id)
                }}
              />

              <Card className="p-5">
                <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Balances</p>
                <ul className="mt-4 divide-y divide-line">
                  {people.map((person) => {
                    const net = settlement?.balances?.[person.userId]?.net ?? 0
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
                  {expenses.map((expense) => {
                    const editable = canMutateExpense(expense)
                    return (
                      <li key={expense.id}>
                        <ExpenseRow
                          expense={expense}
                          members={people}
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

      {isPayDraft(payDraft) ? (
        <PaySheet
          trip={trip}
          expenses={expenses}
          repayments={tripRepayments}
          members={people}
          currentUserId={currentUserId}
          draft={payDraft}
          onClose={() => setPayDraft(null)}
          onConfirm={(input) =>
            onAddRepayment?.(input, {
              expenses,
              memberIds: actorIds,
              repayments: tripRepayments,
            })
          }
        />
      ) : null}

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
              people={people}
              currentUserId={currentUserId}
              expense={draft.expense}
              bookings={bookings}
              error={formError}
              busy={busy}
              onSubmit={handleSubmit}
              onDelete={draft.expense && canMutateExpense(draft.expense) ? handleDelete : undefined}
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
