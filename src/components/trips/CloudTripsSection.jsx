import { useCallback, useEffect, useState } from 'react'
import { isCloudTripOwner } from '../../lib/trips/cloud.js'
import { useCloudRealtimeRefresh } from '../../hooks/useCloudTripRealtime.js'
import { CloudBookingsSheet } from './CloudBookingsSheet.jsx'
import { CloudExpenseSheet } from './CloudExpenseSheet.jsx'
import { CloudItinerarySheet } from './CloudItinerarySheet.jsx'
import { CloudPeopleSheet } from './CloudPeopleSheet.jsx'
import { CloudPlacesSheet } from './CloudPlacesSheet.jsx'
import { CloudPollsSheet } from './CloudPollsSheet.jsx'
import { CloudActivitySheet } from './CloudActivitySheet.jsx'
import { CloudTripCard } from './CloudTripCard.jsx'
import { CloudTripComposer } from './CloudTripComposer.jsx'

export function CloudTripsSection({
  trips,
  loading,
  error,
  currentUserId,
  focusTripId = null,
  onCreate,
  onUpdate,
  onDelete,
  onReload,
}) {
  const [draft, setDraft] = useState(null)
  const [peopleTrip, setPeopleTrip] = useState(null)
  const [itineraryTrip, setItineraryTrip] = useState(null)
  const [placesTrip, setPlacesTrip] = useState(null)
  const [bookingsTrip, setBookingsTrip] = useState(null)
  const [expenseTrip, setExpenseTrip] = useState(null)
  const [pollsTrip, setPollsTrip] = useState(null)
  const [activityTrip, setActivityTrip] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)

  function closeDraft() {
    if (busy) return
    setDraft(null)
    setFormError(null)
  }

  function closeSheets() {
    setPeopleTrip(null)
    setItineraryTrip(null)
    setPlacesTrip(null)
    setBookingsTrip(null)
    setExpenseTrip(null)
    setPollsTrip(null)
    setActivityTrip(null)
  }

  const activeTrip =
    peopleTrip || itineraryTrip || placesTrip || bookingsTrip || expenseTrip || pollsTrip || activityTrip

  const handleTripRealtime = useCallback(
    async (domains) => {
      await onReload?.()
      if (domains.includes('gone')) closeSheets()
    },
    [onReload],
  )
  const { liveError } = useCloudRealtimeRefresh(activeTrip?.id, ['trip', 'gone'], handleTripRealtime)

  useEffect(() => {
    if (!focusTripId) return
    const focused = trips.find((trip) => trip.id === focusTripId)
    if (focused) setItineraryTrip(focused)
  }, [focusTripId, trips])

  async function handleCreate(input) {
    setBusy(true)
    setFormError(null)
    const result = await onCreate(input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
  }

  async function handleUpdate(input) {
    setBusy(true)
    setFormError(null)
    const result = await onUpdate(draft.trip.id, input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
  }

  async function handleDelete() {
    setBusy(true)
    setFormError(null)
    const result = await onDelete(draft.trip.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
  }

  return (
    <section className="mt-14">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trips</h2>
          <p className="mt-1 text-sm text-ink-muted">Visible to this signed-in account. Local trips stay on this device.</p>
        </div>
        <button
          type="button"
          className="text-sm text-accent"
          onClick={() => {
            setFormError(null)
            setDraft({ type: 'create' })
          }}
        >
          Create cloud trip
        </button>
      </div>

      {loading ? <p className="text-sm text-ink-muted">Loading cloud trips…</p> : null}

      {!loading && error ? <p className="text-sm text-ink-muted">{error}</p> : null}
      {liveError ? <p className="text-[12px] text-ink-subtle">{liveError}</p> : null}

      {!loading && !error && !trips.length ? (
        <p className="text-sm text-ink-muted">No cloud trips yet.</p>
      ) : null}

      {!loading && !error && trips.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((trip) => (
            <CloudTripCard
              key={trip.id}
              trip={trip}
              canManage={isCloudTripOwner(trip, currentUserId)}
              onPeople={() => setPeopleTrip(trip)}
              onItinerary={() => setItineraryTrip(trip)}
              onPlaces={() => setPlacesTrip(trip)}
              onBookings={() => setBookingsTrip(trip)}
              onExpenses={() => setExpenseTrip(trip)}
              onPolls={() => setPollsTrip(trip)}
              onActivity={() => setActivityTrip(trip)}
              onEdit={() => {
                setFormError(null)
                setDraft({ type: 'edit', trip })
              }}
              onDelete={() => {
                setFormError(null)
                setDraft({ type: 'delete', trip })
              }}
            />
          ))}
        </div>
      ) : null}

      {draft ? (
        <CloudTripComposer
          mode={draft.type}
          trip={draft.trip}
          busy={busy}
          error={formError}
          onClose={closeDraft}
          onSubmit={draft.type === 'edit' ? handleUpdate : handleCreate}
          onConfirmDelete={handleDelete}
        />
      ) : null}

      {peopleTrip ? (
        <CloudPeopleSheet
          trip={peopleTrip}
          currentUserId={currentUserId}
          onClose={() => setPeopleTrip(null)}
        />
      ) : null}

      {itineraryTrip ? (
        <CloudItinerarySheet
          trip={itineraryTrip}
          currentUserId={currentUserId}
          onClose={() => setItineraryTrip(null)}
        />
      ) : null}

      {placesTrip ? (
        <CloudPlacesSheet
          trip={placesTrip}
          currentUserId={currentUserId}
          onClose={() => setPlacesTrip(null)}
        />
      ) : null}

      {bookingsTrip ? (
        <CloudBookingsSheet
          trip={bookingsTrip}
          currentUserId={currentUserId}
          onClose={() => setBookingsTrip(null)}
        />
      ) : null}

      {expenseTrip ? (
        <CloudExpenseSheet
          trip={expenseTrip}
          currentUserId={currentUserId}
          onClose={() => setExpenseTrip(null)}
        />
      ) : null}

      {pollsTrip ? (
        <CloudPollsSheet
          trip={pollsTrip}
          currentUserId={currentUserId}
          onClose={() => setPollsTrip(null)}
        />
      ) : null}

      {activityTrip ? (
        <CloudActivitySheet
          trip={activityTrip}
          currentUserId={currentUserId}
          onClose={() => setActivityTrip(null)}
        />
      ) : null}
    </section>
  )
}
