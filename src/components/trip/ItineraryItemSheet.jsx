import { useState } from 'react'
import { useAppData } from '../../hooks/useAppData.jsx'
import { formatLongDate } from '../../lib/dates.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { Sheet, SheetCancel } from '../ui/Sheet.jsx'

export function ItineraryItemSheet({
  trip,
  days = [],
  places = [],
  bookings = [],
  item = null,
  date,
  onClose,
  onSaved,
}) {
  const { addItineraryItem, updateItineraryItem } = useAppData()
  const editing = Boolean(item)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const defaultDate = itemDate(item, days, date, trip)

  function handleSubmit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get('title') || '').trim()
    const time = String(data.get('time') || '').trim()
    const location = String(data.get('location') || '').trim()
    const notes = String(data.get('notes') || '').trim()
    const placeId = String(data.get('placeId') || '')
    const bookingId = String(data.get('bookingId') || '')
    const itemDateValue = String(data.get('itemDate') || defaultDate)
    const place = places.find((entry) => entry.id === placeId)
    const booking = bookings.find((entry) => entry.id === bookingId)
    const nextTitle = title || place?.name || booking?.title || ''
    if (!nextTitle) {
      setError('Add a title, or link a place or booking.')
      return
    }

    const payload = {
      title: nextTitle,
      time,
      place: location,
      notes,
      placeId: placeId || undefined,
      bookingId: bookingId || undefined,
    }

    const saved = editing
      ? updateItineraryItem(trip.id, item.id, payload)
      : addItineraryItem(trip.id, itemDateValue, payload)

    if (!saved) {
      setError('This itinerary is read-only for your role.')
      return
    }
    onSaved?.(saved, itemDateValue)
    onClose()
  }

  return (
    <Sheet kicker="Itinerary" title={editing ? 'Edit stop' : 'Add a stop'} onClose={onClose} dirty={dirty}>
      <form onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
        <Field label="Day">
          <select
            className={fieldClass}
            name="itemDate"
            defaultValue={defaultDate}
            disabled={editing}
            required
          >
            {days.map((day) => (
              <option key={day.date} value={day.date}>
                Day {day.dayNumber} · {formatLongDate(day.date)}
                {day.title ? ` · ${day.title}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Time">
          <input className={fieldClass} type="time" name="time" defaultValue={item?.time ?? ''} />
        </Field>

        <Field label="Activity">
          <input
            className={fieldClass}
            name="title"
            defaultValue={item?.title ?? ''}
            placeholder="Morning walk"
            autoFocus
          />
        </Field>

        <Field label="Location">
          <input
            className={fieldClass}
            name="location"
            defaultValue={item?.place ?? ''}
            placeholder="Optional"
          />
        </Field>

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
          <textarea
            className={textareaClass}
            name="notes"
            defaultValue={item?.notes ?? ''}
            placeholder="Optional"
          />
        </Field>

        {error ? <p className="text-sm text-accent">{error}</p> : null}

        <div className="flex items-center justify-between pt-2">
          <SheetCancel onClose={onClose} />
          <Button type="submit">{editing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Sheet>
  )
}

function itemDate(item, days, date, trip) {
  if (date) return date
  if (item) {
    const match = days.find((day) => day.items?.some((entry) => entry.id === item.id))
    if (match) return match.date
  }
  return days[0]?.date || trip?.startDate || ''
}
