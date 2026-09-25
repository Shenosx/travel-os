import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDateRange } from '../../lib/dates.js'
import { filterPlaces, PLACE_STATUS_LABEL } from '../../lib/places.js'
import { EmptyState } from '../ui/EmptyState.jsx'
import { PlaceCard } from './PlaceCard.jsx'
import { usePlaceComposer } from './PlaceComposer.jsx'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'saved', label: PLACE_STATUS_LABEL.saved },
  { id: 'planned', label: PLACE_STATUS_LABEL.planned },
  { id: 'visited', label: PLACE_STATUS_LABEL.visited },
]

const EMPTY_COPY = {
  all: {
    title: 'No places yet',
    bodyAdd: 'Save a hotel, café, or sight so it can appear on the map and in the days.',
    bodyRead: 'Places will appear here once they’re saved.',
  },
  saved: {
    title: 'Nothing saved yet',
    bodyAdd: 'Keep a place here until you decide when to go.',
    bodyRead: 'Saved places will appear in this list.',
  },
  planned: {
    title: 'Nothing planned yet',
    bodyAdd: 'Assign a place to a day to see it here.',
    bodyRead: 'Planned places will appear in this list.',
  },
  visited: {
    title: 'No visited places yet',
    bodyAdd: 'Mark a place as visited after you’ve been.',
    bodyRead: 'Visited places will appear in this list.',
  },
}

export function PlacesPanel({
  trip,
  places,
  itinerary,
  users,
  currentUserId,
  selectedPlaceId,
  onSelectPlace,
  canAdd,
}) {
  const { openCreate, openView } = usePlaceComposer()
  const [status, setStatus] = useState('all')
  const visible = filterPlaces(places, status)
  const empty = EMPTY_COPY[status] ?? EMPTY_COPY.all
  const mapHref = selectedPlaceId
    ? `/trips/${trip.id}?tab=map&place=${selectedPlaceId}`
    : `/trips/${trip.id}?tab=map`

  useEffect(() => {
    if (!selectedPlaceId) return
    document.getElementById(`place-${selectedPlaceId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedPlaceId])

  return (
    <div>
      <Link to={`/trips/${trip.id}`} className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
            {trip.city || trip.destination}
          </h2>
          <p className="mt-2 text-[14px] text-ink-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link
            to={mapHref}
            className="inline-flex min-h-11 items-center text-sm text-ink-subtle hover:text-ink"
          >
            View map
          </Link>
          {canAdd ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm text-accent"
              onClick={() => openCreate(trip.id)}
            >
              Add place
            </button>
          ) : null}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Place status"
        className="home-rail mt-8 -mx-1 flex gap-2 overflow-x-auto pb-1"
      >
        {FILTERS.map((filter) => {
          const selected = status === filter.id
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setStatus(filter.id)}
              className={`min-h-11 shrink-0 rounded-lg px-3.5 text-sm transition-colors ${
                selected ? 'bg-accent-soft text-ink' : 'text-ink-subtle hover:bg-canvas-muted hover:text-ink'
              }`}
            >
              {filter.label}
            </button>
          )
        })}
      </div>

      {visible.length ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {visible.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              itinerary={itinerary}
              trip={trip}
              users={users}
              currentUserId={currentUserId}
              selected={place.id === selectedPlaceId}
              showMapLink
              onSelect={() => {
                onSelectPlace?.(place.id)
                openView(place.id)
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            title={empty.title}
            body={canAdd ? empty.bodyAdd : empty.bodyRead}
            action={
              canAdd ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-sm text-accent"
                  onClick={() => openCreate(trip.id)}
                >
                  Add place
                </button>
              ) : null
            }
          />
        </div>
      )}
    </div>
  )
}
