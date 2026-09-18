import { useMemo, useState } from 'react'
import { useQuickAdd } from '../components/layout/QuickAddButton.jsx'
import { CloudTripsSection } from '../components/trips/CloudTripsSection.jsx'
import { TripCard } from '../components/trips/TripCard.jsx'
import { Button } from '../components/ui/Button.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { useCloudTrips } from '../hooks/useCloudTrips.js'
import { getTripSpending, getTripStatus } from '../lib/trips.js'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'shared', label: 'Shared' },
]

export function TripsPage() {
  const { trips, expenses, currentUser } = useAppData()
  const cloud = useCloudTrips()
  const { openAction } = useQuickAdd()
  const [filter, setFilter] = useState('all')

  const visible = useMemo(() => {
    return trips
      .filter((trip) => {
        if (filter === 'upcoming') return getTripStatus(trip) !== 'completed'
        if (filter === 'completed') return getTripStatus(trip) === 'completed'
        if (filter === 'shared') return trip.visibility === 'shared'
        return true
      })
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  }, [filter, trips])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Trips</p>
          <h1 className="font-display mt-2 text-[36px] leading-tight tracking-[-0.04em] sm:text-[44px]">
            All journeys
          </h1>
        </div>
        <p className="max-w-[32ch] text-sm text-ink-muted">
          {trips.length} {trips.length === 1 ? 'trip' : 'trips'} on file. Create the next one from the add button.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const selected = item.id === filter
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                selected ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {visible.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {visible.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              spent={getTripSpending(expenses, trip.id)}
              invited={!trip.members.some((member) => member.userId === currentUser.id)}
            />
          ))}
        </div>
      ) : !trips.length ? (
        <div className="mt-8">
          <EmptyState
            title="No journeys on file yet"
            body="Start with a destination and dates. The rest of the trip can follow."
            action={
              <button type="button" className="text-sm text-accent" onClick={() => openAction('trip')}>
                Add a trip
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 border border-line px-5 py-12 text-center">
          <p className="text-sm text-ink-muted">Nothing in this view.</p>
          <Button className="mt-4" variant="outline" onClick={() => setFilter('all')}>
            Show all trips
          </Button>
        </div>
      )}

      {cloud.visible ? (
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
      ) : null}
    </div>
  )
}
