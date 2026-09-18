import { useState } from 'react'
import { CLOUD_ITINERARY_CATEGORIES } from '../../lib/trips/itinerary.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

const CATEGORY_LABEL = {
  arrival: 'Arrival',
  departure: 'Departure',
  lodging: 'Stay',
  food: 'Food',
  sight: 'Place',
  transport: 'Transit',
  free: 'Open',
}

export function CloudItineraryItemForm({
  trip,
  days = [],
  places = [],
  bookings = [],
  item,
  error,
  busy = false,
  onSubmit,
  onDelete,
  onCancel,
}) {
  const requestClose = useSheetClose()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const defaultDate = item?.itemDate ?? days[0]?.date ?? trip?.startDate ?? ''

  function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    const placeId = String(data.get('placeId') || '')
    const bookingId = String(data.get('bookingId') || '')
    const place = places.find((entry) => entry.id === placeId)
    const booking = bookings.find((entry) => entry.id === bookingId)
    if (!title && !place && !booking) return
    onSubmit({
      id: item?.id,
      title: title || place?.name || booking?.title || '',
      category: String(data.get('category') || 'free'),
      itemDate: String(data.get('itemDate') || defaultDate),
      time: String(data.get('time') || '').trim() || null,
      startTime: String(data.get('startTime') || '').trim() || null,
      endTime: String(data.get('endTime') || '').trim() || null,
      notes: String(data.get('notes') || '').trim(),
      placeId: placeId || null,
      bookingId: bookingId || null,
      placeLabel: place?.name || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[13px] text-ink-subtle">Cloud trip · {trip.destination}</p>

      <Field label="Day">
        <select className={fieldClass} name="itemDate" defaultValue={defaultDate} required>
          {days.map((day) => (
            <option key={day.id ?? day.date} value={day.date}>
              {day.dayNumber ? `Day ${day.dayNumber}` : day.date}
              {day.title ? ` · ${day.title}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input
          className={fieldClass}
          name="title"
          defaultValue={item?.title ?? ''}
          placeholder="Morning walk"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={fieldClass} name="category" defaultValue={item?.category ?? 'free'}>
            {CLOUD_ITINERARY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Time">
          <input className={fieldClass} type="time" name="time" defaultValue={item?.time ?? ''} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input className={fieldClass} type="time" name="startTime" defaultValue={item?.startTime ?? ''} />
        </Field>
        <Field label="End">
          <input className={fieldClass} type="time" name="endTime" defaultValue={item?.endTime ?? ''} />
        </Field>
      </div>

      {places.length ? (
        <Field label="Place">
          <select className={fieldClass} name="placeId" defaultValue={item?.placeId ?? ''}>
            <option value="">Not linked</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {bookings.length ? (
        <Field label="Booking">
          <select className={fieldClass} name="bookingId" defaultValue={item?.bookingId ?? ''}>
            <option value="">Not linked</option>
            {bookings.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.title}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Notes">
        <textarea className={textareaClass} name="notes" defaultValue={item?.notes ?? ''} placeholder="Optional" />
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
              Delete stop
            </button>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={busy}>
          {item ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
