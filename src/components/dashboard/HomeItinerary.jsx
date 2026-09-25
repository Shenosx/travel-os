import { Link } from 'react-router-dom'
import { formatLongDate, formatShortWeekday } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SectionHeading } from './SectionHeading.jsx'

function groupByDate(items) {
  const groups = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last?.date === item.date) last.items.push(item)
    else groups.push({ date: item.date, items: [item] })
  }
  return groups
}

export function HomeItinerary({ items, tripId, emptyAction }) {
  const groups = groupByDate(items)

  return (
    <section>
      <SectionHeading
        kicker="Upcoming itinerary"
        action={
          tripId ? (
            <Link to={`/trips/${tripId}?tab=itinerary`} className="text-ink-subtle hover:text-ink">
              Full itinerary
            </Link>
          ) : null
        }
      />
      {!items.length ? (
        <EmptyState
          title="Nothing scheduled yet"
          body="Stops for the next trip will appear here, with the date and time."
          action={emptyAction}
        />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <div key={group.date}>
              <p className="text-[13px] text-ink">
                <span className="text-ink-subtle">{formatShortWeekday(group.date)}</span>
                <span className="mx-2 text-ink-subtle">·</span>
                {formatLongDate(group.date).replace(/ \d{4}$/, '')}
              </p>
              <ol className="relative mt-3 space-y-3 border-l border-line pl-4">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/trips/${tripId}?tab=itinerary&item=${item.id}&date=${item.date}`}
                      className="block py-0.5 hover:text-accent"
                    >
                      <p className="text-[12px] tabular-nums tracking-[0.02em] text-ink-subtle">
                        {item.time ? formatTime(item.time) : 'Anytime'}
                      </p>
                      <p className="mt-0.5 text-[15px] text-ink">{item.title}</p>
                      {item.location ? (
                        <p className="mt-0.5 text-[13px] text-ink-muted">{item.location}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
