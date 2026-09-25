import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '../../../hooks/useAppData.jsx'
import { groupNotesByDate, isIsoDate, notesForTripUser } from '../../../lib/planning.js'
import { Button } from '../../ui/Button.jsx'
import { EmptyState } from '../../ui/EmptyState.jsx'
import { Field, fieldClass, textareaClass } from '../../ui/Field.jsx'
import { Sheet, useSheetClose } from '../../ui/Sheet.jsx'

function previewBody(body) {
  const text = typeof body === 'string' ? body.replace(/\s+/g, ' ').trim() : ''
  if (text.length <= 160) return text
  return `${text.slice(0, 160).trimEnd()}…`
}

export function NotesView({ tripId }) {
  const { currentUser, notes, addNote, updateNote, deleteNote } = useAppData()
  const userId = currentUser.id
  const tripNotes = useMemo(
    () => notesForTripUser(notes, tripId, userId),
    [notes, tripId, userId],
  )
  const groups = useMemo(() => groupNotesByDate(tripNotes), [tripNotes])

  const [sheet, setSheet] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    setSheet(null)
    setConfirmId(null)
  }, [tripId, userId])

  function openAdd() {
    setSheet({ type: 'note' })
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Notes</p>
        </div>
        <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAdd}>
          + Add Note
        </button>
      </div>

      {tripNotes.length ? (
        <div className="mt-8 space-y-10">
          {groups.map((group) => (
            <section key={group.date || 'undated'} aria-labelledby={`note-date-${group.date || 'undated'}`}>
              <h3
                id={`note-date-${group.date || 'undated'}`}
                className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase"
              >
                {group.date || 'No date'}
              </h3>
              <ul className="mt-3 divide-y divide-line">
                {group.notes.map((note) => (
                  <li key={note.id} className="py-5">
                    <button
                      type="button"
                      className="block w-full min-w-0 text-left"
                      onClick={() => setSheet({ type: 'note', note })}
                    >
                      {note.title ? (
                        <span className="font-display block break-words text-[22px] tracking-[-0.03em] text-ink">
                          {note.title}
                        </span>
                      ) : null}
                      <span className="mt-1 block break-words text-sm leading-relaxed text-ink-muted">
                        {previewBody(note.body)}
                      </span>
                    </button>
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
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            title="No notes yet"
            body="Capture ideas, reminders, or moments from your trip."
            action={
              <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAdd}>
                + Add Note
              </button>
            }
          />
        </div>
      )}

      {sheet ? (
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
  return (
    <Sheet title={note ? 'Edit note' : 'Add note'} kicker="Notes" onClose={onClose}>
      <NoteForm
        tripId={tripId}
        note={note}
        onClose={onClose}
        addNote={addNote}
        updateNote={updateNote}
        deleteNote={deleteNote}
      />
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
    const saved = note
      ? updateNote(note.id, payload)
      : addNote({ tripId, ...payload })
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
      <Field label="Date">
        <input
          className={fieldClass}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <Field label="Body">
        <textarea
          className={textareaClass}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          rows={6}
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
