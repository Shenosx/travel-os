import { BOOKING_TYPE_LABEL, formatBookingCost, formatBookingWhen } from '../../lib/bookings.js'
import { Card } from '../ui/Card.jsx'

export function BookingCard({ booking, selected = false, onSelect }) {
  return (
    <Card
      as="button"
      type="button"
      onClick={() => onSelect?.(booking)}
      className={`w-full p-5 text-left transition-colors ${
        selected ? 'ring-1 ring-accent' : 'hover:bg-canvas-muted'
      }`}
    >
      <p className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">
        {BOOKING_TYPE_LABEL[booking.type] ?? booking.type}
      </p>
      <h3 className="font-display mt-2 text-[24px] leading-tight tracking-[-0.03em] text-ink">
        {booking.title}
      </h3>
      {booking.provider ? <p className="mt-2 text-sm text-ink-muted">{booking.provider}</p> : null}
      <p className="mt-1 text-[13px] text-ink-subtle">{formatBookingWhen(booking)}</p>
      {booking.confirmationNumber ? (
        <p className="mt-4 text-[13px] tracking-[0.04em] text-ink">{booking.confirmationNumber}</p>
      ) : null}
      {formatBookingCost(booking) ? (
        <p className="mt-3 text-sm text-ink">{formatBookingCost(booking)}</p>
      ) : null}
      <p className="mt-4 text-[13px] text-accent">View details</p>
    </Card>
  )
}
