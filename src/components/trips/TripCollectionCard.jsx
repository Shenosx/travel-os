import { Link } from 'react-router-dom'
import { formatDateRange } from '../../lib/dates.js'
import { describeTripCountdown, getTripStatus, STATUS_LABEL } from '../../lib/trips.js'

export function TripCollectionCard({ trip, summary, featured = false, invited = false }) {
  const status = getTripStatus(trip)
  const countdown = describeTripCountdown(trip)
  const completed = status === 'completed'
  const showCountdown = featured && countdown.status === 'upcoming' && countdown.value != null

  return (
    <Link
      to={`/trips/${trip.id}`}
      className={`block rounded-lg border border-line bg-surface transition-colors hover:bg-canvas-muted ${
        featured ? 'px-6 py-7 sm:px-8 sm:py-8' : 'px-5 py-6'
      }`}
    >
      <div className={featured ? 'flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between' : ''}>
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">
            {invited ? 'Invited' : STATUS_LABEL[status]}
          </p>
          <h3
            className={`font-display mt-3 leading-[1.08] tracking-[-0.04em] ${
              completed ? 'text-ink-muted' : 'text-ink'
            } ${featured ? 'text-[32px] sm:text-[40px]' : 'text-[26px]'}`}
          >
            {trip.city || trip.destination}
          </h3>
          {trip.country ? <p className="mt-1.5 text-[14px] text-ink-muted">{trip.country}</p> : null}
          <p className="mt-4 text-[14px] text-ink-subtle">{formatDateRange(trip.startDate, trip.endDate)}</p>
          {summary ? <p className="mt-3 text-[13px] text-ink-subtle">{summary}</p> : null}
        </div>

        {showCountdown ? (
          <div className="shrink-0">
            <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Departs in</p>
            <p className="font-display mt-2 text-[44px] leading-none tracking-[-0.05em] text-ink">
              {countdown.value}
              <span className="ml-1.5 font-sans text-[13px] tracking-normal text-ink-muted">
                {countdown.value === 1 ? 'day' : 'days'}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </Link>
  )
}
