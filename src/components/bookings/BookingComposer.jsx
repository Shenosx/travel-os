import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../../hooks/useAppData.jsx'
import {
  BOOKING_STATUS_LABEL,
  BOOKING_TYPE_LABEL,
  bookingItineraryDate,
  bookingToExpenseCategory,
  expenseForBooking,
  formatBookingCost,
  formatBookingWhen,
  itineraryItemForBooking,
} from '../../lib/bookings.js'
import { formatQuietDate, tripDates, tripDayNumber } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { canOnTrip } from '../../lib/permissions.js'
import { getNextTrip } from '../../lib/trips.js'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { BookingForm } from './BookingForm.jsx'

const BookingComposerContext = createContext(null)

export function BookingComposerProvider({ children }) {
  const [session, setSession] = useState(null)

  const value = useMemo(
    () => ({
      openCreate: (tripId) => setSession({ type: 'create', tripId: tripId ?? null }),
      openEdit: (bookingId) => setSession({ type: 'edit', bookingId }),
      openView: (bookingId) => setSession({ type: 'view', bookingId }),
      close: () => setSession(null),
      session,
    }),
    [session],
  )

  return (
    <BookingComposerContext.Provider value={value}>
      {children}
      {session ? <BookingComposerSheet /> : null}
    </BookingComposerContext.Provider>
  )
}

export function useBookingComposer() {
  const context = useContext(BookingComposerContext)
  if (!context) throw new Error('useBookingComposer must be used within BookingComposerProvider')
  return context
}

function tripIdFromPath(pathname) {
  const match = pathname.match(/^\/trips\/([^/]+)/)
  return match?.[1] ?? null
}

function BookingComposerSheet() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, close, openEdit, openView } = useBookingComposer()
  const { openCreate: openExpense } = useExpenseComposer()
  const {
    trips,
    bookings,
    expenses,
    itineraries,
    currentUser,
    addBooking,
    updateBooking,
    deleteBooking,
    addBookingToItinerary,
    permissionsFor,
  } = useAppData()

  const formIdentity =
    session?.type === 'edit'
      ? `edit-${session.bookingId}`
      : session?.type === 'create'
        ? `create-${session.tripId}`
        : 'view'
  const [dirty, setDirty] = useState(false)
  const [dirtyFor, setDirtyFor] = useState(formIdentity)
  if (dirtyFor !== formIdentity) {
    setDirtyFor(formIdentity)
    setDirty(false)
  }

  const booking = session?.bookingId ? bookings.find((item) => item.id === session.bookingId) : null
  const contextTripId = tripIdFromPath(location.pathname)
  const creatableTrips = trips.filter((trip) => canOnTrip(trip, currentUser.id, 'addBooking'))
  const defaultTripId =
    (session?.tripId && creatableTrips.some((trip) => trip.id === session.tripId) ? session.tripId : null) ||
    booking?.tripId ||
    (contextTripId && creatableTrips.some((trip) => trip.id === contextTripId) ? contextTripId : null) ||
    getNextTrip(creatableTrips)?.id ||
    creatableTrips[0]?.id

  useEffect(() => {
    if ((session?.type === 'edit' || session?.type === 'view') && !booking) close()
  }, [session, booking, close])

  if (!session) return null
  if ((session.type === 'edit' || session.type === 'view') && !booking) return null

  if (session.type === 'create' && !creatableTrips.length) {
    return (
      <Sheet kicker="Booking" title="Add booking" onClose={close}>
        <p className="text-sm leading-relaxed text-ink-muted">
          Adding a booking is for the owner and editors.
        </p>
      </Sheet>
    )
  }

  function afterSave(tripId, bookingId) {
    close()
    navigate(`/trips/${tripId}?tab=bookings&booking=${bookingId}`)
  }

  if (session.type === 'create' || session.type === 'edit') {
    const trip = trips.find((item) => item.id === (booking?.tripId ?? defaultTripId))
    const permissions = trip ? permissionsFor(trip) : null
    const mayEdit = session.type === 'create' || (booking && permissions?.canEditBooking(booking))
    if (session.type === 'edit' && !mayEdit) {
      return (
        <Sheet kicker="Booking" title="Booking" onClose={close}>
          <p className="text-sm leading-relaxed text-ink-muted">This booking can be viewed, not edited.</p>
        </Sheet>
      )
    }

    return (
      <Sheet
        kicker={session.type === 'edit' ? 'Booking' : 'Quick add'}
        title={session.type === 'edit' ? 'Edit booking' : 'Add booking'}
        onClose={() => (session.type === 'edit' && booking ? openView(booking.id) : close())}
        dirty={dirty}
      >
        <BookingForm
          key={booking?.id ?? `create-${defaultTripId}`}
          trip={trip}
          trips={creatableTrips}
          booking={booking}
          defaultTripId={defaultTripId}
          lockTrip={Boolean(contextTripId && session.type === 'create')}
          onDirtyChange={() => setDirty(true)}
          onSubmit={(payload) => {
            if (booking) {
              const updated = updateBooking(booking.id, payload)
              if (updated) openView(booking.id)
              return
            }
            const created = addBooking(payload)
            if (created) afterSave(payload.tripId, created.id)
          }}
        />
      </Sheet>
    )
  }

  const trip = trips.find((item) => item.id === booking.tripId)
  const itinerary = itineraries.find((entry) => entry.tripId === booking.tripId)
  const linkedExpense = expenseForBooking(expenses, booking.id)
  const linkedItinerary = itineraryItemForBooking(itinerary, booking.id)

  return (
    <BookingDetailsSheet
      booking={booking}
      trip={trip}
      linkedExpense={linkedExpense}
      linkedItinerary={linkedItinerary}
      permissions={permissionsFor(trip)}
      onClose={close}
      onEdit={() => openEdit(booking.id)}
      onDelete={() => {
        deleteBooking(booking.id)
        close()
      }}
      onAddToItinerary={(date, time) => {
        const item = addBookingToItinerary(booking.id, date, time)
        if (item) {
          close()
          navigate(`/trips/${booking.tripId}?tab=itinerary&item=${item.id}&date=${date}`)
        }
      }}
      onAddExpense={() => {
        close()
        openExpense(booking.tripId, {
          amount: booking.cost,
          currency: booking.currency,
          description: booking.title,
          category: bookingToExpenseCategory(booking),
          date: booking.startDate,
          bookingId: booking.id,
        })
      }}
    />
  )
}

