import { Link } from 'react-router-dom'
import { UpcomingHero } from '../components/dashboard/UpcomingHero.jsx'
import { StatGrid } from '../components/dashboard/StatGrid.jsx'
import { TripCard } from '../components/trips/TripCard.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { greetingForTime } from '../lib/dates.js'
import { formatMoney } from '../lib/format.js'
import { getNextTrip, getTripSpending, getTravelStats, getUpcomingTrips } from '../lib/trips.js'

export function DashboardPage() {
  const { currentUser, trips, expenses } = useAppData()
  const nextTrip = getNextTrip(trips)
  const upcoming = getUpcomingTrips(trips).filter((trip) => trip.id !== nextTrip?.id)
  const stats = getTravelStats(trips, expenses)
  const firstName = currentUser.name.split(' ')[0]

  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Dashboard</p>
      <h1 className="font-display mt-2 text-[36px] leading-[1.1] tracking-[-0.04em] text-ink sm:text-[44px]">
        {greetingForTime()}, {firstName}
      </h1>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        {nextTrip
          ? `Your next departure is ${nextTrip.destination}. Everything for the week, in one place.`
          : 'No upcoming trips yet. Start one when you are ready.'}
      </p>

      {nextTrip ? (
        <div className="mt-10">
          <UpcomingHero trip={nextTrip} spent={getTripSpending(expenses, nextTrip.id)} />
        </div>
      ) : null}

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">This year</h2>
        </div>
        <StatGrid stats={stats} formatMoney={formatMoney} />
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Upcoming trips</h2>
          <Link to="/trips" className="text-sm text-ink-muted hover:text-ink">
            All trips
          </Link>
        </div>
        {upcoming.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((trip) => (
              <TripCard key={trip.id} trip={trip} spent={getTripSpending(expenses, trip.id)} />
            ))}
          </div>
        ) : (
          <p className="border border-line px-5 py-8 text-sm text-ink-muted">
            {nextTrip
              ? `No other upcoming trips. ${nextTrip.city} is next.`
              : 'Add a trip to begin.'}
          </p>
        )}
      </section>
    </div>
  )
}
