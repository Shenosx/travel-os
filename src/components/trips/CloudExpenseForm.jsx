import { useMemo, useState } from 'react'
import { convert, CURRENCIES, HOME_CURRENCY, roundMoney } from '../../lib/currency.js'
import { CATEGORY_LABEL, CATEGORY_OPTIONS, getShareDelta, SHARE_TOLERANCE } from '../../lib/expenses.js'
import { formatMoney } from '../../lib/format.js'
import { useSheetClose } from '../ui/Sheet.jsx'
import { IconCheck } from '../icons.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'

function parseAmount(value) {
  const parsed = Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function todayIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function labelFor(person, currentUserId) {
  if (!person) return 'Someone'
  if (person.userId === currentUserId) return 'You'
  return person.shortName || person.name || person.email || 'Someone'
}

function initialParticipantIds(expense, people, currentUserId) {
  if (expense) return expense.shares.map((share) => share.userId)
  const current = people.filter((person) => !person.former)
  if (current.some((person) => person.userId === currentUserId)) {
    return current.map((person) => person.userId)
  }
  return current.map((person) => person.userId)
}

function initialShareDrafts(expense, participantIds, amount) {
  /** @type {Record<string, string>} */
  const next = {}
  if (expense) {
    expense.shares.forEach((share) => {
      next[share.userId] = String(share.amount)
    })
    return next
  }
  if (participantIds.length === 1) next[participantIds[0]] = amount
  return next
}

export function CloudExpenseForm({
  trip,
  people,
  currentUserId,
  expense,
  bookings = [],
  error,
  busy = false,
  onSubmit,
  onDelete,
  onCancel,
}) {
  const requestClose = useSheetClose()
  const startingParticipants = initialParticipantIds(expense, people, currentUserId)
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [currency, setCurrency] = useState(expense?.currency ?? trip?.currency ?? HOME_CURRENCY)
  const [category, setCategory] = useState(expense?.category ?? 'food')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [date, setDate] = useState(expense?.date ?? todayIso())
  const [payerId, setPayerId] = useState(expense?.payerId ?? currentUserId)
  const [participantIds, setParticipantIds] = useState(startingParticipants)
  const [shareDrafts, setShareDrafts] = useState(() =>
    initialShareDrafts(expense, startingParticipants, expense ? String(expense.amount) : ''),
  )
  const [bookingId, setBookingId] = useState(expense?.bookingId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const selectable = useMemo(() => {
    const ids = new Set(people.map((person) => person.userId))
    return people.filter((person) => ids.has(person.userId))
  }, [people])

  const total = parseAmount(amount)
  const shares = participantIds.map((userId) => ({
    userId,
    amount: parseAmount(shareDrafts[userId] ?? ''),
  }))
  const delta = getShareDelta(total, shares)
  const balanced = Math.abs(delta) < SHARE_TOLERANCE && total > 0 && participantIds.length > 0
  const homeCurrency = trip?.currency ?? HOME_CURRENCY
  const converted = convert(total, currency, homeCurrency)
  const showConversion = currency !== homeCurrency && total > 0

  function applyAmount(value) {
    setAmount(value)
    if (participantIds.length === 1) {
      setShareDrafts((current) => ({ ...current, [participantIds[0]]: value }))
    }
  }

  function toggleParticipant(userId) {
    setParticipantIds((current) => {
      if (current.includes(userId)) {
        if (current.length === 1) return current
        const next = current.filter((id) => id !== userId)
        setShareDrafts((drafts) => {
          const copy = { ...drafts }
          delete copy[userId]
          if (next.length === 1) copy[next[0]] = amount
          return copy
        })
        return next
      }
      return [...current, userId]
    })
  }

  function assignRemainder(userId) {
    const others = shares.filter((share) => share.userId !== userId).reduce((sum, share) => sum + share.amount, 0)
    const remainder = roundMoney(total - others)
    setShareDrafts((current) => ({ ...current, [userId]: String(remainder) }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!balanced || busy) return
    onSubmit({
      id: expense?.id,
      tripId: trip.id,
      amount: total,
      currency,
      convertedAmount: converted,
      convertedCurrency: homeCurrency,
      category,
      description: description.trim() || CATEGORY_LABEL[category],
      date,
      payerId,
      shares: shares.map((share) => ({ userId: share.userId, amount: roundMoney(share.amount) })),
      bookingId: bookingId || null,
      placeId: expense?.placeId ?? null,
      createdBy: expense?.createdBy,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-[13px] text-ink-subtle">Cloud trip · {trip.destination}</p>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Amount</span>
          <select
            className="h-8 rounded-md border border-line bg-canvas px-2 text-[13px] text-ink"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            aria-label="Currency"
          >
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </div>
        <input
          className="font-display h-14 w-full border-0 bg-transparent text-[40px] leading-none tracking-[-0.04em] text-ink outline-none placeholder:text-ink-subtle"
          inputMode="decimal"
          value={amount}
          onChange={(event) => applyAmount(event.target.value)}
          placeholder="0"
          required
          autoFocus={!expense}
        />
        {showConversion ? (
          <p className="mt-1 text-sm text-ink-muted">≈ {formatMoney(converted, homeCurrency)}</p>
        ) : null}
      </div>

      <Field label="Description">
        <input
          className={fieldClass}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Lunch"
        />
      </Field>

      <div>
        <p className="mb-2 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((id) => {
            const selected = id === category
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`rounded-md px-2.5 py-1.5 text-[13px] ${
                  selected ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
                }`}
              >
                {CATEGORY_LABEL[id]}
              </button>
            )
          })}
        </div>
      </div>

      <Field label="Date">
        <input className={fieldClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>

      {bookings.length ? (
        <Field label="Booking">
          <select className={fieldClass} value={bookingId} onChange={(event) => setBookingId(event.target.value)}>
            <option value="">Not linked</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.title}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div>
        <p className="mb-2 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Paid by</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {selectable.map((person) => {
            const selected = person.userId === payerId
            return (
              <button
                key={person.userId}
                type="button"
                onClick={() => setPayerId(person.userId)}
                className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 ${
                  selected ? 'border-transparent bg-accent-soft text-accent' : 'border-line text-ink-muted'
                }`}
                aria-pressed={selected}
              >
                <Avatar initials={person.initials || '?'} size="sm" />
                <span className="text-[13px]">{labelFor(person, currentUserId)}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[12px] text-ink-subtle">Who paid is separate from who owes a share.</p>
      </div>

      <div>
        <p className="mb-1 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Shares</p>
        <p className="mb-3 text-[12px] text-ink-subtle">Exact amounts. Not split equally.</p>
        <ul className="divide-y divide-line border-y border-line">
          {selectable.map((person) => {
            const included = participantIds.includes(person.userId)
            return (
              <li key={person.userId} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleParticipant(person.userId)}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                    included ? 'border-transparent bg-accent-soft text-accent' : 'border-line text-ink-subtle'
                  }`}
                  aria-pressed={included}
                  aria-label={`${included ? 'Remove' : 'Include'} ${labelFor(person, currentUserId)}`}
                >
                  {included ? <IconCheck className="h-3.5 w-3.5" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{labelFor(person, currentUserId)}</p>
                  {person.former ? <p className="text-[12px] text-ink-subtle">No longer on the trip</p> : null}
                </div>
                {included ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="h-9 w-[5.5rem] rounded-md border border-line bg-canvas px-2 text-right text-sm tabular-nums outline-none"
                      inputMode="decimal"
                      value={shareDrafts[person.userId] ?? ''}
                      onChange={(event) =>
                        setShareDrafts((current) => ({ ...current, [person.userId]: event.target.value }))
                      }
                      placeholder="0"
                    />
                    <button
                      type="button"
                      className="text-[11px] tracking-[0.04em] text-accent uppercase"
                      onClick={() => assignRemainder(person.userId)}
                    >
                      Rest
                    </button>
                  </div>
                ) : (
                  <span className="text-[12px] text-ink-subtle">Not included</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <ShareStatus total={total} delta={delta} currency={currency} balanced={balanced} />

      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}

      {onDelete ? (
        <div className="pt-1">
          {confirmDelete ? (
            <button type="button" className="text-sm text-accent" onClick={onDelete} disabled={busy}>
              Confirm delete
            </button>
          ) : (
            <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(true)}>
              Delete expense
            </button>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={!balanced || busy}>
          {expense ? 'Save changes' : 'Save expense'}
        </Button>
      </div>
    </form>
  )
}

function ShareStatus({ total, delta, currency, balanced }) {
  if (!(total > 0)) {
    return <p className="text-[13px] text-ink-subtle">Enter a total, then assign each person’s share.</p>
  }
  if (balanced) {
    return (
      <p className="rounded-md bg-accent-soft px-3 py-2.5 text-sm text-accent">
        Shares match {formatMoney(total, currency)}
      </p>
    )
  }
  if (delta > 0) {
    return (
      <p className="rounded-md border border-line px-3 py-2.5 text-sm text-ink-muted">
        {formatMoney(delta, currency)} left to assign
      </p>
    )
  }
  return (
    <p className="rounded-md border border-line px-3 py-2.5 text-sm text-ink-muted">
      {formatMoney(Math.abs(delta), currency)} over the total
    </p>
  )
}
