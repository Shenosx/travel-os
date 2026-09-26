import { Link } from 'react-router-dom'
import { formatDateRange } from '../../lib/dates.js'
import { describeTripCountdown, STATUS_LABEL } from '../../lib/trips.js'

export function UpcomingHero({ trip, packing = null, checklist = null }) {
  const countdown = describeTripCountdown(trip)
  const status = countdown.status

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(200px,0.7fr)]">
        <div className="px-6 py-8 sm:px-9 sm:py-10">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">
            Next trip
            <span className="text-ink-muted"> · {STATUS_LABEL[status]}</span>
          </p>
          <h2 className="font-display mt-4 text-[42px] leading-[0.98] tracking-[-0.05em] text-ink sm:text-[54px]">
            {trip.city || trip.destination}
          </h2>
          {trip.country ? <p className="mt-3 text-[15px] text-ink-muted">{trip.country}</p> : null}
          <p className="mt-5 text-[15px] text-ink">{formatDateRange(trip.startDate, trip.endDate)}</p>
          {trip.notes ? (
            <p className="mt-4 max-w-[36ch] text-[14px] leading-[1.65] text-ink-subtle">{trip.notes}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              to={`/trips/${trip.id}`}
              className="inline-flex text-[13px] font-medium text-accent hover:text-accent-hover"
            >
              Open trip
            </Link>
            {packing?.href ? (
              <Link to={packing.href} className="text-[13px] text-ink-muted hover:text-ink">
                Packing · {packing.percent}% packed
              </Link>
            ) : null}
            {checklist?.href ? (
              <Link to={checklist.href} className="text-[13px] text-ink-muted hover:text-ink">
                Checklist · {checklist.done} / {checklist.total} complete
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col justify-end bg-accent-soft px-6 py-8 sm:px-8 sm:py-10">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">
            {status === 'upcoming' ? 'Departs in' : status === 'ongoing' ? 'Travelling now' : 'Ended'}
          </p>
          {status === 'upcoming' ? (
            <div className="mt-3 flex items-end gap-2.5">
              <p className="font-display text-[56px] leading-none tracking-[-0.055em] text-ink sm:text-[64px]">
                {countdown.value}
              </p>
              <p className="mb-1.5 text-[13px] tracking-[0.02em] text-ink-muted">
                {countdown.value === 1 ? 'day' : 'days'}
              </p>
            </div>
          ) : (
            <p className="font-display mt-3 text-[28px] leading-tight tracking-[-0.04em] text-ink">
              {countdown.label}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
