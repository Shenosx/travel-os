import { useState } from 'react'
import { useCloudBookingDocuments } from '../../hooks/useCloudBookingDocuments.js'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudBookingDocumentForm } from './CloudBookingDocumentForm.jsx'

function formatSize(bytes) {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function CloudBookingDocumentsSheet({ trip, booking, onClose }) {
  const cloud = useCloudBookingDocuments(trip, booking)
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  function closeDraft() {
    if (busy) return
    setDraft(false)
    setFormError(null)
  }

  async function handleUpload(file) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.upload(file)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    closeDraft()
  }

  async function handleOpen(document) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.open(document.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(document) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.remove(document.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setPendingDeleteId(null)
  }

  return (
    <>
      <Sheet kicker="Cloud" title="Documents" onClose={onClose}>
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">{booking.title}</p>
              <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
            </div>
            {cloud.canUpload ? (
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null)
                  setDraft(true)
                }}
              >
                Upload
              </Button>
            ) : null}
          </div>

          {cloud.loading ? <p className="text-sm text-ink-muted">Loading documents…</p> : null}
          {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
          <CloudLiveStatus error={cloud.liveError} />
          {formError && !draft ? <p className="text-sm text-ink-muted">{formError}</p> : null}

          {!cloud.loading && !cloud.documents.length ? (
            <EmptyState
              title="No documents yet"
              body={
                cloud.canUpload
                  ? 'Keep confirmations and tickets with this booking.'
                  : 'Documents will appear here once they’re added.'
              }
              action={
                cloud.canUpload ? (
                  <button type="button" className="text-sm text-accent" onClick={() => setDraft(true)}>
                    Upload a file
                  </button>
                ) : null
              }
            />
          ) : null}

          {cloud.documents.length ? (
            <ul className="space-y-3">
              {cloud.documents.map((document) => (
                <li key={document.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{document.name}</p>
                    <p className="mt-1 text-[12px] text-ink-subtle">
                      {[formatSize(document.sizeBytes), document.mimeType?.replace('application/', '').replace('image/', '').replace('text/', '')]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      className="text-sm text-accent"
                      onClick={() => handleOpen(document)}
                      disabled={busy}
                    >
                      Open
                    </button>
                    {cloud.canDelete ? (
                      pendingDeleteId === document.id ? (
                        <button
                          type="button"
                          className="text-sm text-ink"
                          onClick={() => handleDelete(document)}
                          disabled={busy}
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-ink-subtle"
                          onClick={() => setPendingDeleteId(document.id)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      )
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Sheet>

      {draft ? (
        <Sheet kicker="Cloud" title="Upload document" onClose={closeDraft}>
          <CloudBookingDocumentForm
            trip={trip}
            booking={booking}
            error={formError}
            busy={busy}
            onSubmit={handleUpload}
            onCancel={closeDraft}
          />
        </Sheet>
      ) : null}
    </>
  )
}
