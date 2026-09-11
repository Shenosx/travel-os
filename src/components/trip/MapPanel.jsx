import { Card } from '../ui/Card.jsx'

export function MapPanel({ places, destination }) {
  if (!places.length) {
    return (
      <div className="border border-line px-5 py-10 text-center">
        <p className="text-sm text-ink-muted">No saved places yet.</p>
        <p className="mt-1 text-[13px] text-ink-subtle">Pin hotels, cafés, and sights from the add button.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="relative min-h-[340px] overflow-hidden bg-canvas-muted">
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
        {places.map((place) => (
          <div
            key={place.id}
            className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
            style={{ left: `${place.mapX ?? 50}%`, top: `${place.mapY ?? 50}%` }}
          >
            <span className="rounded-sm bg-surface px-2 py-1 text-[11px] text-ink shadow-none ring-1 ring-line">
              {place.name}
            </span>
            <span className="mt-1 h-2 w-2 rounded-full bg-accent" />
          </div>
        ))}
      </Card>

      <ul className="divide-y divide-line border-y border-line">
        {places.map((place) => (
          <li key={place.id} className="py-4">
            <p className="text-sm font-medium text-ink">{place.name}</p>
            <p className="mt-1 text-[13px] text-ink-subtle">
              {[place.category, place.area].filter(Boolean).join(' · ')}
            </p>
            {place.notes ? <p className="mt-1 text-[13px] text-ink-muted">{place.notes}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
