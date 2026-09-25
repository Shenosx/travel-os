import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  formatLongDate,
  formatMonthYear,
  formatShortWeekday,
  formatWeekday,
  monthGrid,
  resolveSelectedCalendarDate,
  tripDates,
} from '../../lib/dates.js'
import { indexItineraryItemsByDate } from '../../lib/itinerary.js'
import { IconChevron } from '../icons.jsx'

const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) => formatShortWeekday(addDays('2026-12-07', index)))

function monthCursorFromDate(iso) {
  return iso.slice(0, 7)
}

function shiftMonth(cursor, delta) {
  const [year, month] = cursor.split('-').map(Number)
  const next = new Date(year, month - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

export function ItineraryMonthView({
  trip,
  itinerary,
  selectedDate,
  onSelectDate,
  children,
}) {
  const selected = resolveSelectedCalendarDate(trip, selectedDate)
  const [monthCursor, setMonthCursor] = useState(() => monthCursorFromDate(selected))
  const cellRefs = useRef(new Map())
  const gridRef = useRef(null)

  useEffect(() => {
    setMonthCursor(monthCursorFromDate(selected))
  }, [selected])

  const index = useMemo(() => indexItineraryItemsByDate(itinerary), [itinerary])
  const tripDateSet = useMemo(() => new Set(tripDates(trip)), [trip])
  const [year, month] = monthCursor.split('-').map(Number)
  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const rows = useMemo(() => {
    const next = []
    for (let i = 0; i < cells.length; i += 7) next.push(cells.slice(i, i + 7))
    return next
  }, [cells])

  const monthLabel = formatMonthYear(`${monthCursor}-01`)
  const focusIso = cells.some((cell) => cell.iso === selected)
    ? selected
    : cells.find((cell) => cell.inMonth)?.iso

  useEffect(() => {
    if (!gridRef.current?.contains(document.activeElement)) return
    cellRefs.current.get(selected)?.focus()
  }, [selected, monthCursor])

  function selectIso(iso) {
    onSelectDate?.(iso)
  }

  function onCellKeyDown(event, cellIndex) {
    const columns = 7
    let nextIndex = cellIndex
    if (event.key === 'ArrowRight') nextIndex = cellIndex + 1
    else if (event.key === 'ArrowLeft') nextIndex = cellIndex - 1
    else if (event.key === 'ArrowDown') nextIndex = cellIndex + columns
    else if (event.key === 'ArrowUp') nextIndex = cellIndex - columns
    else if (event.key === 'Home') nextIndex = Math.floor(cellIndex / columns) * columns
    else if (event.key === 'End') nextIndex = Math.floor(cellIndex / columns) * columns + (columns - 1)
    else return
    event.preventDefault()
    const next = cells[nextIndex]
    if (!next) return
    selectIso(next.iso)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[22px] tracking-[-0.03em] text-ink sm:text-[26px]">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Previous month"
            onClick={() => setMonthCursor((current) => shiftMonth(current, -1))}
          >
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Next month"
            onClick={() => setMonthCursor((current) => shiftMonth(current, 1))}
          >
            <IconChevron className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel}
        className="mt-4 w-full min-w-0"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="px-0.5 pb-2 text-center text-[11px] tracking-[0.08em] text-ink-subtle uppercase"
            >
              {label}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row[0].iso} role="row" className="grid grid-cols-7 gap-0.5">
            {row.map((cell) => {
              const cellIndex = cells.findIndex((entry) => entry.iso === cell.iso)
              const count = index.get(cell.iso)?.length ?? 0
              const selectedCell = cell.iso === selected
              const tripCell = tripDateSet.has(cell.iso)
              return (
                <button
                  key={cell.iso}
                  ref={(node) => {
                    if (node) cellRefs.current.set(cell.iso, node)
                    else cellRefs.current.delete(cell.iso)
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={cell.iso === focusIso ? 0 : -1}
                  aria-selected={selectedCell}
                  aria-label={dayLabel(cell.iso, { tripCell, count })}
                  onClick={() => selectIso(cell.iso)}
                  onKeyDown={(event) => onCellKeyDown(event, cellIndex)}
                  className={`flex min-h-11 min-w-0 flex-col items-start gap-1 rounded-md px-1 py-1 text-left sm:min-h-[3.25rem] sm:px-1.5 ${
                    selectedCell
                      ? 'bg-accent-soft text-ink'
                      : tripCell
                        ? 'text-ink'
                        : 'text-ink-subtle'
                  } ${!cell.inMonth && !selectedCell ? 'opacity-45' : ''} ${
                    tripCell && !selectedCell ? 'bg-canvas-muted' : ''
                  }`}
                >
                  <span className="text-[13px] tabular-nums leading-none">{Number(cell.iso.slice(-2))}</span>
                  {count > 0 ? (
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      {Array.from({ length: Math.min(count, 3) }, (_, dot) => (
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
        ))}
      </div>

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

export function ItineraryViewSwitcher({ value, onChange }) {
  return (
    <div role="group" aria-label="Itinerary view" className="inline-flex max-w-full flex-wrap gap-1">
      {[
        { id: 'list', label: 'List' },
        { id: 'month', label: 'Month' },
        { id: 'week', label: 'Week' },
        { id: 'day', label: 'Day' },
      ].map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={`min-h-10 px-2.5 text-[13px] transition-colors ${
              selected ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
