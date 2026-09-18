import { formatDateRange } from '../../lib/dates.js'
import { formatMoney } from '../../lib/format.js'
import { describeTripCountdown, getTripDurationDays } from '../../lib/trips.js'
import { TripStatusBadge } from './TripCard.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Card } from '../ui/Card.jsx'

export function CloudTripCard({
  trip,
  canManage = false,
  onPeople,
  onItinerary,
  onPlaces,
  onBookings,
  onExpenses,
  onPolls,
  onActivity,
  onEdit,
  onDelete,
}) {
  const duration = getTripDurationDays(trip)
  const countdown = describeTripCountdown(trip)

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[22px] leading-tight tracking-[-0.03em] text-ink">
            {trip.destination}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDateRange(trip.startDate, trip.endDate)}
            <span className="text-ink-subtle"> · {duration} days</span>
          </p>
          {countdown.status === 'upcoming' ? (
            <p className="mt-1 text-[13px] text-ink-subtle">
              {countdown.value} {countdown.value === 1 ? 'day' : 'days'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TripStatusBadge trip={trip} />
          <Badge tone="muted">{trip.visibility === 'shared' ? 'Shared' : 'Private'}</Badge>
        </div>
      </div>

      <div className="mt-6 text-sm">
        <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Budget</p>
        <p className="mt-1 text-ink">{formatMoney(trip.budgetAmount, trip.currency)}</p>
      </div>
      <p className="mt-3 text-[12px] text-ink-subtle">Cloud trip · not on this device</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="text-sm text-accent" onClick={onPeople}>
          People
        </button>
        <button type="button" className="text-sm text-ink-muted" onClick={onItinerary}>
          Itinerary
        </button>
        <button type="button" className="text-sm text-ink-muted" onClick={onPlaces}>
          Places
        </button>
        <button type="button" className="text-sm text-ink-muted" onClick={onBookings}>
          Bookings
        </button>
        <button type="button" className="text-sm text-ink-muted" onClick={onExpenses}>
          Expenses
        </button>
        <button type="button" className="text-sm text-ink-muted" onClick={onPolls}>
          Polls
        </button>
        <button type="button" className="text-sm text-ink-muted" onClick={onActivity}>
          Activity
        </button>
        {canManage ? (
          <>
            <button type="button" className="text-sm text-ink-muted" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="text-sm text-ink-subtle" onClick={onDelete}>
              Delete
            </button>
          </>
        ) : null}
      </div>
    </Card>
  )
}
