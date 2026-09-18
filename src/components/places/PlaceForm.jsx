import { CURRENCIES } from '../../lib/currency.js'
import { PLACE_CATEGORIES, PLACE_STATUSES, PLACE_STATUS_LABEL } from '../../lib/places.js'
import { tripDates, tripDayNumber } from '../../lib/dates.js'
import { formatQuietDate } from '../../lib/dates.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

export function PlaceForm({
  trip,
  trips = [],
  place,
  defaultTripId,
  lockTrip = false,
  onSubmit,
  onCancel,
  onDirtyChange,
}) {
  const requestClose = useSheetClose()
  const startingTripId = place?.tripId ?? defaultTripId ?? trip?.id ?? trips[0]?.id ?? ''
  const selectedTrip = trip ?? trips.find((item) => item.id === startingTripId)
  const days = selectedTrip ? tripDates(selectedTrip) : []

  function handleSubmit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') || '').trim()
    if (!name) return
    const estimated = String(data.get('estimatedCost') || '').trim()
    const rating = String(data.get('rating') || '').trim()
    onSubmit({
      tripId: String(data.get('tripId') || startingTripId),
      name,
      category: String(data.get('category') || '') || 'Other',
      notes: String(data.get('notes') || '').trim(),
      estimatedCost: estimated ? Number(estimated) : undefined,
      currency: String(data.get('currency') || selectedTrip?.currency || 'MYR'),
      status: String(data.get('status') || 'saved'),
      plannedDay: String(data.get('plannedDay') || '') || undefined,
      address: String(data.get('address') || '').trim() || undefined,
      website: String(data.get('website') || '').trim() || undefined,
      openingHours: String(data.get('openingHours') || '').trim() || undefined,
      rating: rating ? Number(rating) : undefined,
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
          <select
            className={fieldClass}
            name="currency"
            defaultValue={place?.currency ?? selectedTrip?.currency ?? 'MYR'}
          >
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
                Day {tripDayNumber(selectedTrip, date)} · {formatQuietDate(date)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {place ? (
        <>
          <Field label="Address">
            <input className={fieldClass} name="address" defaultValue={place.address ?? ''} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening hours">
              <input className={fieldClass} name="openingHours" defaultValue={place.openingHours ?? ''} />
            </Field>
            <Field label="Rating">
              <input
                className={fieldClass}
                name="rating"
                inputMode="decimal"
                defaultValue={place.rating ?? ''}
                placeholder="4.7"
              />
            </Field>
          </div>
          <Field label="Website">
            <input className={fieldClass} name="website" defaultValue={place.website ?? ''} />
          </Field>
        </>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit">{place ? 'Save' : 'Add'}</Button>
      </div>
    </form>
  )
}