function BookingDetailsSheet({
  booking,
  trip,
  linkedExpense,
  linkedItinerary,
  permissions,
  onClose,
  onEdit,
  onDelete,
  onAddToItinerary,
  onAddExpense,
}) {
  const [action, setAction] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const days = trip ? tripDates(trip) : []
  const canMutate = permissions?.canEditBooking(booking)
  const canSchedule = permissions?.canEditItinerary
  const canRemove = permissions?.canDeleteBooking(booking)
  const canExpense = permissions?.canAddExpense && booking.cost != null && !linkedExpense
  const dayNumber =
    linkedItinerary?.day.dayNumber ?? (trip && linkedItinerary?.day.date ? tripDayNumber(trip, linkedItinerary.day.date) : null)
  const itineraryHref =
    trip?.id && linkedItinerary?.day.date
      ? `/trips/${trip.id}?tab=itinerary&item=${linkedItinerary.item.id}&date=${linkedItinerary.day.date}`
      : ''
  const expenseHref = trip?.id && linkedExpense ? `/trips/${trip.id}?tab=expenses` : ''

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
    <Sheet kicker={BOOKING_TYPE_LABEL[booking.type]} title={booking.title} onClose={onClose}>
      <dl className="space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">{label}</dt>
            <dd className="mt-1.5 text-[15px] text-ink">{value}</dd>
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
      {booking.notes ? <p className="mt-6 text-[14px] leading-relaxed text-ink-muted">{booking.notes}</p> : null}

      {itineraryHref || expenseHref ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5">
          {itineraryHref ? (
            <Link
              to={itineraryHref}
              onClick={onClose}
              className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-hover"
            >
              Itinerary · Day {dayNumber}
            </Link>
          ) : null}
          {expenseHref ? (
            <Link
              to={expenseHref}
              onClick={onClose}
              className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink"
            >
              Expense
            </Link>
          ) : null}
        </div>
      ) : null}

      {booking.documents?.length ? (
        <div className="mt-6">
          <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Documents</p>
          <ul className="mt-2">
            {booking.documents.map((doc) => (
              <li key={doc.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span className="text-ink">{doc.name}</span>
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-accent hover:text-accent-hover"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-[12px] text-ink-subtle">Attached</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {action === 'itinerary' || action === 'move' ? (
        <ScheduleBookingForm
          trip={trip}
          days={days}
          defaultDate={linkedItinerary?.day.date || bookingItineraryDate(booking, trip)}
          defaultTime={linkedItinerary?.item.time || booking.startTime || ''}
          submitLabel={action === 'move' ? 'Move' : 'Add to itinerary'}
          onCancel={() => setAction(null)}
          onSubmit={onAddToItinerary}
        />
      ) : (
        <div className="mt-8 space-y-2">
          {canSchedule && !linkedItinerary ? (
            <Button className="w-full min-h-11" variant="outline" onClick={() => setAction('itinerary')}>
              Add to itinerary
            </Button>
          ) : null}
          {canSchedule && linkedItinerary ? (
            <Button className="w-full min-h-11" variant="outline" onClick={() => setAction('move')}>
              Move to another day
            </Button>
          ) : null}
          {canExpense ? (
            <Button className="w-full min-h-11" variant="outline" onClick={onAddExpense}>
              Add to expenses
            </Button>
          ) : null}
          {canMutate ? (
            <Button className="w-full min-h-11" variant="outline" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {canRemove ? (
            confirmDelete ? (
              <Button className="w-full min-h-11" onClick={onDelete}>
                Confirm delete
              </Button>
            ) : (
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-center text-sm text-ink-subtle hover:text-ink"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )
          ) : null}
        </div>
      )}
    </Sheet>
  )
}

function ScheduleBookingForm({ trip, days, defaultDate, defaultTime, submitLabel = 'Add to itinerary', onCancel, onSubmit }) {
  const [date, setDate] = useState(defaultDate || days[0] || '')
  const [time, setTime] = useState(defaultTime || '')

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!date) return
        onSubmit(date, time)
      }}
    >
      <Field label="Day">
        <select className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)}>
          {days.map((iso) => (
            <option key={iso} value={iso}>
              Day {tripDayNumber(trip, iso)} · {formatQuietDate(iso)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Time">
        <input className={fieldClass} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
      </Field>
      <div className="flex items-center justify-between pt-1">
        <button type="button" className="text-sm text-ink-muted" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
