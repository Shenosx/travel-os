import { Link } from 'react-router-dom'
import { formatDateRange } from '../../lib/dates.js'
import { getTripStatus, STATUS_LABEL } from '../../lib/trips.js'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SectionHeading } from './SectionHeading.jsx'

export function HomeTripRail({ trips, emptyAction }) {
  if (!trips.length) {
    return (
      <section>
        <SectionHeading kicker="Upcoming / recent" />
        <EmptyState
          title="No other trips just now"
          body="When another destination is on file, it will sit here."
          action={emptyAction}
        />
      </section>
    )
  }

  return (
    <section>
      <SectionHeading
        kicker="Upcoming / recent"
        action={
          <Link to="/trips" className="text-ink-subtle hover:text-ink">
            All trips
          </Link>
        }
      />
      <div className="home-rail -mx-5 flex gap-4 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
        {trips.map((trip) => (
          <HomeTripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </section>
  )
}

function HomeTripCard({ trip }) {
  const status = getTripStatus(trip)

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="w-[220px] shrink-0 snap-start rounded-lg border border-line bg-surface px-5 py-5 transition-colors hover:bg-canvas-muted sm:w-[236px]"
    >
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">{STATUS_LABEL[status]}</p>
      <h3 className="font-display mt-3 text-[24px] leading-[1.1] tracking-[-0.035em] text-ink">
        {trip.city || trip.destination}
      </h3>
      {trip.country ? <p className="mt-1 text-[13px] text-ink-muted">{trip.country}</p> : null}
      <p className="mt-4 text-[13px] text-ink-subtle">{formatDateRange(trip.startDate, trip.endDate)}</p>
    </Link>
  )
}
