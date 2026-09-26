import { useMemo, useState } from 'react'
import { displayName } from '../../data/mock.js'
import { todayIso } from '../../lib/dates.js'
import { formatMoney } from '../../lib/format.js'
import { PAYMENT_METHODS, validateRepayment } from '../../lib/repayments.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { Sheet, SheetCancel } from '../ui/Sheet.jsx'

export function PaySheet({
  trip,
  expenses,
  repayments,
  members,
  currentUserId,
  draft,
  onClose,
  onConfirm,
}) {
  const recipient = members.find((member) => member.userId === draft.toUserId)?.user
  const [amount, setAmount] = useState(String(draft.amount))
  const [paymentMethod, setPaymentMethod] = useState('maybank')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const dirty = useMemo(
    () => amount !== String(draft.amount) || paymentMethod !== 'maybank' || note !== '' || paidAt !== todayIso(),
    [amount, draft.amount, note, paidAt, paymentMethod],
  )

  function submit(event) {
    event.preventDefault()
    const input = {
      tripId: trip.id,
      fromUserId: currentUserId,
      toUserId: draft.toUserId,
      amount: Number(amount),
      currency: trip.currency,
      paymentMethod,
      paidAt,
      note,
      expenseId: draft.expenseId,
    }
    const check = validateRepayment(
      input,
      expenses,
      repayments,
      trip.members.map((member) => member.userId),
    )
    if (!check.ok) {
      setError(check.error)
      return
    }
    const saved = onConfirm(input)
    if (!saved) {
      setError('Could not record that payment.')
      return
    }
    onClose()
  }

  return (
    <Sheet
      kicker="Repayment"
      title="Confirm payment"
      onClose={onClose}
      dirty={dirty}
      footer={
        <div className="flex justify-end gap-3">
          <SheetCancel onClose={onClose} />
          <Button type="submit" form="pay-sheet-form">
            Confirm payment
          </Button>
        </div>
      }
    >
      <form id="pay-sheet-form" onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">To</p>
          <p className="mt-1.5 text-[15px] text-ink">{displayName(recipient, currentUserId)}</p>
        </div>
        <Field label="Amount">
          <input
            className={fieldClass}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </Field>
        <p className="text-[13px] text-ink-muted">Outstanding {formatMoney(draft.amount, trip.currency)}</p>
        <div>
          <p className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">For</p>
          <p className="mt-1.5 text-[15px] text-ink">{draft.label}</p>
        </div>
        <Field label="Payment method">
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setPaymentMethod(method.id)}
                className={`rounded-md px-3 py-1.5 text-[13px] ${
                  paymentMethod === method.id ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Date">
          <input className={fieldClass} type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
        </Field>
        <Field label="Note">
          <textarea
            className={textareaClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
          />
        </Field>
        {error ? <p className="text-sm text-accent">{error}</p> : null}
      </form>
    </Sheet>
  )
}
