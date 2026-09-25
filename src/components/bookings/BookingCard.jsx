import { Link } from 'react-router-dom'
import {
  BOOKING_STATUS_LABEL,
  BOOKING_TYPE_LABEL,
  formatBookingCost,
  formatBookingWhen,
  itineraryItemForBooking,
} from '../../lib/bookings.js'
import { tripDayNumber } from '../../lib/dates.js'

export function BookingCard({
  booking,
  trip,
  itinerary,
  expense,
  selected = false,
  onSelect,
}) {
  const typeLabel = BOOKING_TYPE_LABEL[booking.type] ?? booking.type
  const statusLabel = BOOKING_STATUS_LABEL[booking.status] ?? booking.status
  const when = formatBookingWhen(booking)
  const cost = formatBookingCost(booking)
  const location =
    booking.location && booking.location !== booking.title
      ? booking.location
      : booking.provider && booking.provider !== booking.title
        ? booking.provider
        : ''
  const documents = booking.documents ?? []
  const linked = itineraryItemForBooking(itinerary, booking.id)
  const dayNumber = linked?.day.dayNumber ?? (trip && linked?.day.date ? tripDayNumber(trip, linked.day.date) : null)
  const itineraryHref =
    trip?.id && linked?.day.date
      ? `/trips/${trip.id}?tab=itinerary&item=${linked.item.id}&date=${linked.day.date}`
      : ''
  const expenseHref = trip?.id && expense ? `/trips/${trip.id}?tab=expenses` : ''
  const cancelled = booking.status === 'cancelled'

  return (
    <article
      id={`booking-${booking.id}`}
      className={`rounded-lg border border-line px-5 py-6 transition-colors ${
        selected ? 'bg-accent-soft' : 'bg-surface hover:bg-canvas-muted'
      }`}
    >
      <button type="button" onClick={() => onSelect?.(booking)} className="w-full text-left">
        <p
          className={`text-[11px] tracking-[0.16em] uppercase ${
            selected ? 'text-accent' : cancelled ? 'text-ink-subtle' : 'text-ink-subtle'
          }`}
        >
          {typeLabel}
          {statusLabel ? ` · ${statusLabel}` : ''}
        </p>
        <h3
          className={`font-display mt-2.5 text-[24px] leading-[1.1] tracking-[-0.03em] sm:text-[26px] ${
            cancelled ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          {booking.title}
        </h3>
        {location ? <p className="mt-1.5 text-[14px] text-ink-muted">{location}</p> : null}
        {when ? <p className="mt-3 text-[14px] text-ink-subtle">{when}</p> : null}
        {booking.confirmationNumber ? (
          <p className="mt-3 text-[13px] tracking-[0.03em] text-ink-muted">{booking.confirmationNumber}</p>
        ) : null}
        {cost ? <p className="mt-3 text-[13px] text-ink-subtle">{cost}</p> : null}
        {documents.length ? (
          <p className="mt-3 text-[13px] text-ink-subtle">
            {documents.length === 1 ? 'Document attached' : `${documents.length} documents attached`}
          </p>
        ) : null}
      </button>

      {itineraryHref || expenseHref ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {itineraryHref ? (
            <Link
              to={itineraryHref}
              className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-hover"
            >
              Itinerary · Day {dayNumber}
            </Link>
          ) : null}
          {expenseHref ? (
            <Link
              to={expenseHref}
              className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink"
            >
              Expense
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
