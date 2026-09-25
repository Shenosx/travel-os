import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../../hooks/useAppData.jsx'
import { formatQuietDate, tripDates, tripDayNumber } from '../../lib/dates.js'
import { canOnTrip } from '../../lib/permissions.js'
import { formatPlaceCost, formatPlaceRating, PLACE_STATUS_LABEL, placeSchedule } from '../../lib/places.js'
import { getNextTrip } from '../../lib/trips.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { PlaceForm } from './PlaceForm.jsx'

const PlaceComposerContext = createContext(null)

export function PlaceComposerProvider({ children }) {
  const [session, setSession] = useState(null)

  const value = useMemo(
    () => ({
      openCreate: (tripId) => setSession({ type: 'create', tripId: tripId ?? null }),
      openEdit: (placeId) => setSession({ type: 'edit', placeId }),
      openView: (placeId) => setSession({ type: 'view', placeId }),
      close: () => setSession(null),
      session,
    }),
    [session],
  )

  return (
    <PlaceComposerContext.Provider value={value}>
      {children}
      {session ? <PlaceComposerSheet /> : null}
    </PlaceComposerContext.Provider>
  )
}

export function usePlaceComposer() {
  const context = useContext(PlaceComposerContext)
  if (!context) throw new Error('usePlaceComposer must be used within PlaceComposerProvider')
  return context
}

function tripIdFromPath(pathname) {
  const match = pathname.match(/^\/trips\/([^/]+)/)
  return match?.[1] ?? null
}

function PlaceComposerSheet() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, close, openEdit, openView } = usePlaceComposer()
  const {
    trips,
    places,
    itineraries,
    currentUser,
    addPlace,
    updatePlace,
    deletePlace,
    markPlaceVisited,
    addPlaceToItinerary,
    movePlaceToDay,
    permissionsFor,
  } = useAppData()

  const formIdentity =
    session?.type === 'edit' ? `edit-${session.placeId}` : session?.type === 'create' ? `create-${session.tripId}` : 'view'
  const [dirty, setDirty] = useState(false)
  const [dirtyFor, setDirtyFor] = useState(formIdentity)
  if (dirtyFor !== formIdentity) {
    setDirtyFor(formIdentity)
    setDirty(false)
  }

  const place = session?.placeId ? places.find((item) => item.id === session.placeId) : null
  const contextTripId = tripIdFromPath(location.pathname)
  const creatableTrips = trips.filter((trip) => canOnTrip(trip, currentUser.id, 'addPlace'))
  const defaultTripId =
    (session?.tripId && creatableTrips.some((trip) => trip.id === session.tripId) ? session.tripId : null) ||
    place?.tripId ||
    (contextTripId && creatableTrips.some((trip) => trip.id === contextTripId) ? contextTripId : null) ||
    getNextTrip(creatableTrips)?.id ||
    creatableTrips[0]?.id

  useEffect(() => {
    if ((session?.type === 'edit' || session?.type === 'view') && !place) close()
  }, [session, place, close])

  if (!session) return null
  if ((session.type === 'edit' || session.type === 'view') && !place) return null

  if (session.type === 'create' && !creatableTrips.length) {
    return (
      <Sheet kicker="Place" title="Add place" onClose={close}>
        <p className="text-sm leading-relaxed text-ink-muted">
          Saving a place is for the owner and editors.
        </p>
      </Sheet>
    )
  }

  function afterSave(tripId, placeId) {
    close()
    navigate(`/trips/${tripId}?tab=places&place=${placeId}`)
  }

  if (session.type === 'create' || session.type === 'edit') {
    const trip = trips.find((item) => item.id === (place?.tripId ?? defaultTripId))
    const permissions = trip ? permissionsFor(trip) : null
    const mayEdit = session.type === 'create' || (place && permissions?.canEditPlace(place))
    if (session.type === 'edit' && !mayEdit) {
      return (
        <Sheet kicker="Place" title="Place" onClose={close}>
          <p className="text-sm leading-relaxed text-ink-muted">This place can be viewed, not edited.</p>
        </Sheet>
      )
    }

    return (
      <Sheet
        kicker={session.type === 'edit' ? 'Place' : 'Quick add'}
        title={session.type === 'edit' ? 'Edit place' : 'Add place'}
        onClose={() => (session.type === 'edit' && place ? openView(place.id) : close())}
        dirty={dirty}
      >
        <PlaceForm
          key={place?.id ?? `create-${defaultTripId}`}
          trip={trip}
          trips={creatableTrips}
          place={place}
          defaultTripId={defaultTripId}
          lockTrip={Boolean(contextTripId && session.type === 'create')}
          onDirtyChange={() => setDirty(true)}
          onSubmit={(payload) => {
            if (place) {
              const updated = updatePlace(place.id, payload)
              if (updated) openView(place.id)
              return
            }
            const created = addPlace(payload)
            if (created) afterSave(payload.tripId, created.id)
          }}
        />
      </Sheet>
    )
  }

  return (
    <PlaceDetailsSheet
      place={place}
      trip={trips.find((item) => item.id === place.tripId)}
      itinerary={itineraries.find((entry) => entry.tripId === place.tripId)}
      permissions={permissionsFor(trips.find((item) => item.id === place.tripId))}
      onClose={close}
      onEdit={() => openEdit(place.id)}
      onDelete={() => {
        deletePlace(place.id)
        close()
      }}
      onVisited={() => markPlaceVisited(place.id)}
      onAddToItinerary={(date, time) => {
        const item = addPlaceToItinerary(place.id, date, time)
        if (item) {
          close()
          navigate(`/trips/${place.tripId}?tab=itinerary&place=${place.id}&item=${item.id}`)
        }
      }}
      onMove={(date) => {
        const item = movePlaceToDay(place.id, date)
        if (item) {
          close()
          navigate(`/trips/${place.tripId}?tab=itinerary&place=${place.id}&item=${item.id}`)
        }
      }}
    />
  )
}

