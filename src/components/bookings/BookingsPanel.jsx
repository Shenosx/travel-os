import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../../hooks/useAppData.jsx'
import { expenseForBooking } from '../../lib/bookings.js'
import { formatDateRange, todayIso } from '../../lib/dates.js'
import { EmptyState } from '../ui/EmptyState.jsx'
import { BookingCard } from './BookingCard.jsx'
import { useBookingComposer } from './BookingComposer.jsx'

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
]

const EMPTY_COPY = {
  upcoming: {
    title: 'No upcoming bookings',
    bodyAdd: 'Keep a flight, hotel, or ticket here so it can sit on the trip.',
    bodyRead: 'Upcoming bookings will appear in this list.',
  },
  past: {
    title: 'No past bookings',
    bodyAdd: 'Completed stays and tickets will settle here.',
    bodyRead: 'Past bookings will appear in this list.',
  },
}

export function BookingsPanel({
  trip,
  bookings,
  selectedBookingId,
  onSelectBooking,
  canAdd,
}) {
  const { openCreate, openView } = useBookingComposer()
  const { itineraries, expenses } = useAppData()
  const itinerary = itineraries.find((entry) => entry.tripId === trip.id)
  const today = todayIso()

  const selected = bookings.find((booking) => booking.id === selectedBookingId)
  const [filter, setFilter] = useState(() => (selected && isPastBooking(selected, today) ? 'past' : 'upcoming'))

  const grouped = useMemo(() => {
    const upcoming = []
    const past = []
    for (const booking of bookings) {
      if (isPastBooking(booking, today)) past.push(booking)
      else upcoming.push(booking)
    }
    return {
      upcoming: sortBookings(upcoming),
      past: sortBookings(past).reverse(),
    }
  }, [bookings, today])

  const visible = grouped[filter] ?? grouped.upcoming
  const empty = EMPTY_COPY[filter] ?? EMPTY_COPY.upcoming

  useEffect(() => {
    if (!selectedBookingId || !selected) return
    setFilter(isPastBooking(selected, today) ? 'past' : 'upcoming')
  }, [selectedBookingId])

  useEffect(() => {
    if (!selectedBookingId) return
    document.getElementById(`booking-${selectedBookingId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedBookingId, filter])

  return (
    <div>
      <Link to={`/trips/${trip.id}`} className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
            {trip.city || trip.destination}
          </h2>
          <p className="mt-2 text-[14px] text-ink-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        {canAdd ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm text-accent"
            onClick={() => openCreate(trip.id)}
          >
            Add booking
          </button>
        ) : null}
      </header>

      <div
        role="tablist"
        aria-label="Booking time"
        className="home-rail mt-8 -mx-1 flex gap-2 overflow-x-auto pb-1"
      >
        {FILTERS.map((item) => {
          const selectedFilter = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selectedFilter}
              onClick={() => setFilter(item.id)}
              className={`min-h-11 shrink-0 rounded-lg px-3.5 text-sm transition-colors ${
                selectedFilter ? 'bg-accent-soft text-ink' : 'text-ink-subtle hover:bg-canvas-muted hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {visible.length ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {visible.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              trip={trip}
              itinerary={itinerary}
              expense={expenseForBooking(expenses, booking.id)}
              selected={booking.id === selectedBookingId}
              onSelect={() => {
                onSelectBooking?.(booking.id)
                openView(booking.id)
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            title={!bookings.length ? 'No bookings yet' : empty.title}
            body={
              !bookings.length
                ? canAdd
                  ? 'Keep flights, hotels, and tickets with the trip — then link them to a day or an expense.'
                  : 'Bookings will appear here once they’re added.'
                : canAdd
                  ? empty.bodyAdd
                  : empty.bodyRead
            }
            action={
              canAdd ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-sm text-accent"
                  onClick={() => openCreate(trip.id)}
                >
                  Add booking
                </button>
              ) : null
            }
          />
        </div>
      )}
    </div>
  )
}

function isPastBooking(booking, today) {
  const end = booking.endDate || booking.startDate
  return Boolean(end && end < today)
}

function sortBookings(list) {
  return [...list].sort((a, b) => {
    const left = `${a.startDate || ''}${a.startTime || ''}`
    const right = `${b.startDate || ''}${b.startTime || ''}`
    return left.localeCompare(right)
  })
}
