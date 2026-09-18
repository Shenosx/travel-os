import { displayName, getUserById } from '../../data/mock.js'
import { formatPlaceCost, formatPlaceRating, PLACE_STATUS_LABEL, placeSchedule } from '../../lib/places.js'
import { Card } from '../ui/Card.jsx'

export function PlaceCard({
  place,
  itinerary,
  trip,
  users = [],
  currentUserId,
  selected = false,
  onSelect,
}) {
  const schedule = placeSchedule(place, itinerary, trip)
  const author = getUserById(place.createdBy, users)
  const savedBy =
    place.createdBy && place.createdBy !== currentUserId && author
      ? `Saved by ${displayName(author, currentUserId)}`
      : ''
  const meta = [formatPlaceRating(place), formatPlaceCost(place)].filter(Boolean).join(' · ')

  return (
    <Card
      as="button"
      type="button"
      onClick={() => onSelect?.(place)}
      className={`w-full p-5 text-left transition-colors ${
        selected ? 'ring-1 ring-accent' : 'hover:bg-canvas-muted'
      }`}
    >
      <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">
        {PLACE_STATUS_LABEL[place.status] ?? place.status}
      </p>
      <h3 className="font-display mt-2 text-[22px] leading-tight tracking-[-0.03em] text-ink">
        {place.name}
      </h3>
      {place.category ? <p className="mt-1 text-sm text-ink-muted">{place.category}</p> : null}
      {meta ? <p className="mt-3 text-[13px] text-ink-subtle">{meta}</p> : null}
      {schedule.label ? <p className="mt-2 text-[13px] text-ink-muted">{schedule.label}</p> : null}
      {savedBy ? <p className="mt-3 text-[12px] text-ink-subtle">{savedBy}</p> : null}
    </Card>
  )
}
