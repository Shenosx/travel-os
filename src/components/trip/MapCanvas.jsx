import { PLACE_STATUS_LABEL } from '../../lib/places.js'
import { schematicPositions } from '../../lib/travel.js'

export function MapCanvas({
  destination,
  places,
  selectedPlaceId,
  itineraryPlaceId,
  onSelectPlace,
  className = '',
}) {
  const positions = schematicPositions(places)

  return (
    <div className={`relative min-h-[320px] overflow-hidden rounded-lg border border-line bg-canvas-muted ${className}`}>
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in srgb, var(--line) 80%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--line) 80%, transparent) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <p className="relative px-5 pt-5 text-[12px] tracking-[0.16em] text-ink-subtle uppercase">
        {destination}
      </p>
      <p className="relative px-5 pt-1 text-[11px] text-ink-subtle">Schematic map · ready for Mapbox</p>
      {places.map((place) => {
        const position = positions[place.id] ?? { mapX: 50, mapY: 50 }
        const selected = place.id === selectedPlaceId
        const current = place.id === itineraryPlaceId
        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace?.(place.id)}
            className="absolute flex min-h-10 min-w-10 -translate-x-1/2 -translate-y-full flex-col items-center justify-end"
            style={{ left: `${position.mapX}%`, top: `${position.mapY}%` }}
            aria-label={place.name}
          >
            {selected || current ? (
              <span className="mb-1 max-w-[9rem] truncate rounded-sm bg-surface px-2 py-1 text-[11px] text-ink ring-1 ring-line">
                {place.name}
              </span>
            ) : null}
            <span
              className={`block rounded-full ${
                selected || current ? 'h-3 w-3' : 'h-2.5 w-2.5'
              } ${markerClass(place.status, selected, current)}`}
            />
          </button>
        )
      })}
      <ul className="absolute right-4 bottom-4 space-y-1 text-[11px] text-ink-subtle">
        {['saved', 'planned', 'visited'].map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${markerClass(status, false, false)}`} />
            {PLACE_STATUS_LABEL[status]}
          </li>
        ))}
      </ul>
    </div>
  )
}

function markerClass(status, selected, current) {
  if (current) return 'bg-ink ring-2 ring-accent ring-offset-2 ring-offset-canvas-muted'
  if (selected) return 'bg-accent ring-2 ring-accent ring-offset-2 ring-offset-canvas-muted'
  if (status === 'visited') return 'bg-ink-subtle'
  if (status === 'planned') return 'bg-accent'
  return 'bg-canvas ring-2 ring-accent'
}
