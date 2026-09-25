import { SectionHeading } from '../components/dashboard/SectionHeading.jsx'
import { useQuickAdd } from '../components/layout/QuickAddButton.jsx'
import { CloudTripsSection } from '../components/trips/CloudTripsSection.jsx'
import { TripCollectionCard } from '../components/trips/TripCollectionCard.jsx'
import { Button } from '../components/ui/Button.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { useCloudTrips } from '../hooks/useCloudTrips.js'
import { getNextTrip, getTripStatus } from '../lib/trips.js'

function tripSummary(trip, itineraries, places, expenses) {
  const itinerary = itineraries.find((entry) => entry.tripId === trip.id)
  const stops = itinerary?.days?.reduce((count, day) => count + (day.items?.length ?? 0), 0) ?? 0
  const placeCount = places.filter((place) => place.tripId === trip.id).length
  const expenseCount = expenses.filter((expense) => expense.tripId === trip.id).length
  const parts = []
  if (stops) parts.push(`${stops} ${stops === 1 ? 'stop' : 'stops'}`)
  if (placeCount) parts.push(`${placeCount} ${placeCount === 1 ? 'place' : 'places'}`)
  if (expenseCount) parts.push(`${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'}`)
  return parts.join(' · ')
}

export function TripsPage() {
  const { trips, expenses, itineraries, places, currentUser } = useAppData()
  const cloud = useCloudTrips()
  const { openAction } = useQuickAdd()
  const nextTrip = getNextTrip(trips)
  const upcoming = trips
    .filter((trip) => getTripStatus(trip) !== 'completed')
    .slice()
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  const past = trips
    .filter((trip) => getTripStatus(trip) === 'completed')
    .slice()
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
  const otherUpcoming = upcoming.filter((trip) => trip.id !== nextTrip?.id)

  function summaryFor(trip) {
    return tripSummary(trip, itineraries, places, expenses)
  }

  function invited(trip) {
    return !trip.members.some((member) => member.userId === currentUser.id)
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[44px]">
            Trips
          </h1>
          <p className="mt-2 max-w-[36ch] text-[14px] text-ink-muted">Places, plans, and memories.</p>
        </div>
        <Button onClick={() => openAction('trip')}>+ New trip</Button>
      </header>

      {!trips.length ? (
        <div className="mt-12">
          <EmptyState
            className="px-6 py-16"
            title="No journeys on file yet"
            body="Start with a destination and dates. The days, places, and notes can follow."
            action={
              <button type="button" className="text-sm text-accent" onClick={() => openAction('trip')}>
                Create your first trip
              </button>
            }
          />
        </div>
      ) : (
        <>
          <section className="mt-12 lg:mt-14">
            <SectionHeading kicker="Upcoming" />
            {upcoming.length ? (
              <div className="space-y-4">
                {nextTrip && getTripStatus(nextTrip) !== 'completed' ? (
                  <TripCollectionCard
                    trip={nextTrip}
                    summary={summaryFor(nextTrip)}
                    featured
                    invited={invited(nextTrip)}
                  />
                ) : null}
                {otherUpcoming.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {otherUpcoming.map((trip) => (
                      <TripCollectionCard
                        key={trip.id}
                        trip={trip}
                        summary={summaryFor(trip)}
                        invited={invited(trip)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No upcoming trips"
                body="When the next destination is set, it will wait here."
                action={
                  <button type="button" className="text-sm text-accent" onClick={() => openAction('trip')}>
                    Create a trip
                  </button>
                }
              />
            )}
          </section>

          <section className="mt-14 lg:mt-16">
            <SectionHeading kicker="Past" />
            {past.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {past.map((trip) => (
                  <TripCollectionCard
                    key={trip.id}
                    trip={trip}
                    summary={summaryFor(trip)}
                    invited={invited(trip)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-ink-subtle">No past trips yet. Finished journeys will collect here.</p>
            )}
          </section>
        </>
      )}

      {cloud.visible ? (
        <div className="mt-16 border-t border-line pt-12 lg:mt-20">
          <CloudTripsSection
            trips={cloud.trips}
            loading={cloud.loading}
            error={cloud.error}
            currentUserId={cloud.currentUserId}
            onCreate={cloud.createTrip}
            onUpdate={cloud.updateTrip}
            onDelete={cloud.deleteTrip}
            onReload={cloud.reload}
          />
        </div>
      ) : null}
    </div>
  )
}
