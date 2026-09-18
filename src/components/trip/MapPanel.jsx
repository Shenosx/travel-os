import { PlaceCard } from '../places/PlaceCard.jsx'
import { usePlaceComposer } from '../places/PlaceComposer.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { MapCanvas } from './MapCanvas.jsx'

export function MapPanel({
  trip,
  places,
  itinerary,
  users,
  currentUserId,
  selectedPlaceId,
  itineraryPlaceId,
  onSelectPlace,
  canAdd,
}) {
  const { openView, openCreate } = usePlaceComposer()

  if (!places.length) {
    return (
      <EmptyState
        title="No places yet"
        body="Pin hotels, cafés, and sights so they can sit on this map."
        action={
          canAdd ? (
            <button type="button" className="text-sm text-accent" onClick={() => openCreate(trip.id)}>
              Add a place
            </button>
          ) : null
        }
      />
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <MapCanvas
        destination={trip.destination}
        places={places}
        selectedPlaceId={selectedPlaceId}
        itineraryPlaceId={itineraryPlaceId}
        onSelectPlace={onSelectPlace}
        className="min-h-[360px]"
      />
      <ul className="grid gap-4">
        {places.map((place) => (
          <li key={place.id}>
            <PlaceCard
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
          </li>
        ))}
      </ul>
    </div>
  )
}
