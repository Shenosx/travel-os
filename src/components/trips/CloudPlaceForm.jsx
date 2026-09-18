import { useState } from 'react'
import { CURRENCIES } from '../../lib/currency.js'
import { formatQuietDate, tripDates, tripDayNumber } from '../../lib/dates.js'
import { PLACE_CATEGORIES, PLACE_STATUSES, PLACE_STATUS_LABEL } from '../../lib/places.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

export function CloudPlaceForm({
  trip,
  place,
  error,
  busy = false,
  onSubmit,
  onDelete,
  onCancel,
}) {
  const requestClose = useSheetClose()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const days = trip ? tripDates(trip) : []

  function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    if (!name) return
    const estimated = String(data.get('estimatedCost') || '').trim()
    const rating = String(data.get('rating') || '').trim()
    const latitude = String(data.get('latitude') || '').trim()
    const longitude = String(data.get('longitude') || '').trim()
    const plannedDay = String(data.get('plannedDay') || '').trim()
    onSubmit({
      id: place?.id,
      name,
      category: String(data.get('category') || '') || 'Other',
      notes: String(data.get('notes') || '').trim(),
      estimatedCost: estimated ? Number(estimated) : null,
      currency: String(data.get('currency') || trip?.currency || 'MYR'),
      status: String(data.get('status') || 'saved'),
      plannedDay: plannedDay || null,
      address: String(data.get('address') || '').trim() || null,
      website: String(data.get('website') || '').trim() || null,
      openingHours: String(data.get('openingHours') || '').trim() || null,
      rating: rating ? Number(rating) : null,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[13px] text-ink-subtle">Cloud trip · {trip.destination}</p>

      <Field label="Place name">
        <input
          className={fieldClass}
          name="name"
          defaultValue={place?.name ?? ''}
          placeholder="Schönbrunn Palace"
          required
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={fieldClass} name="category" defaultValue={place?.category ?? 'Sight'}>
            {PLACE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={fieldClass} name="status" defaultValue={place?.status ?? 'saved'}>
            {PLACE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PLACE_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className={textareaClass}
          name="notes"
          defaultValue={place?.notes ?? ''}
          placeholder="Optional"
        />
      </Field>

      <Field label="Address">
        <input className={fieldClass} name="address" defaultValue={place?.address ?? ''} placeholder="Optional" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <input
            className={fieldClass}
            name="latitude"
            inputMode="decimal"
            defaultValue={place?.latitude ?? ''}
            placeholder="Optional"
          />
        </Field>
        <Field label="Longitude">
          <input
            className={fieldClass}
            name="longitude"
            inputMode="decimal"
            defaultValue={place?.longitude ?? ''}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Estimated cost">
          <input
            className={fieldClass}
            name="estimatedCost"
            inputMode="decimal"
            defaultValue={place?.estimatedCost ?? ''}
            placeholder="Optional"
          />
        </Field>
        <Field label="Currency">
          <select className={fieldClass} name="currency" defaultValue={place?.currency ?? trip?.currency ?? 'MYR'}>
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {days.length ? (
        <Field label="Planned day">
          <select className={fieldClass} name="plannedDay" defaultValue={place?.plannedDay ?? ''}>
            <option value="">Not set</option>
            {days.map((date) => (
              <option key={date} value={date}>
                Day {tripDayNumber(trip, date)} · {formatQuietDate(date)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Rating">
        <input
          className={fieldClass}
          name="rating"
          inputMode="decimal"
          defaultValue={place?.rating ?? ''}
          placeholder="4.7"
        />
      </Field>

      {place ? (
        <>
          <Field label="Opening hours">
            <input className={fieldClass} name="openingHours" defaultValue={place.openingHours ?? ''} />
          </Field>
          <Field label="Website">
            <input className={fieldClass} name="website" defaultValue={place.website ?? ''} />
          </Field>
        </>
      ) : null}

      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}

      {onDelete ? (
        <div className="pt-1">
          {confirmDelete ? (
            <button type="button" className="text-sm text-accent" onClick={onDelete} disabled={busy}>
              Confirm delete
            </button>
          ) : (
            <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(true)}>
              Delete place
            </button>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={busy}>
          {place ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
