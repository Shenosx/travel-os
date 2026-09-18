import { Link } from 'react-router-dom'
import { UpcomingHero } from '../components/dashboard/UpcomingHero.jsx'
import { StatGrid } from '../components/dashboard/StatGrid.jsx'
import { useQuickAdd } from '../components/layout/QuickAddButton.jsx'
import { TripCard } from '../components/trips/TripCard.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { getUpcomingBooking } from '../lib/bookings.js'
import { greetingForTime } from '../lib/dates.js'
import { formatMoney } from '../lib/format.js'
import { getNextItineraryItem } from '../lib/itinerary.js'
import { getNextTrip, getTripSpending, getTravelStats, getUpcomingTrips } from '../lib/trips.js'

export function DashboardPage() {
  const { currentUser, trips, expenses, itineraries, bookings } = useAppData()
  const { openAction } = useQuickAdd()
  const nextTrip = getNextTrip(trips)
  const upcoming = getUpcomingTrips(trips).filter((trip) => trip.id !== nextTrip?.id)
  const stats = getTravelStats(trips, expenses)
  const firstName = currentUser.name.split(' ')[0]
  const nextItinerary = nextTrip ? itineraries.find((entry) => entry.tripId === nextTrip.id) : null
  const nextItem = getNextItineraryItem(nextItinerary)
  const nextBooking = nextTrip
    ? getUpcomingBooking(bookings.filter((booking) => booking.tripId === nextTrip.id))
    : null

  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Dashboard</p>
      <h1 className="font-display mt-2 text-[36px] leading-[1.1] tracking-[-0.04em] text-ink sm:text-[44px]">
        {greetingForTime()}, {firstName}
      </h1>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        {nextTrip
          ? `Your next departure is ${nextTrip.destination}. Everything for the week, in one place.`
          : trips.length
            ? 'No upcoming trips just now. The ones on file are still here.'
            : 'The atlas is empty. Start with a destination and dates.'}
      </p>

      {nextTrip ? (
        <div className="mt-10">
          <UpcomingHero
            trip={nextTrip}
            spent={getTripSpending(expenses, nextTrip.id)}
            nextItem={nextItem}
            nextBooking={nextBooking}
          />
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
              <TripCard
                key={trip.id}
                trip={trip}
                spent={getTripSpending(expenses, trip.id)}
                invited={!trip.members.some((member) => member.userId === currentUser.id)}
              />
            ))}
          </div>
        ) : !trips.length ? (
          <EmptyState
            title="No journeys on file yet"
            body="Add a destination when you are ready — dates, people, and the days will follow."
            action={
              <button type="button" className="text-sm text-accent" onClick={() => openAction('trip')}>
                Add a trip
              </button>
            }
          />
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