function PlaceDetailsSheet({
  place,
  trip,
  itinerary,
  permissions,
  onClose,
  onEdit,
  onDelete,
  onVisited,
  onAddToItinerary,
  onMove,
}) {
  const [action, setAction] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const schedule = placeSchedule(place, itinerary, trip)
  const days = trip ? tripDates(trip) : []
  const canMutate = permissions?.canEditPlace(place)
  const canSchedule = permissions?.canEditItinerary
  const canRemove = permissions?.canDeletePlace(place)

  const rows = [
    ['Category', place.category],
    ['Address', place.address || place.area],
    ['Rating', formatPlaceRating(place)],
    ['Estimated cost', formatPlaceCost(place)],
    ['Opening hours', place.openingHours],
    ['Planned day', schedule.label || (place.plannedDay ? formatQuietDate(place.plannedDay) : '')],
    ['Status', PLACE_STATUS_LABEL[place.status]],
  ].filter(([, value]) => value)

  const itineraryHref =
    trip?.id && schedule.date
      ? `/trips/${trip.id}?tab=itinerary&place=${place.id}&date=${schedule.date}`
      : ''
  const mapHref = trip?.id ? `/trips/${trip.id}?tab=map&place=${place.id}` : ''

  return (
    <Sheet kicker={PLACE_STATUS_LABEL[place.status] ?? 'Place'} title={place.name} onClose={onClose}>
      <dl className="space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">{label}</dt>
            <dd className="mt-1.5 text-[15px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {place.notes ? <p className="mt-6 text-[14px] leading-relaxed text-ink-muted">{place.notes}</p> : null}
      {place.website || itineraryHref || mapHref ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5">
          {itineraryHref ? (
            <Link
              to={itineraryHref}
              onClick={onClose}
              className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-hover"
            >
              Itinerary · {schedule.label || 'Open'}
            </Link>
          ) : null}
          {mapHref ? (
            <Link
              to={mapHref}
              onClick={onClose}
              className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink"
            >
              Map
            </Link>
          ) : null}
          {place.website ? (
            <a
              href={place.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink"
            >
              Website
            </a>
          ) : null}
        </div>
      ) : null}

      {action === 'add' || action === 'move' ? (
        <ScheduleForm
          trip={trip}
          days={days}
          defaultDate={place.plannedDay || trip?.startDate || ''}
          defaultTime={schedule.time}
          submitLabel={action === 'move' ? 'Move' : 'Add to itinerary'}
          onCancel={() => setAction(null)}
          onSubmit={(date, time) => {
            if (action === 'move') onMove(date)
            else onAddToItinerary(date, time)
          }}
        />
      ) : (
        <div className="mt-8 space-y-2">
          {canSchedule ? (
            <Button className="w-full min-h-11" variant="outline" onClick={() => setAction('add')}>
              Add to itinerary
            </Button>
          ) : null}
          {canSchedule && schedule.item ? (
            <Button className="w-full min-h-11" variant="outline" onClick={() => setAction('move')}>
              Move to another day
            </Button>
          ) : null}
          {canMutate && place.status !== 'visited' ? (
            <Button className="w-full min-h-11" variant="outline" onClick={onVisited}>
              Mark as visited
            </Button>
          ) : null}
          {canMutate ? (
            <Button className="w-full min-h-11" variant="outline" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {canRemove ? (
            confirmDelete ? (
              <Button className="w-full min-h-11" onClick={onDelete}>
                Confirm delete
              </Button>
            ) : (
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-center text-sm text-ink-subtle hover:text-ink"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )
          ) : null}
        </div>
      )}
    </Sheet>
  )
}

function ScheduleForm({ trip, days, defaultDate, defaultTime, submitLabel, onCancel, onSubmit }) {
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState(defaultTime || '')

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!date) return
        onSubmit(date, time)
      }}
    >
      <Field label="Day">
        <select className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)}>
          {days.map((iso) => (
            <option key={iso} value={iso}>
              Day {tripDayNumber(trip, iso)} · {formatQuietDate(iso)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Time">
        <input className={fieldClass} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
      </Field>
      <div className="flex items-center justify-between pt-1">
        <button type="button" className="text-sm text-ink-muted" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
