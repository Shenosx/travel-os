import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

export function CloudBookingDocumentForm({ trip, booking, error, busy = false, onSubmit, onCancel }) {
  const requestClose = useSheetClose()
  const [file, setFile] = useState(null)

  function handleSubmit(event) {
    event.preventDefault()
    if (busy || !file) return
    onSubmit(file)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[13px] text-ink-subtle">
        Cloud trip · {trip.destination} · {booking.title}
      </p>
      <Field label="File">
        <input
          className={`${fieldClass} py-2 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:text-ink`}
          type="file"
          accept="application/pdf,image/jpeg,image/png,text/plain,.pdf,.jpg,.jpeg,.png,.txt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
        />
      </Field>
      <p className="text-[12px] text-ink-subtle">PDF, JPEG, PNG, or text. 10 MB at most.</p>
      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}
      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={busy || !file}>
          Upload
        </Button>
      </div>
    </form>
  )
}
