import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { useSheetClose } from '../ui/Sheet.jsx'

export function CloudPollForm({ trip, poll, error, busy = false, onSubmit, onCancel }) {
  const requestClose = useSheetClose()
  const [options, setOptions] = useState(poll ? poll.options.map((option) => option.label) : ['', ''])
  const editing = Boolean(poll)

  function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const question = String(data.get('question') || '').trim()
    if (!question) return
    if (editing) {
      onSubmit({ question })
      return
    }
    const labels = options.map((label) => label.trim()).filter(Boolean)
    if (labels.length < 2) return
    onSubmit({ question, options: labels })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[13px] text-ink-subtle">Cloud trip · {trip.destination}</p>
      <Field label="Question">
        <input
          className={fieldClass}
          name="question"
          defaultValue={poll?.question ?? ''}
          placeholder="Where should we eat?"
          autoFocus
          required
        />
      </Field>
      {editing ? (
        <p className="text-[13px] text-ink-subtle">Options stay as they are once people have started voting.</p>
      ) : (
        <div className="space-y-3">
          {options.map((label, index) => (
            <Field key={index} label={index === 0 ? 'Options' : `Option ${index + 1}`}>
              <input
                className={fieldClass}
                value={label}
                onChange={(event) => {
                  const next = options.slice()
                  next[index] = event.target.value
                  setOptions(next)
                }}
                placeholder={index === 0 ? 'Café Central' : 'Figlmüller'}
                required={index < 2}
              />
            </Field>
          ))}
          {options.length < 6 ? (
            <button type="button" className="text-sm text-ink-muted" onClick={() => setOptions((current) => [...current, ''])}>
              Add option
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}
      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onCancel)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={busy}>
          {editing ? 'Save' : 'Ask'}
        </Button>
      </div>
    </form>
  )
}
