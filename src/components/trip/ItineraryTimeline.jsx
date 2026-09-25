import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  formatDateRange,
  formatLongDate,
  formatShortWeekday,
  formatWeekday,
  resolveSelectedCalendarDate,
  todayIso,
  tripDates,
  tripDayNumber,
} from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { indexItineraryItemsByDate, itineraryAttribution, itinerarySliceForDate } from '../../lib/itinerary.js'
import { travelBetweenItems } from '../../lib/travel.js'
import { EmptyState } from '../ui/EmptyState.jsx'
import { ItineraryMonthView, ItineraryViewSwitcher } from './ItineraryMonthView.jsx'
import { ItineraryDayView, ItineraryWeekView } from './ItineraryWeekView.jsx'
import { ItineraryItemSheet } from './ItineraryItemSheet.jsx'
import { MapCanvas } from './MapCanvas.jsx'

export function ItineraryWorkspace({
  trip,
  itinerary,
  places,
  bookings,
  users,
  currentUserId,
  canEdit,
  selectedItemId,
  selectedPlaceId,
  view = 'list',
  selectedDate,
  onViewChange,
  onSelectDate,
  onSelectItem,
  onSelectPlace,
}) {
  const [showMap, setShowMap] = useState(false)
  const [sheet, setSheet] = useState(null)
  const itineraryPlaceId =
    itinerary?.days?.flatMap((day) => day.items).find((item) => item.id === selectedItemId)?.placeId ??
    selectedPlaceId
  const monthView = view === 'month'
  const weekView = view === 'week'
  const dayView = view === 'day'
  const listView = !monthView && !weekView && !dayView
  const calendarDate = resolveSelectedCalendarDate(trip, selectedDate)
  const tripDays = useMemo(() => daysForTrip(trip, itinerary), [trip, itinerary])
  const monthItems = useMemo(
    () => indexItineraryItemsByDate(itinerary).get(calendarDate) ?? [],
    [itinerary, calendarDate],
  )
  const dayItinerary = useMemo(
    () => itinerarySliceForDate(itinerary, calendarDate),
    [itinerary, calendarDate],
  )
  const calendarDateInTrip = tripDates(trip).includes(calendarDate)
  const calendarDayNumber = tripDayNumber(trip, calendarDate)

  function selectCalendarItem(item, date = calendarDate) {
    onSelectItem?.(item, date)
  }

  function openAdd(date = calendarDate) {
    if (!canEdit) return
    setSheet({ item: null, date })
  }

  function openEdit(item, date) {
    if (!canEdit) return
    setSheet({ item, date })
  }

  return (
    <div>
      <Link to={`/trips/${trip.id}`} className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
            {trip.city || trip.destination}
          </h2>
          <p className="mt-2 text-[14px] text-ink-muted">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <ItineraryViewSwitcher value={listView ? 'list' : view} onChange={onViewChange} />
          {listView ? (
            <button
              type="button"
              className="h-10 text-sm text-accent lg:hidden"
              onClick={() => setShowMap((current) => !current)}
            >
              {showMap ? 'Hide map' : 'View map'}
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className="text-sm text-accent" onClick={() => openAdd(calendarDate)}>
              Add itinerary item
            </button>
          ) : null}
        </div>
      </header>

      <DayRail
        days={tripDays}
        selectedDate={calendarDate}
        onSelectDate={onSelectDate}
      />

      {monthView ? (
        <ItineraryMonthView
          trip={trip}
          itinerary={itinerary}
          selectedDate={calendarDate}
          onSelectDate={onSelectDate}
        >
          <SelectedDayPanel
            trip={trip}
            calendarDate={calendarDate}
            calendarDayNumber={calendarDayNumber}
            calendarDateInTrip={calendarDateInTrip}
            monthItems={monthItems}
            dayItinerary={dayItinerary}
            places={places}
            bookings={bookings}
            users={users}
            currentUserId={currentUserId}
            canEdit={canEdit}
            selectedItemId={selectedItemId}
            onSelectItem={selectCalendarItem}
            onAdd={() => openAdd(calendarDate)}
            onEdit={(item) => openEdit(item, calendarDate)}
          />
        </ItineraryMonthView>
      ) : null}

      {weekView ? (
        <ItineraryWeekView
          trip={trip}
          itinerary={itinerary}
          selectedDate={calendarDate}
          onSelectDate={onSelectDate}
          selectedItemId={selectedItemId}
          onSelectItem={selectCalendarItem}
        >
          <SelectedDayPanel
            trip={trip}
            calendarDate={calendarDate}
            calendarDayNumber={calendarDayNumber}
            calendarDateInTrip={calendarDateInTrip}
            monthItems={monthItems}
            dayItinerary={dayItinerary}
            places={places}
            bookings={bookings}
            users={users}
            currentUserId={currentUserId}
            canEdit={canEdit}
            selectedItemId={selectedItemId}
            onSelectItem={selectCalendarItem}
            onAdd={() => openAdd(calendarDate)}
            onEdit={(item) => openEdit(item, calendarDate)}
          />
        </ItineraryWeekView>
      ) : null}

      {dayView ? (
        <ItineraryDayView trip={trip} selectedDate={calendarDate} onSelectDate={onSelectDate}>
          <SelectedDayPanel
            trip={trip}
            calendarDate={calendarDate}
            calendarDayNumber={calendarDayNumber}
            calendarDateInTrip={calendarDateInTrip}
            monthItems={monthItems}
            dayItinerary={dayItinerary}
            places={places}
            bookings={bookings}
            users={users}
            currentUserId={currentUserId}
            canEdit={canEdit}
            selectedItemId={selectedItemId}
            onSelectItem={selectCalendarItem}
            onAdd={() => openAdd(calendarDate)}
            onEdit={(item) => openEdit(item, calendarDate)}
            showEmptyHeader={false}
          />
        </ItineraryDayView>
      ) : null}

      {listView ? (
        <div className="lg:grid lg:grid-cols-[1.15fr_0.9fr] lg:items-start lg:gap-12">
          <ItineraryTimeline
            trip={trip}
            itinerary={itinerary}
            days={tripDays}
            places={places}
            bookings={bookings}
            users={users}
            currentUserId={currentUserId}
            canEdit={canEdit}
            selectedItemId={selectedItemId}
            selectedDate={calendarDate}
            onSelectItem={selectCalendarItem}
            onAdd={openAdd}
            onEdit={openEdit}
          />
          <div className={`lg:sticky lg:top-8 ${showMap ? 'mt-8 block' : 'hidden lg:block'}`}>
            <MapCanvas
              destination={trip.destination}
              places={places}
              selectedPlaceId={selectedPlaceId}
              itineraryPlaceId={itineraryPlaceId}
              onSelectPlace={onSelectPlace}
              className="min-h-[420px]"
            />
          </div>
        </div>
      ) : null}

      {sheet ? (
        <ItineraryItemSheet
          trip={trip}
          days={tripDays}
          places={places}
          bookings={bookings}
          item={sheet.item}
          date={sheet.date}
          onClose={() => setSheet(null)}
          onSaved={(saved, date) => selectCalendarItem(saved, date)}
        />
      ) : null}
    </div>
  )
}

