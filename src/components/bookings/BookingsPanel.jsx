import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { BookingCard } from './BookingCard.jsx'
import { useBookingComposer } from './BookingComposer.jsx'

export function BookingsPanel({
  trip,
  bookings,
  selectedBookingId,
  onSelectBooking,
  canAdd,
}) {
  const { openCreate, openView } = useBookingComposer()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Bookings</p>
        {canAdd ? (
          <Button size="sm" variant="outline" onClick={() => openCreate(trip.id)}>
            Add booking
          </Button>
        ) : null}
      </div>

      {bookings.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              selected={booking.id === selectedBookingId}
              onSelect={() => {
                onSelectBooking?.(booking.id)
                openView(booking.id)
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No bookings yet"
            body={
              canAdd
                ? 'Keep flights, hotels, and tickets with the trip — then link them to a day or an expense.'
                : 'Bookings will appear here once they’re added.'
            }
            action={
              canAdd ? (
                <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip.id)}>
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
