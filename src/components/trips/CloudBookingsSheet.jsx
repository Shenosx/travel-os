import { useState } from 'react'
import {
  BOOKING_STATUS_LABEL,
  BOOKING_TYPE_LABEL,
  formatBookingCost,
  formatBookingWhen,
} from '../../lib/bookings.js'
import { formatTime } from '../../lib/format.js'
import { useCloudTripBookings } from '../../hooks/useCloudTripBookings.js'
import { BookingCard } from '../bookings/BookingCard.jsx'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudBookingForm } from './CloudBookingForm.jsx'
import { CloudBookingDocumentsSheet } from './CloudBookingDocumentsSheet.jsx'

export function CloudBookingsSheet({ trip, currentUserId, onClose }) {
  const cloud = useCloudTripBookings(trip)
  const [selectedBookingId, setSelectedBookingId] = useState(null)
  const [documentsBooking, setDocumentsBooking] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [dirty, setDirty] = useState(false)

  function openCreate() {
    setFormError(null)
    setDirty(false)
    setDraft({ type: 'create' })
  }

  function closeDraft() {
    if (busy) return
    setDraft(null)
    setFormError(null)
    setDirty(false)
  }

  async function handleSubmit(input) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.save(input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(result.booking ? { type: 'view', bookingId: result.booking.id } : null)
    setDirty(false)
  }

  async function handleDelete(booking) {
    if (!booking?.id) return
    setBusy(true)
    setFormError(null)
    const result = await cloud.remove(booking.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
    if (selectedBookingId === booking.id) setSelectedBookingId(null)
  }

  const viewing = draft?.type === 'view' ? cloud.bookings.find((item) => item.id === draft.bookingId) : null
  const editing = draft?.type === 'edit' ? cloud.bookings.find((item) => item.id === draft.bookingId) : null

  return (
    <>
      <Sheet kicker="Cloud" title="Bookings" onClose={onClose} wide>
        <div className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trip bookings</p>
              <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
            </div>
            {cloud.canCreate ? (
              <Button size="sm" onClick={openCreate}>
                Add booking
              </Button>
            ) : null}
          </div>

          {cloud.loading ? <p className="text-sm text-ink-muted">Loading bookings…</p> : null}
          {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
          <CloudLiveStatus error={cloud.liveError} />

          {!cloud.loading && !cloud.bookings.length ? (
            <EmptyState
              title="No cloud bookings yet"
              body={
                cloud.canCreate
                  ? 'Keep flights, hotels, and tickets on this cloud trip. A title is enough to start.'
                  : 'Bookings will appear here once they’re added.'
              }
              action={
                cloud.canCreate ? (
                  <button type="button" className="text-sm text-accent" onClick={openCreate}>
                    Add a booking
                  </button>
                ) : null
              }
            />
          ) : null}

          {cloud.bookings.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {cloud.bookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  selected={booking.id === selectedBookingId}
                  onSelect={() => {
                    setSelectedBookingId(booking.id)
                    setFormError(null)
                    setDraft({ type: 'view', bookingId: booking.id })
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </Sheet>

      {draft?.type === 'create' || editing ? (
        <Sheet kicker="Cloud" title={editing ? 'Edit booking' : 'Add booking'} onClose={closeDraft} dirty={dirty}>
          <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <CloudBookingForm
              key={editing?.id ?? 'create'}
              trip={trip}
              booking={editing}
              error={formError}
              busy={busy}
              onSubmit={handleSubmit}
              onDelete={editing && cloud.canDeleteBooking(editing) ? () => handleDelete(editing) : undefined}
              onCancel={closeDraft}
            />
          </div>
        </Sheet>
      ) : null}

      {viewing ? (
        <CloudBookingDetails
          booking={viewing}
          trip={trip}
          error={formError}
          busy={busy}
          canEdit={cloud.canEditBooking(viewing)}
          canDelete={cloud.canDeleteBooking(viewing)}
          onClose={closeDraft}
          onEdit={() => {
            setFormError(null)
            setDirty(false)
            setDraft({ type: 'edit', bookingId: viewing.id })
          }}
          onDelete={() => handleDelete(viewing)}
          onDocuments={() => setDocumentsBooking(viewing)}
        />
      ) : null}

      {documentsBooking ? (
        <CloudBookingDocumentsSheet
          trip={trip}
          booking={documentsBooking}
          onClose={() => setDocumentsBooking(null)}
        />
      ) : null}
    </>
  )
}

function CloudBookingDetails({ booking, trip, error, busy, canEdit, canDelete, onClose, onEdit, onDelete, onDocuments }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rows = [
    ['Type', BOOKING_TYPE_LABEL[booking.type]],
    ['Provider', booking.provider],
    ['Confirmation', booking.confirmationNumber],
    ['When', formatBookingWhen(booking)],
    ['Location', booking.location],
    ['Cost', formatBookingCost(booking)],
    ['Status', BOOKING_STATUS_LABEL[booking.status]],
  ].filter(([, value]) => value)

  return (
    <Sheet kicker="Cloud" title={booking.title} onClose={onClose}>
      <p className="text-[13px] text-ink-subtle">{trip.destination} · cloud booking</p>
      <dl className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</dt>
            <dd className="mt-1 text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {booking.startTime || booking.endTime ? (
        <p className="mt-4 text-[13px] text-ink-subtle">
          {[booking.startTime ? formatTime(booking.startTime) : null, booking.endTime ? formatTime(booking.endTime) : null]
            .filter(Boolean)
            .join(' – ')}
        </p>
      ) : null}
      {booking.notes ? <p className="mt-5 text-sm leading-relaxed text-ink-muted">{booking.notes}</p> : null}
      <p className="mt-5 text-[13px] text-ink-subtle">Ready to attach to a cloud itinerary later.</p>
      {error ? <p className="mt-4 text-sm text-ink-muted">{error}</p> : null}

      <div className="mt-8 space-y-2">
        {onDocuments ? (
          <Button className="w-full" variant="outline" onClick={onDocuments} disabled={busy}>
            Documents
          </Button>
        ) : null}
        {canEdit ? (
          <Button className="w-full" variant="outline" onClick={onEdit} disabled={busy}>
            Edit
          </Button>
        ) : null}
        {canDelete ? (
          confirmDelete ? (
            <Button className="w-full" onClick={onDelete} disabled={busy}>
              Confirm delete
            </Button>
          ) : (
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center text-sm text-ink-subtle"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )
        ) : null}
      </div>
    </Sheet>
  )
}
