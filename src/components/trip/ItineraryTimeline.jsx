import { useMemo, useState } from 'react'
import { formatLongDate, formatWeekday, resolveSelectedCalendarDate, tripDates, tripDayNumber } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { indexItineraryItemsByDate, itineraryAttribution, itinerarySliceForDate } from '../../lib/itinerary.js'
import { travelBetweenItems } from '../../lib/travel.js'
import { useQuickAdd } from '../layout/QuickAddButton.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { ItineraryMonthView, ItineraryViewSwitcher } from './ItineraryMonthView.jsx'
import { ItineraryDayView, ItineraryWeekView } from './ItineraryWeekView.jsx'
import { MapCanvas } from './MapCanvas.jsx'

const CATEGORY_LABEL = {
  arrival: 'Arrival',
  departure: 'Departure',
  lodging: 'Stay',
  food: 'Food',
  sight: 'Place',
  transport: 'Transit',
  free: 'Open',
}

export function ItineraryTimeline({
  itinerary,
  places = [],
  bookings = [],
  users = [],
  currentUserId,
  canEdit = false,
  selectedItemId,
  onSelectItem,
}) {
  if (!itinerary?.days?.length) {
    return (
      <EmptyState
        title="No days planned yet"
        body={canEdit ? 'Drop in the first stop — a place, a booking, or a free hour.' : 'The days will appear here once they’re planned.'}
        action={
          canEdit ? (
            <AddStopButton />
          ) : null
        }
      />
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
              const resolved = resolveItem(item, places, bookings)
              const travel = !last ? travelBetweenItems(item, day.items[index + 1], places) : null
              const selected = item.id === selectedItemId
              const Tag = onSelectItem ? 'button' : 'div'
              return (
                <li key={item.id}>
                  <Tag
                    type={onSelectItem ? 'button' : undefined}
                    onClick={onSelectItem ? () => onSelectItem(item) : undefined}
                    className={`grid w-full grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 text-left sm:grid-cols-[3.75rem_minmax(0,1fr)] sm:gap-x-5 ${
                      selected ? 'rounded-md bg-canvas-muted' : ''
                    }`}
                  >
                    <p className="pt-0.5 text-right text-[13px] text-ink-subtle tabular-nums">
                      {item.time ? formatTime(item.time) : '—'}
                    </p>
                    <div className={`relative border-l border-line pl-5 sm:pl-6 ${last ? 'border-transparent pb-0' : 'pb-7'}`}>
                      <span
                        className={`absolute top-[7px] -left-[4.5px] h-[9px] w-[9px] rounded-full border ${
                          selected ? 'border-accent bg-accent' : 'border-accent bg-canvas'
                        }`}
                      />
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="text-[16px] font-medium tracking-[-0.02em] text-ink">{resolved.title}</p>
                        <span className="text-[11px] tracking-[0.1em] text-ink-subtle uppercase">
                          {CATEGORY_LABEL[item.category] ?? item.category}
                        </span>
                      </div>
                      {resolved.subtitle ? <p className="mt-1 text-sm text-ink-muted">{resolved.subtitle}</p> : null}
                      {item.notes ? <p className="mt-1 text-[13px] text-ink-subtle">{item.notes}</p> : null}
                      {attribution ? (
                        <p className="mt-1.5 text-[12px] text-ink-subtle">{attribution}</p>
                      ) : null}
                    </div>
                  </Tag>
                  {travel?.label ? (
                    <p className="my-1 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.75rem_minmax(0,1fr)] sm:gap-x-5">
                      <span />
                      <span className="pl-5 text-[12px] text-ink-subtle sm:pl-6">↓ {travel.label}</span>
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

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
  const itineraryPlaceId =
    itinerary?.days?.flatMap((day) => day.items).find((item) => item.id === selectedItemId)?.placeId ??
    selectedPlaceId
  const monthView = view === 'month'
  const weekView = view === 'week'
  const dayView = view === 'day'
  const listView = !monthView && !weekView && !dayView
  const calendarDate = resolveSelectedCalendarDate(trip, selectedDate)
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Itinerary</p>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
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
        </div>
      </div>

      {monthView ? (
        <ItineraryMonthView
          trip={trip}
          itinerary={itinerary}
          selectedDate={calendarDate}
          onSelectDate={onSelectDate}
        >
          <SelectedDayPanel
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
          />
        </ItineraryWeekView>
      ) : null}

      {dayView ? (
        <ItineraryDayView
          trip={trip}
          selectedDate={calendarDate}
          onSelectDate={onSelectDate}
        >
          <SelectedDayPanel
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
            showEmptyHeader={false}
          />
        </ItineraryDayView>
      ) : null}

      {listView ? (
        <div className="lg:grid lg:grid-cols-[1.15fr_0.9fr] lg:items-start lg:gap-10">
          <ItineraryTimeline
            itinerary={itinerary}
            places={places}
            bookings={bookings}
            users={users}
            currentUserId={currentUserId}
            canEdit={canEdit}
            selectedItemId={selectedItemId}
            onSelectItem={selectCalendarItem}
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
    </div>
  )
}

function SelectedDayPanel({
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
  showEmptyHeader = true,
}) {
  if (monthItems.length) {
    return (
      <>
        <ItineraryTimeline
          itinerary={dayItinerary}
          places={places}
          bookings={bookings}
          users={users}
          currentUserId={currentUserId}
          canEdit={canEdit}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
        />
        {canEdit && calendarDateInTrip ? (
          <p className="mt-6">
            <AddStopButton />
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
            <p className="text-[12px] tracking-[0.16em] text-accent uppercase">Day {calendarDayNumber}</p>
          ) : (
            <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Outside the trip</p>
          )}
          <h4 className="font-display mt-1 text-[22px] tracking-[-0.03em] text-ink">
            {formatWeekday(calendarDate)}
          </h4>
          <p className="mt-0.5 text-sm text-ink-subtle">{formatLongDate(calendarDate)}</p>
        </header>
      ) : calendarDayNumber ? (
        <p className="mb-5 text-[12px] tracking-[0.16em] text-accent uppercase">Day {calendarDayNumber}</p>
      ) : (
        <p className="mb-5 text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Outside the trip</p>
      )}
      <EmptyState
        title="Nothing planned"
        body={calendarDateInTrip ? 'This day is still open.' : 'This date sits outside the trip.'}
        action={canEdit && calendarDateInTrip ? <AddStopButton /> : null}
      />
    </>
  )
}

function AddStopButton() {
  const { openAction } = useQuickAdd()
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center text-sm text-accent"
      onClick={() => openAction('itinerary')}
    >
      Add a stop
    </button>
  )
}

function resolveItem(item, places, bookings) {
  const place = item.placeId ? places.find((entry) => entry.id === item.placeId) : null
  const booking = item.bookingId ? bookings.find((entry) => entry.id === item.bookingId) : null
  const title = item.title || place?.name || booking?.title || ''
  const subtitleParts = []
  if (place?.name && place.name !== title) subtitleParts.push(place.name)
  else if (!place && item.place && item.place !== title) subtitleParts.push(item.place)
  if (booking?.title && booking.title !== title) subtitleParts.push(booking.title)
  else if (booking?.provider && booking.provider !== title) subtitleParts.push(booking.provider)
  return { title, subtitle: subtitleParts[0] || '', place, booking }
}
