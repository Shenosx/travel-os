import { useState } from 'react'
import { filterPlaces, PLACE_STATUS_LABEL } from '../../lib/places.js'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { PlaceCard } from './PlaceCard.jsx'
import { usePlaceComposer } from './PlaceComposer.jsx'

const FILTERS = ['all', 'saved', 'planned', 'visited']

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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto">
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              className={`h-10 shrink-0 px-3 text-sm ${
                status === id ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'
              }`}
            >
              {id === 'all' ? 'All' : PLACE_STATUS_LABEL[id]}
            </button>
          ))}
        </div>
        {canAdd ? (
          <Button size="sm" variant="outline" onClick={() => openCreate(trip.id)}>
            Add place
          </Button>
        ) : null}
      </div>

      {visible.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {visible.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              itinerary={itinerary}
              trip={trip}
              users={users}
              currentUserId={currentUserId}
              selected={place.id === selectedPlaceId}
              onSelect={() => {
                onSelectPlace?.(place.id)
                openView(place.id)
              }}
            />
          ))}
        </div>
      ) : !places.length ? (
        <div className="mt-6">
          <EmptyState
            title="No places yet"
            body={
              canAdd
                ? 'Save a hotel, café, or sight so it can appear on the map and in the days.'
                : 'Places will appear here once they’re saved.'
            }
            action={
              canAdd ? (
                <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip.id)}>
                  Add a place
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="mt-6 border border-line px-5 py-10 text-center">
          <p className="text-sm text-ink-muted">No places in this list yet.</p>
          <p className="mt-1 text-[13px] text-ink-subtle">Try another filter, or save a new place.</p>
        </div>
      )}
    </div>
  )
}
