import { CURRENCIES } from '../../lib/currency.js'
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL, BOOKING_TYPES, BOOKING_TYPE_LABEL } from '../../lib/bookings.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

export function BookingForm({
  trip,
  trips = [],
  booking,
  defaultTripId,
  lockTrip = false,
  onSubmit,
  onCancel,
  onDirtyChange,
}) {
  const requestClose = useSheetClose()
  const startingTripId = booking?.tripId ?? defaultTripId ?? trip?.id ?? trips[0]?.id ?? ''
  const selectedTrip = trip ?? trips.find((item) => item.id === startingTripId)

  function handleSubmit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    if (!title) return
    const cost = String(data.get('cost') || '').trim()
    onSubmit({
      tripId: String(data.get('tripId') || startingTripId),
      type: String(data.get('type') || 'other'),
      title,
      provider: String(data.get('provider') || '').trim() || undefined,
      confirmationNumber: String(data.get('confirmationNumber') || '').trim() || undefined,
      startDate: String(data.get('startDate') || '') || undefined,
      startTime: String(data.get('startTime') || '') || undefined,
      endDate: String(data.get('endDate') || '') || undefined,
      endTime: String(data.get('endTime') || '') || undefined,
      location: String(data.get('location') || '').trim() || undefined,
      cost: cost ? Number(cost) : undefined,
      currency: String(data.get('currency') || selectedTrip?.currency || 'MYR'),
      notes: String(data.get('notes') || '').trim() || undefined,
      status: String(data.get('status') || 'confirmed'),
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      onInput={() => onDirtyChange?.()}
      onChange={() => onDirtyChange?.()}
      className="space-y-4"
    >
      {!lockTrip && trips.length > 1 ? (
        <Field label="Trip">
          <select className={fieldClass} name="tripId" defaultValue={startingTripId}>
            {trips.map((item) => (
              <option key={item.id} value={item.id}>
                {item.destination}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="tripId" value={startingTripId} />
      )}

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

      {booking ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="End date">
            <input className={fieldClass} type="date" name="endDate" defaultValue={booking?.endDate ?? ''} />
          </Field>
          <Field label="End time">
            <input className={fieldClass} type="time" name="endTime" defaultValue={booking?.endTime ?? ''} />
          </Field>
        </div>
      ) : null}

      <Field label="Confirmation">
        <input
          className={fieldClass}
          name="confirmationNumber"
          defaultValue={booking?.confirmationNumber ?? ''}
          placeholder="Optional"
        />
      </Field>

      {booking ? (
        <Field label="Location">
          <input className={fieldClass} name="location" defaultValue={booking?.location ?? ''} />
        </Field>
      ) : null}

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
          <select
            className={fieldClass}
            name="currency"
            defaultValue={booking?.currency ?? selectedTrip?.currency ?? 'MYR'}
          >
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

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit">{booking ? 'Save' : 'Add'}</Button>
      </div>
    </form>
  )
}
