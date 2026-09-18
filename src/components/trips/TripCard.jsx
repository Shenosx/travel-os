import { Link } from 'react-router-dom'
import { formatDateRange } from '../../lib/dates.js'
import { formatMoney, spendingPercent } from '../../lib/format.js'
import { describeTripCountdown, getTripDurationDays, getTripStatus, STATUS_LABEL } from '../../lib/trips.js'
import { Badge } from '../ui/Badge.jsx'
import { Card } from '../ui/Card.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'

export function TripStatusBadge({ trip }) {
  const status = getTripStatus(trip)
  return (
    <Badge tone={status === 'upcoming' || status === 'ongoing' ? 'accent' : 'neutral'}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function TripCard({ trip, spent, invited = false }) {
  const duration = getTripDurationDays(trip)
  const countdown = describeTripCountdown(trip)
  const percent = spendingPercent(spent, trip.budgetAmount)

  return (
    <Card
      as={Link}
      to={`/trips/${trip.id}`}
      className="block p-5 transition-colors hover:bg-canvas-muted"
    >
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
          {invited ? <Badge tone="accent">Invited</Badge> : <TripStatusBadge trip={trip} />}
          <Badge tone="muted">{trip.visibility === 'shared' ? 'Shared' : 'Private'}</Badge>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4 text-sm">
        <div>
          <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Budget</p>
          <p className="mt-1 text-ink">{formatMoney(trip.budgetAmount, trip.currency)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Spent</p>
          <p className="mt-1 text-ink">{formatMoney(spent, trip.currency)}</p>
        </div>
      </div>
      <ProgressBar value={percent} className="mt-3" />
    </Card>
  )
}
