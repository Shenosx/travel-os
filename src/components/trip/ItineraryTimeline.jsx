import { formatLongDate, formatWeekday } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { itineraryAttribution } from '../../lib/itinerary.js'

const CATEGORY_LABEL = {
  arrival: 'Arrival',
  departure: 'Departure',
  lodging: 'Stay',
  food: 'Food',
  sight: 'Place',
  transport: 'Transit',
  free: 'Open',
}

export function ItineraryTimeline({ itinerary, users = [], currentUserId }) {
  if (!itinerary?.days?.length) {
    return (
      <div className="border border-line px-5 py-10 text-center">
        <p className="text-sm text-ink-muted">No days planned yet.</p>
        <p className="mt-1 text-[13px] text-ink-subtle">Use the add button to drop in the first stop.</p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {itinerary.days.map((day) => (
        <section key={day.date}>
          <header className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-[12px] tracking-[0.16em] text-accent uppercase">Day {day.dayNumber}</p>
            <h3 className="font-display text-[26px] tracking-[-0.03em] text-ink">
              {day.title || formatWeekday(day.date)}
            </h3>
            <p className="text-sm text-ink-subtle">
              {formatWeekday(day.date)}, {formatLongDate(day.date)}
            </p>
          </header>

          <ol>
            {day.items.map((item, index) => {
              const last = index === day.items.length - 1
              const attribution = itineraryAttribution(item, users, currentUserId)
              return (
                <li
                  key={item.id}
                  className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.75rem_minmax(0,1fr)] sm:gap-x-5"
                >
                  <p className="pt-0.5 text-right text-[13px] text-ink-subtle tabular-nums">
                    {item.time ? formatTime(item.time) : '—'}
                  </p>
                  <div className={`relative border-l border-line pl-5 sm:pl-6 ${last ? 'border-transparent pb-0' : 'pb-7'}`}>
                    <span className="absolute top-[7px] -left-[4.5px] h-[9px] w-[9px] rounded-full border border-accent bg-canvas" />
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-[16px] font-medium tracking-[-0.02em] text-ink">{item.title}</p>
                      <span className="text-[11px] tracking-[0.1em] text-ink-subtle uppercase">
                        {CATEGORY_LABEL[item.category] ?? item.category}
                      </span>
                    </div>
                    {item.place ? <p className="mt-1 text-sm text-ink-muted">{item.place}</p> : null}
                    {item.notes ? <p className="mt-1 text-[13px] text-ink-subtle">{item.notes}</p> : null}
                    {attribution ? (
                      <p className="mt-1.5 text-[12px] text-ink-subtle">{attribution}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
