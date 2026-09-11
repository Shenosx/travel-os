import { Link } from 'react-router-dom'
import { useAppData } from '../hooks/useAppData.jsx'

export function PlacesPage() {
  const { places, trips } = useAppData()

  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Places</p>
      <h1 className="font-display mt-2 text-[36px] leading-tight tracking-[-0.04em] sm:text-[44px]">
        Saved places
      </h1>
      <p className="mt-3 max-w-[46ch] text-[15px] text-ink-muted">
        Hotels, cafés, and sights attached to trips. Bookings and photos will live here later.
      </p>

      <ul className="mt-10 divide-y divide-line border-y border-line">
        {places.map((place) => {
          const trip = trips.find((item) => item.id === place.tripId)
          return (
            <li key={place.id} className="flex flex-wrap items-baseline justify-between gap-3 py-4">
              <div>
                <p className="text-[16px] font-medium text-ink">{place.name}</p>
                <p className="mt-1 text-[13px] text-ink-subtle">
                  {[place.category, place.area].filter(Boolean).join(' · ')}
                </p>
              </div>
              {trip ? (
                <Link to={`/trips/${trip.id}?tab=map`} className="text-sm text-ink-muted hover:text-ink">
                  {trip.city}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
