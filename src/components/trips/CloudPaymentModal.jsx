import { useState } from 'react'
import { displayName } from '../../data/mock.js'
import { todayIso } from '../../lib/dates.js'
import { formatMoney } from '../../lib/format.js'
import { PAYMENT_METHODS, validateRepayment } from '../../lib/repayments.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'

export function CloudPaymentModal({ debt, currentUserId, onClose, onSave }) {
  const people = Array.isArray(debt?.people) ? debt.people : []
  const trip = debt?.trip
  const toUserId = debt?.toUserId || debt?.toId
  const outstanding = debt?.outstanding ?? debt?.amount
  const recipient = people.find((person) => person.userId === toUserId)?.user
  const [amount, setAmount] = useState(String(outstanding ?? ''))
  const [paymentMethod, setPaymentMethod] = useState('maybank')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    const input = {
      tripId: trip.id,
      fromUserId: currentUserId,
      toUserId,
      amount: Number(amount),
      currency: trip.currency,
      paymentMethod,
      paidAt,
      note,
      expenseId: debt.expenseId,
    }
    const check = validateRepayment(
      input,
      debt.expenses ?? [],
      debt.repayments ?? [],
      people.map((person) => person.userId).filter(Boolean),
    )
    if (!check.ok) {
      setError(check.error)
      return
    }
    const saved = onSave?.(input, {
      expenses: debt.expenses ?? [],
      memberIds: people.map((person) => person.userId).filter(Boolean),
      repayments: debt.repayments ?? [],
    })
    if (!saved) {
      setError('Could not record that payment.')
      return
    }
    onClose?.()
  }

  return (
    <div
      data-cloud-payment-modal=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(17, 17, 17, 0.4)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-payment-title"
        className="relative w-full max-w-[420px] rounded-xl border border-line bg-surface p-5 sm:p-6"
      >
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Repayment</p>
        <h2 id="cloud-payment-title" className="font-display mt-1 text-[26px] leading-tight tracking-[-0.03em]">
          Record payment
        </h2>
        <form id="cloud-payment-form" onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <p className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Recipient</p>
            <p className="mt-1.5 text-[15px] text-ink">{displayName(recipient, currentUserId)}</p>
          </div>
          <div>
            <p className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Expense</p>
            <p className="mt-1.5 text-[15px] text-ink">{debt.label || debt.description || 'Expense'}</p>
          </div>
          <p className="text-[13px] text-ink-muted">Outstanding {formatMoney(outstanding, trip.currency)}</p>
          <Field label="Payment amount">
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="text-sm text-ink-muted" onClick={() => onClose?.()}>
              Cancel
            </button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
