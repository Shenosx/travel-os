import { Link } from 'react-router-dom'
import { displayName, getUserById } from '../../data/mock.js'
import { formatPlaceCost, formatPlaceRating, PLACE_STATUS_LABEL, placeSchedule } from '../../lib/places.js'

export function PlaceCard({
  place,
  itinerary,
  trip,
  users = [],
  currentUserId,
  selected = false,
  showMapLink = false,
  onSelect,
}) {
  const schedule = placeSchedule(place, itinerary, trip)
  const author = getUserById(place.createdBy, users)
  const savedBy =
    place.createdBy && place.createdBy !== currentUserId && author
      ? `Saved by ${displayName(author, currentUserId)}`
      : ''
  const rating = formatPlaceRating(place)
  const cost = formatPlaceCost(place)
  const meta = [rating, cost].filter(Boolean).join(' · ')
  const location = place.area || place.address || ''
  const itineraryHref =
    trip?.id && schedule.date
      ? `/trips/${trip.id}?tab=itinerary&place=${place.id}&date=${schedule.date}`
      : ''
  const mapHref = trip?.id && showMapLink ? `/trips/${trip.id}?tab=map&place=${place.id}` : ''
  const dayLabel = schedule.label || ''

  return (
    <article
      id={`place-${place.id}`}
      className={`rounded-lg border border-line px-5 py-6 transition-colors ${
        selected ? 'bg-accent-soft' : 'bg-surface hover:bg-canvas-muted'
      }`}
    >
      <button type="button" onClick={() => onSelect?.(place)} className="w-full text-left">
        <p
          className={`text-[11px] tracking-[0.16em] uppercase ${
            selected ? 'text-accent' : place.status === 'visited' ? 'text-ink-subtle' : 'text-ink-subtle'
          }`}
        >
          {PLACE_STATUS_LABEL[place.status] ?? place.status}
          {place.category ? ` · ${place.category}` : ''}
        </p>
        <h3 className="font-display mt-2.5 text-[24px] leading-[1.1] tracking-[-0.03em] text-ink sm:text-[26px]">
          {place.name}
        </h3>
        {location ? <p className="mt-1.5 text-[14px] text-ink-muted">{location}</p> : null}
        {place.notes ? (
          <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-subtle">{place.notes}</p>
        ) : null}
        {meta ? <p className="mt-3 text-[13px] text-ink-subtle">{meta}</p> : null}
        {savedBy ? <p className="mt-3 text-[12px] text-ink-subtle">{savedBy}</p> : null}
      </button>

      {dayLabel || itineraryHref || mapHref ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {itineraryHref ? (
            <Link
              to={itineraryHref}
              className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-hover"
            >
              Itinerary · {dayLabel || 'Open'}
            </Link>
          ) : dayLabel ? (
            <p className="inline-flex min-h-11 items-center text-[13px] text-ink-muted">{dayLabel}</p>
          ) : null}
          {mapHref ? (
            <Link
              to={mapHref}
              className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink"
            >
              Map
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
