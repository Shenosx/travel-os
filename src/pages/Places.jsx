import { Link, useNavigate } from 'react-router-dom'
import { PlaceCard } from '../components/places/PlaceCard.jsx'
import { usePlaceComposer } from '../components/places/PlaceComposer.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useAppData } from '../hooks/useAppData.jsx'

export function PlacesPage() {
  const navigate = useNavigate()
  const { places, trips, itineraries, users, currentUser } = useAppData()
  const { openCreate } = usePlaceComposer()

  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Places</p>
      <h1 className="font-display mt-2 text-[36px] leading-tight tracking-[-0.04em] sm:text-[44px]">
        Saved places
      </h1>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        Hotels, cafés, and sights attached to trips. Open a card to see it on the trip.
      </p>

      {places.length ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {places.map((place) => {
            const trip = trips.find((item) => item.id === place.tripId)
            const itinerary = itineraries.find((entry) => entry.tripId === place.tripId)
            return (
              <div key={place.id}>
                <PlaceCard
                  place={place}
                  itinerary={itinerary}
                  trip={trip}
                  users={users}
                  currentUserId={currentUser.id}
                  onSelect={() => {
                    if (trip) navigate(`/trips/${trip.id}?tab=places&place=${place.id}`)
                  }}
                />
                {trip ? (
                  <Link
                    to={`/trips/${trip.id}?tab=places&place=${place.id}`}
                    className="mt-2 inline-flex h-10 items-center text-sm text-ink-muted hover:text-ink"
                  >
                    {trip.city}
                  </Link>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-10">
          <EmptyState
            title="No places yet"
            body="Save a hotel, café, or sight so it can live on the trip and the map."
            action={
              <button type="button" className="text-sm text-accent" onClick={() => openCreate()}>
                Add a place
              </button>
            }
          />
        </div>
      )}
    </div>
  )
}
