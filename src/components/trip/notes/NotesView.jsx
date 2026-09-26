import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../../../hooks/useAppData.jsx'
import { formatQuietDate } from '../../../lib/dates.js'
import { isIsoDate, notesForTripUser } from '../../../lib/planning.js'
import { Button } from '../../ui/Button.jsx'
import { EmptyState } from '../../ui/EmptyState.jsx'
import { Field, fieldClass, textareaClass } from '../../ui/Field.jsx'
import { Sheet, useSheetClose } from '../../ui/Sheet.jsx'

function previewBody(body) {
  const text = typeof body === 'string' ? body.replace(/\s+/g, ' ').trim() : ''
  if (text.length <= 120) return text
  return `${text.slice(0, 120).trimEnd()}…`
}

function sortNotesByUpdated(notes) {
  return [...notes].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
}

export function NotesView({ tripId, canEdit = false }) {
  const { currentUser, notes, addNote, updateNote, deleteNote } = useAppData()
  const userId = currentUser.id
  const tripNotes = useMemo(
    () => sortNotesByUpdated(notesForTripUser(notes, tripId, userId)),
    [notes, tripId, userId],
  )

  const [sheet, setSheet] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    setSheet(null)
    setConfirmId(null)
  }, [tripId, userId])

  function openAdd() {
    if (!canEdit) return
    setSheet({ type: 'note' })
  }

  return (
    <div className="min-w-0">
      <Link to={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
            Notes
          </h2>
          <p className="mt-3 max-w-[42ch] text-[15px] text-ink-muted">
            Keep the little things you'll want later.
          </p>
        </div>
        {canEdit ? (
          <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAdd}>
            + New note
          </button>
        ) : null}
      </header>

      {tripNotes.length ? (
        <ul className="mt-10 grid gap-10 lg:grid-cols-2">
          {tripNotes.map((note) => (
            <li key={note.id} className="min-w-0">
              <button
                type="button"
                className="block w-full min-w-0 text-left"
                onClick={() => canEdit && setSheet({ type: 'note', note })}
              >
                <span className="font-display block break-words text-[22px] tracking-[-0.03em] text-ink">
                  {note.title.trim() || 'Note'}
                </span>
                <span className="mt-2 block break-words text-[15px] leading-relaxed text-ink-muted">
                  {previewBody(note.body)}
                </span>
              </button>
              <p className="mt-3 text-[13px] text-ink-subtle">
                {note.updatedAt ? `Updated ${formatQuietDate(note.updatedAt)}` : null}
              </p>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center text-sm text-ink-muted"
                    onClick={() => setSheet({ type: 'note', note })}
                  >
                    Edit
                  </button>
                  {confirmId === note.id ? (
                    <span
                      role="alertdialog"
                      aria-labelledby={`note-del-${note.id}`}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <span id={`note-del-${note.id}`} className="text-sm text-ink">
                        Delete this note?
                      </span>
                      <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                      <button
                        type="button"
                        className="text-sm text-accent"
                        onClick={() => {
                          deleteNote(note.id)
                          setConfirmId(null)
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center text-sm text-ink-subtle"
                      onClick={() => setConfirmId(note.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10">
          <EmptyState
            title="No notes yet"
            body="Keep ideas, reminders, and little details here."
            action={
              canEdit ? (
                <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAdd}>
                  Add your first note
                </button>
              ) : null
            }
          />
        </div>
      )}

      {sheet && canEdit ? (
        <NoteSheet
          tripId={tripId}
          note={sheet.note}
          onClose={() => setSheet(null)}
          addNote={addNote}
          updateNote={updateNote}
          deleteNote={deleteNote}
        />
      ) : null}
    </div>
  )
}

function NoteSheet({ tripId, note, onClose, addNote, updateNote, deleteNote }) {
  const [dirty, setDirty] = useState(false)
  return (
    <Sheet title={note ? 'Edit note' : 'Add note'} kicker="Notes" onClose={onClose} dirty={dirty}>
      <div onChange={() => setDirty(true)}>
        <NoteForm
          tripId={tripId}
          note={note}
          onClose={onClose}
          addNote={addNote}
          updateNote={updateNote}
          deleteNote={deleteNote}
        />
      </div>
    </Sheet>
  )
}

function NoteForm({ tripId, note, onClose, addNote, updateNote, deleteNote }) {
  const requestClose = useSheetClose()
  const [title, setTitle] = useState(note?.title ?? '')
  const [date, setDate] = useState(note?.date ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function parsedDate() {
    const value = date.trim()
    if (!value) return { ok: true, date: null }
    if (!isIsoDate(value)) return { ok: false, date: null }
    return { ok: true, date: value }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const trimmedBody = body.trim()
    const nextDate = parsedDate()
    if (!trimmedBody || !nextDate.ok) return
    const payload = { title: title.trim(), body: trimmedBody, date: nextDate.date }
    const saved = note ? updateNote(note.id, payload) : addNote({ tripId, ...payload })
    if (!saved) return
    onClose()
  }

  const nextDate = parsedDate()

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Title">
        <input
          className={fieldClass}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Optional"
          autoFocus
        />
      </Field>
      <Field label="Content">
        <textarea
          className={textareaClass}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          rows={6}
        />
      </Field>
      <Field label="Date">
        <input
          className={fieldClass}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      {note ? (
        <div>
          {confirmDelete ? (
            <span role="alertdialog" aria-labelledby="note-sheet-del" className="flex flex-wrap items-center gap-3">
              <span id="note-sheet-del" className="text-sm text-ink">
                Delete this note?
              </span>
              <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button
                type="button"
                className="text-sm text-accent"
                onClick={() => {
                  deleteNote(note.id)
                  onClose()
                }}
              >
                Delete
              </button>
            </span>
          ) : (
            <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(true)}>
              Delete note
            </button>
          )}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onClose)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={!body.trim() || !nextDate.ok}>
          Save
        </Button>
      </div>
    </form>
  )
}
