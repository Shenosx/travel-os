import { useState } from 'react'
import { useCloudTripPolls } from '../../hooks/useCloudTripPolls.js'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudPollForm } from './CloudPollForm.jsx'

export function CloudPollsSheet({ trip, onClose }) {
  const cloud = useCloudTripPolls(trip)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [dirty, setDirty] = useState(false)

  function closeDraft() {
    if (busy) return
    setDraft(null)
    setFormError(null)
    setDirty(false)
  }

  async function handleCreate(input) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.create(input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    closeDraft()
  }

  async function handleUpdate(input) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.update(draft.pollId, input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    closeDraft()
  }

  async function handleDelete(poll) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.remove(poll.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    closeDraft()
  }

  async function handleVote(poll, optionId) {
    if (!cloud.canVote || busy) return
    setBusy(true)
    setFormError(null)
    const result = await cloud.vote(poll.id, optionId)
    setBusy(false)
    if (result.error) setFormError(result.error)
  }

  const editing = draft?.type === 'edit' ? cloud.polls.find((poll) => poll.id === draft.pollId) : null

  return (
    <>
      <Sheet kicker="Cloud" title="Polls" onClose={onClose} wide>
        <div className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trip polls</p>
              <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
            </div>
            {cloud.canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null)
                  setDirty(false)
                  setDraft({ type: 'create' })
                }}
              >
                New poll
              </Button>
            ) : null}
          </div>

          {cloud.loading ? <p className="text-sm text-ink-muted">Loading polls…</p> : null}
          {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
          <CloudLiveStatus error={cloud.liveError} />
          {formError && !draft ? <p className="text-sm text-ink-muted">{formError}</p> : null}

          {!cloud.loading && !cloud.polls.length ? (
            <EmptyState
              title="No questions yet"
              body={
                cloud.canCreate
                  ? 'Ask the group something small — dinner, a day trip, a museum.'
                  : 'Polls will appear here once someone asks a question.'
              }
              action={
                cloud.canCreate ? (
                  <button type="button" className="text-sm text-accent" onClick={() => setDraft({ type: 'create' })}>
                    Ask a question
                  </button>
                ) : null
              }
            />
          ) : null}

          {cloud.polls.map((poll) => (
            <CloudPollCard
              key={poll.id}
              poll={poll}
              canVote={cloud.canVote}
              canEdit={cloud.canEdit}
              canDelete={cloud.canDelete}
              busy={busy}
              onVote={(optionId) => handleVote(poll, optionId)}
              onEdit={() => {
                setFormError(null)
                setDirty(false)
                setDraft({ type: 'edit', pollId: poll.id })
              }}
              onDelete={() => handleDelete(poll)}
            />
          ))}
        </div>
      </Sheet>

      {draft?.type === 'create' || editing ? (
        <Sheet kicker="Cloud" title={editing ? 'Edit poll' : 'New poll'} onClose={closeDraft} dirty={dirty}>
          <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <CloudPollForm
              trip={trip}
              poll={editing}
              error={formError}
              busy={busy}
              onSubmit={editing ? handleUpdate : handleCreate}
              onCancel={closeDraft}
            />
          </div>
        </Sheet>
      ) : null}
    </>
  )
}

function CloudPollCard({ poll, canVote, canEdit, canDelete, busy, onVote, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const max = Math.max(...poll.options.map((option) => option.voteCount), 1)

  return (
    <section>
      <h3 className="font-display text-[24px] tracking-[-0.03em] text-ink">{poll.question}</h3>
      <ul className="mt-4 space-y-2">
        {poll.options.map((option) => {
          const selected = poll.myVote === option.id
          const width = `${Math.round((option.voteCount / max) * 100)}%`
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => canVote && onVote(option.id)}
                disabled={!canVote || busy}
                className={`relative w-full overflow-hidden rounded-md border px-3 py-3 text-left transition-colors ${
                  selected ? 'border-transparent bg-accent-soft' : 'border-line hover:bg-canvas-muted'
                } ${canVote ? '' : 'cursor-default'}`}
                aria-pressed={selected}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-accent-soft/80"
                  style={{ width: selected ? '100%' : width }}
                  aria-hidden="true"
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className={`text-sm ${selected ? 'text-accent' : 'text-ink'}`}>
                    {option.label}
                    {selected ? <span className="ml-2 text-[12px] font-normal">Your vote</span> : null}
                  </span>
                  <span className={`text-[13px] tabular-nums ${selected ? 'text-accent' : 'text-ink-subtle'}`}>
                    {option.voteCount}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-subtle">
          {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
          {canVote ? ' · One vote each. You can change your mind.' : ''}
        </p>
        <div className="flex items-center gap-3">
          {canEdit ? (
            <button type="button" className="text-sm text-ink-muted" onClick={onEdit} disabled={busy}>
              Edit
            </button>
          ) : null}
          {canDelete ? (
            confirmDelete ? (
              <button type="button" className="text-sm text-accent" onClick={onDelete} disabled={busy}>
                Confirm delete
              </button>
            ) : (
              <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )
          ) : null}
        </div>
      </div>
    </section>
  )
}
