import { useEffect, useMemo, useRef } from 'react'
import {
  addDays,
  addWeeks,
  formatDateRange,
  formatLongDate,
  formatShortWeekday,
  formatWeekday,
  resolveSelectedCalendarDate,
  tripDates,
} from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { itineraryDaysForWeek } from '../../lib/itinerary.js'
import { IconChevron } from '../icons.jsx'

export function ItineraryWeekView({
  trip,
  itinerary,
  selectedDate,
  onSelectDate,
  selectedItemId,
  onSelectItem,
  children,
}) {
  const selected = resolveSelectedCalendarDate(trip, selectedDate)
  const days = useMemo(() => itineraryDaysForWeek(itinerary, selected), [itinerary, selected])
  const tripDateSet = useMemo(() => new Set(tripDates(trip)), [trip])
  const cellRefs = useRef(new Map())
  const gridRef = useRef(null)
  const weekLabel = formatDateRange(days[0]?.date, days.at(-1)?.date)
  const focusIso = days.some((day) => day.date === selected) ? selected : days[0]?.date

  useEffect(() => {
    if (!gridRef.current?.contains(document.activeElement)) return
    cellRefs.current.get(selected)?.focus()
  }, [selected])

  function selectIso(iso) {
    onSelectDate?.(iso)
  }

  function onCellKeyDown(event, cellIndex) {
    let nextIndex = cellIndex
    if (event.key === 'ArrowRight') nextIndex = cellIndex + 1
    else if (event.key === 'ArrowLeft') nextIndex = cellIndex - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = days.length - 1
    else return
    event.preventDefault()
    const next = days[nextIndex]
    if (!next) return
    selectIso(next.date)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display min-w-0 truncate text-[22px] tracking-[-0.03em] text-ink sm:text-[26px]">
          {weekLabel}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Previous week"
            onClick={() => selectIso(addWeeks(selected, -1))}
          >
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Next week"
            onClick={() => selectIso(addWeeks(selected, 1))}
          >
            <IconChevron className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={gridRef} role="grid" aria-label={weekLabel} className="mt-4 w-full min-w-0 lg:hidden">
        <div role="row" className="grid grid-cols-7 gap-0.5">
          {days.map((day, cellIndex) => {
            const selectedCell = day.date === selected
            const tripCell = tripDateSet.has(day.date)
            return (
              <button
                key={day.date}
                ref={(node) => {
                  if (node) cellRefs.current.set(day.date, node)
                  else cellRefs.current.delete(day.date)
                }}
                type="button"
                role="gridcell"
                tabIndex={day.date === focusIso ? 0 : -1}
                aria-selected={selectedCell}
                aria-label={dayLabel(day.date, { tripCell, count: day.items.length })}
                onClick={() => selectIso(day.date)}
                onKeyDown={(event) => onCellKeyDown(event, cellIndex)}
                className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 ${
                  selectedCell
                    ? 'bg-accent-soft text-ink'
                    : tripCell
                      ? 'bg-canvas-muted text-ink'
                      : 'text-ink-subtle'
                }`}
              >
                <span className="text-[10px] tracking-[0.08em] uppercase">
                  {formatShortWeekday(day.date)}
                </span>
                <span className="text-[13px] tabular-nums leading-none">{Number(day.date.slice(-2))}</span>
                {day.items.length ? (
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    {Array.from({ length: Math.min(day.items.length, 3) }, (_, dot) => (
                      <span
                        key={dot}
                        className={`h-1 w-1 rounded-full ${selectedCell ? 'bg-accent' : 'bg-accent/80'}`}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="h-1" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div
        role="grid"
        aria-label={weekLabel}
        className="mt-4 hidden w-full min-w-0 lg:grid lg:grid-cols-7 lg:gap-2"
      >
        <div role="row" className="contents">
          {days.map((day) => {
            const selectedCell = day.date === selected
            const tripCell = tripDateSet.has(day.date)
            return (
              <div
                key={day.date}
                role="gridcell"
                aria-selected={selectedCell}
                className={`min-w-0 rounded-md px-2 py-2 ${
                  selectedCell
                    ? 'bg-accent-soft'
                    : tripCell
                      ? 'bg-canvas-muted'
                      : ''
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selectedCell}
                  onClick={() => selectIso(day.date)}
                  className={`min-h-11 w-full min-w-0 text-left ${selectedCell ? 'text-accent' : tripCell ? 'text-ink' : 'text-ink-subtle'}`}
                >
                  <span className="block text-[11px] tracking-[0.08em] uppercase">
                    {formatShortWeekday(day.date)}
                  </span>
                  <span className="mt-1 block font-display text-[22px] tabular-nums tracking-[-0.03em] leading-none">
                    {Number(day.date.slice(-2))}
                  </span>
                </button>
                {day.items.length ? (
                  <ol className="mt-3 space-y-2">
                    {day.items.map((item) => {
                      const selectedItem = item.id === selectedItemId
                      return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onSelectItem?.(item, day.date)}
                          className={`w-full min-w-0 rounded-md py-1 text-left ${selectedItem ? 'text-accent' : ''}`}
                        >
                          <span className="block text-[11px] tabular-nums text-ink-subtle">
                            {item.time ? formatTime(item.time) : '—'}
                          </span>
                          <span className={`block truncate text-[13px] ${selectedItem ? 'text-accent' : 'text-ink'}`}>{item.title}</span>
                        </button>
                      </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="mt-3 text-[12px] text-ink-subtle">Open</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <section className="mt-8 lg:hidden" aria-live="polite">
        {children}
      </section>
    </div>
  )
}

export function ItineraryDayView({ trip, selectedDate, onSelectDate, children }) {
  const selected = resolveSelectedCalendarDate(trip, selectedDate)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display min-w-0 truncate text-[22px] tracking-[-0.03em] text-ink sm:text-[26px]">
          {formatWeekday(selected)}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Previous day"
            onClick={() => onSelectDate?.(addDays(selected, -1))}
          >
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Next day"
            onClick={() => onSelectDate?.(addDays(selected, 1))}
          >
            <IconChevron className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-subtle">{formatLongDate(selected)}</p>
      <section className="mt-8" aria-live="polite">
        {children}
      </section>
    </div>
  )
}

function dayLabel(iso, { tripCell, count }) {
  const base = `${formatWeekday(iso)} ${formatLongDate(iso)}`
  const trip = tripCell ? ', trip day' : ''
  if (!count) return `${base}${trip}`
  return `${base}${trip}, ${count} ${count === 1 ? 'stop' : 'stops'}`
}