export function ItineraryTimeline({
  trip,
  itinerary,
  days,
  places = [],
  bookings = [],
  users = [],
  currentUserId,
  canEdit = false,
  selectedItemId,
  selectedDate,
  onSelectItem,
  onAdd,
  onEdit,
}) {
  const sections = days ?? daysForTrip(trip, itinerary)
  const selectedRef = useRef(null)

  useEffect(() => {
    if (!selectedDate) return
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedDate])

  if (!sections.length) {
    return (
      <EmptyState
        title="No days planned yet"
        body={canEdit ? 'Add the first stop when the day is known.' : 'The days will appear here once they’re planned.'}
        action={canEdit ? <AddStopButton onClick={() => onAdd?.()} /> : null}
      />
    )
  }

  return (
    <div className="space-y-12">
      {sections.map((day) => {
        const selected = day.date === selectedDate
        return (
          <section
            key={day.date}
            id={`itinerary-day-${day.date}`}
            ref={selected ? selectedRef : undefined}
          >
            <DayHeader day={day} selected={selected} />
            {day.items.length ? (
              <DayTimeline
                tripId={trip?.id}
                day={day}
                places={places}
                bookings={bookings}
                users={users}
                currentUserId={currentUserId}
                canEdit={canEdit}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
                onEdit={onEdit}
              />
            ) : (
              <EmptyState
                title="Nothing planned"
                body="This day is still open."
                action={canEdit ? <AddStopButton onClick={() => onAdd?.(day.date)} /> : null}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}

function SelectedDayPanel({
  trip,
  calendarDate,
  calendarDayNumber,
  calendarDateInTrip,
  monthItems,
  dayItinerary,
  places,
  bookings,
  users,
  currentUserId,
  canEdit,
  selectedItemId,
  onSelectItem,
  onAdd,
  onEdit,
  showEmptyHeader = true,
}) {
  if (monthItems.length) {
    return (
      <>
        <ItineraryTimeline
          trip={trip}
          itinerary={dayItinerary}
          days={dayItinerary.days}
          places={places}
          bookings={bookings}
          users={users}
          currentUserId={currentUserId}
          canEdit={canEdit}
          selectedItemId={selectedItemId}
          selectedDate={calendarDate}
          onSelectItem={onSelectItem}
          onAdd={onAdd}
          onEdit={onEdit}
        />
        {canEdit && calendarDateInTrip ? (
          <p className="mt-6">
            <AddStopButton onClick={onAdd} />
          </p>
        ) : null}
      </>
    )
  }

  return (
    <>
      {showEmptyHeader ? (
        <header className="mb-5">
          {calendarDayNumber ? (
            <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Day {calendarDayNumber}</p>
          ) : (
            <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Outside the trip</p>
          )}
          <h4 className="font-display mt-1 text-[22px] tracking-[-0.03em] text-ink">
            {formatWeekday(calendarDate)}
          </h4>
          <p className="mt-0.5 text-sm text-ink-subtle">{formatLongDate(calendarDate)}</p>
        </header>
      ) : calendarDayNumber ? (
        <p className="mb-5 text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Day {calendarDayNumber}</p>
      ) : (
        <p className="mb-5 text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Outside the trip</p>
      )}
      <EmptyState
        title="Nothing planned"
        body={calendarDateInTrip ? 'This day is still open.' : 'This date sits outside the trip.'}
        action={canEdit && calendarDateInTrip ? <AddStopButton onClick={onAdd} /> : null}
      />
    </>
  )
}

function DayRail({ days, selectedDate, onSelectDate }) {
  const railRef = useRef(null)
  const today = todayIso()

  useEffect(() => {
    const selected = railRef.current?.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selectedDate])

  if (!days.length) return null

  return (
    <div
      ref={railRef}
      className="home-rail mt-8 -mx-1 flex gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label="Trip days"
    >
      {days.map((day) => {
        const selected = day.date === selectedDate
        const completed = day.date < today
        const current = day.date === today
        return (
          <button
            key={day.date}
            type="button"
            role="tab"
            aria-selected={selected}
            data-selected={selected ? 'true' : undefined}
            onClick={() => onSelectDate?.(day.date)}
            className={`min-h-16 w-[4.75rem] shrink-0 rounded-lg px-2 py-2.5 text-left transition-colors sm:w-[5.25rem] sm:px-2.5 ${
              selected
                ? 'bg-accent-soft text-ink'
                : completed
                  ? 'text-ink-muted hover:bg-canvas-muted'
                  : 'text-ink hover:bg-canvas-muted'
            }`}
          >
            <span
              className={`block text-[10px] tracking-[0.14em] uppercase ${
                selected ? 'text-accent' : current ? 'text-accent' : 'text-ink-subtle'
              }`}
            >
              Day {day.dayNumber}
            </span>
            <span className="font-display mt-1 block text-[22px] leading-none tracking-[-0.04em] tabular-nums">
              {Number(day.date.slice(-2))}
            </span>
            <span className="mt-1 block text-[11px] text-ink-subtle">{formatShortWeekday(day.date)}</span>
          </button>
        )
      })}
    </div>
  )
}

function DayHeader({ day, selected }) {
  return (
    <header className="mb-6">
      <p className={`text-[11px] tracking-[0.16em] uppercase ${selected ? 'text-accent' : 'text-ink-subtle'}`}>
        Day {day.dayNumber}
      </p>
      <h3 className="font-display mt-1.5 text-[26px] leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">
        {day.title || formatWeekday(day.date)}
      </h3>
      <p className="mt-1 text-[14px] text-ink-subtle">
        {formatWeekday(day.date)}, {formatLongDate(day.date)}
      </p>
    </header>
  )
}

function DayTimeline({
  tripId,
  day,
  places,
  bookings,
  users,
  currentUserId,
  canEdit,
  selectedItemId,
  onSelectItem,
  onEdit,
}) {
  return (
    <ol>
      {day.items.map((item, index) => {
        const last = index === day.items.length - 1
        const attribution = itineraryAttribution(item, users, currentUserId)
        const resolved = resolveItem(item, places, bookings)
        const travel = !last ? travelBetweenItems(item, day.items[index + 1], places) : null
        const selected = item.id === selectedItemId
        return (
          <li key={item.id}>
            <div
              className={`grid w-full grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-x-5 ${
                selected ? 'rounded-lg bg-accent-soft/70' : ''
              }`}
            >
              <p className="pt-0.5 text-right text-[13px] tabular-nums tracking-[0.01em] text-ink-subtle">
                {item.time ? formatTime(item.time) : '—'}
              </p>
              <div className={`relative border-l border-line pl-5 sm:pl-6 ${last ? 'border-transparent pb-0' : 'pb-8'}`}>
                <span
                  className={`absolute top-[8px] -left-[4px] h-2 w-2 rounded-full border ${
                    selected ? 'border-accent bg-accent' : 'border-accent bg-surface'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => onSelectItem?.(item, day.date)}
                  className="w-full min-w-0 text-left"
                >
                  <p className="text-[17px] leading-snug tracking-[-0.02em] text-ink">{resolved.title}</p>
                  {resolved.location ? (
                    <p className="mt-1 text-[14px] text-ink-muted">{resolved.location}</p>
                  ) : null}
                  {item.notes ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-subtle">{item.notes}</p> : null}
                  {attribution ? <p className="mt-1.5 text-[12px] text-ink-subtle">{attribution}</p> : null}
                </button>

                {resolved.place || resolved.booking || canEdit ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {resolved.place ? (
                      <Link
                        to={`/trips/${tripId}?tab=places&place=${resolved.place.id}`}
                        className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-hover"
                      >
                        Place · {resolved.place.name}
                      </Link>
                    ) : null}
                    {resolved.booking ? (
                      <Link
                        to={`/trips/${tripId}?tab=bookings&booking=${resolved.booking.id}`}
                        className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-hover"
                      >
                        Booking · {resolved.booking.title}
                      </Link>
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink"
                        onClick={() => onEdit?.(item, day.date)}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {travel?.label ? (
              <p className="my-1 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-x-5">
                <span />
                <span className="pl-5 text-[12px] text-ink-subtle sm:pl-6">↓ {travel.label}</span>
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function AddStopButton({ onClick }) {
  return (
    <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={onClick}>
      Add itinerary item
    </button>
  )
}

function daysForTrip(trip, itinerary) {
  if (!trip) return itinerary?.days ?? []
  return tripDates(trip).map((date) => {
    const existing = itinerary?.days?.find((day) => day.date === date)
    return {
      date,
      dayNumber: tripDayNumber(trip, date) ?? existing?.dayNumber ?? 0,
      title: existing?.title ?? '',
      items: existing?.items ?? [],
    }
  })
}

function resolveItem(item, places, bookings) {
  const place = item.placeId ? places.find((entry) => entry.id === item.placeId) : null
  const booking = item.bookingId ? bookings.find((entry) => entry.id === item.bookingId) : null
  const title = item.title || place?.name || booking?.title || ''
  const location =
    item.place && item.place !== title
      ? item.place
      : place?.name && place.name !== title
        ? place.name
        : booking?.provider && booking.provider !== title
          ? booking.provider
          : ''
  return { title, location, place, booking }
}
