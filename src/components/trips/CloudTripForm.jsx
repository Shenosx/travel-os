import { Button } from '../ui/Button.jsx'
import { Field, fieldClass, textareaClass } from '../ui/Field.jsx'

export function CloudTripForm({ trip, error, busy = false, onSubmit, onCancel }) {
  function handleSubmit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const destination = String(data.get('destination') || '').trim()
    const [city, country] = destination.split(',').map((part) => part.trim())
    onSubmit?.({
      city: city || destination,
      country: country || '',
      destination,
      startDate: String(data.get('startDate') || '').trim(),
      endDate: String(data.get('endDate') || '').trim(),
      budgetAmount: String(data.get('budgetAmount') || '').trim(),
      currency: String(data.get('currency') || 'MYR').trim().toUpperCase(),
      visibility: String(data.get('visibility') || 'private'),
      notes: String(data.get('notes') || ''),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Destination">
        <input
          className={fieldClass}
          name="destination"
          defaultValue={trip?.destination ?? ''}
          placeholder="Kyoto, Japan"
          required
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input
            className={fieldClass}
            type="date"
            name="startDate"
            defaultValue={trip?.startDate ?? ''}
            required
          />
        </Field>
        <Field label="End">
          <input
            className={fieldClass}
            type="date"
            name="endDate"
            defaultValue={trip?.endDate ?? ''}
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget">
          <input
            className={fieldClass}
            name="budgetAmount"
            inputMode="decimal"
            defaultValue={trip?.budgetAmount ? String(trip.budgetAmount) : ''}
            placeholder="4000"
          />
        </Field>
        <Field label="Currency">
          <input
            className={fieldClass}
            name="currency"
            defaultValue={trip?.currency ?? 'MYR'}
            maxLength={3}
            required
          />
        </Field>
      </div>
      <Field label="Visibility">
        <select className={fieldClass} name="visibility" defaultValue={trip?.visibility ?? 'private'}>
          <option value="private">Private</option>
          <option value="shared">Shared</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea
          className={textareaClass}
          name="notes"
          defaultValue={trip?.notes ?? ''}
          placeholder="Optional"
        />
      </Field>

      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" disabled={busy}>
          {trip ? 'Save' : 'Create cloud trip'}
        </Button>
      </div>
    </form>
  )
}
