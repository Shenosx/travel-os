import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudTripForm } from './CloudTripForm.jsx'

export function CloudTripComposer({ mode, trip, busy = false, error, onClose, onSubmit, onConfirmDelete }) {
  const [dirty, setDirty] = useState(false)

  if (mode === 'delete') {
    return (
      <Sheet title="Delete cloud trip" kicker="Cloud" onClose={onClose}>
        <p className="text-sm leading-relaxed text-ink-muted">
          Delete {trip?.destination || 'this cloud trip'}? The database removes related cloud records.
          Local trips on this device stay as they are.
        </p>
        {error ? <p className="mt-4 text-sm text-ink-muted">{error}</p> : null}
        <div className="mt-6 flex items-center justify-between">
          <button type="button" className="text-sm text-ink-muted" onClick={onClose}>
            Cancel
          </button>
          <Button onClick={onConfirmDelete} disabled={busy}>
            Delete
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      title={mode === 'edit' ? 'Edit cloud trip' : 'Create cloud trip'}
      kicker="Cloud"
      onClose={onClose}
      dirty={dirty}
    >
      <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
        <CloudTripForm trip={trip} error={error} busy={busy} onSubmit={onSubmit} onCancel={onClose} />
      </div>
    </Sheet>
  )
}
