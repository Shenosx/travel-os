import { useState } from 'react'
import { CURRENCIES } from '../../lib/currency.js'
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL, BOOKING_TYPES, BOOKING_TYPE_LABEL } from '../../lib/bookings.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

export function CloudBookingForm({
  trip,
  booking,
  error,
  busy = false,
  onSubmit,
  onDelete,
  onCancel,
}) {
  const requestClose = useSheetClose()
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    const cost = String(data.get('cost') || '').trim()
    onSubmit({
      id: booking?.id,
      type: String(data.get('type') || 'other'),
      title,
      provider: String(data.get('provider') || '').trim() || null,
      confirmationNumber: String(data.get('confirmationNumber') || '').trim() || null,
      startDate: String(data.get('startDate') || '') || null,
      startTime: String(data.get('startTime') || '') || null,
      endDate: String(data.get('endDate') || '') || null,
      endTime: String(data.get('endTime') || '') || null,
      location: String(data.get('location') || '').trim() || null,
      cost: cost ? Number(cost) : null,
      currency: String(data.get('currency') || trip?.currency || 'MYR'),
      notes: String(data.get('notes') || '').trim(),
      status: String(data.get('status') || 'pending'),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[13px] text-ink-subtle">Cloud trip · {trip.destination}</p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={fieldClass} name="type" defaultValue={booking?.type ?? 'flight'}>
            {BOOKING_TYPES.map((type) => (
              <option key={type} value={type}>
                {BOOKING_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={fieldClass} name="status" defaultValue={booking?.status ?? 'confirmed'}>
            {BOOKING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {BOOKING_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input
          className={fieldClass}
          name="title"
          defaultValue={booking?.title ?? ''}
          placeholder="KUL → VIE"
          required
          autoFocus
        />
      </Field>

      <Field label="Provider">
        <input
          className={fieldClass}
          name="provider"
          defaultValue={booking?.provider ?? ''}
          placeholder="Malaysia Airlines"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input className={fieldClass} type="date" name="startDate" defaultValue={booking?.startDate ?? ''} />
        </Field>
        <Field label="Start time">
          <input className={fieldClass} type="time" name="startTime" defaultValue={booking?.startTime ?? ''} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="End date">
          <input className={fieldClass} type="date" name="endDate" defaultValue={booking?.endDate ?? ''} />
        </Field>
        <Field label="End time">
          <input className={fieldClass} type="time" name="endTime" defaultValue={booking?.endTime ?? ''} />
        </Field>
      </div>

      <Field label="Confirmation">
        <input
          className={fieldClass}
          name="confirmationNumber"
          defaultValue={booking?.confirmationNumber ?? ''}
          placeholder="Optional"
        />
      </Field>

      <Field label="Location">
        <input className={fieldClass} name="location" defaultValue={booking?.location ?? ''} placeholder="Optional" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cost">
          <input
            className={fieldClass}
            name="cost"
            inputMode="decimal"
            defaultValue={booking?.cost ?? ''}
            placeholder="Optional"
          />
        </Field>
        <Field label="Currency">
          <select className={fieldClass} name="currency" defaultValue={booking?.currency ?? trip?.currency ?? 'MYR'}>
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea className={textareaClass} name="notes" defaultValue={booking?.notes ?? ''} placeholder="Optional" />
      </Field>

      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}

      {onDelete ? (
        <div className="pt-1">
          {confirmDelete ? (
            <button type="button" className="text-sm text-accent" onClick={onDelete} disabled={busy}>
              Confirm delete
            </button>
          ) : (
            <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(true)}>
              Delete booking
            </button>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={busy}>
          {booking ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
