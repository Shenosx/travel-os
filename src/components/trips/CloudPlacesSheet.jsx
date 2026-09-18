import { useState } from 'react'
import { formatQuietDate } from '../../lib/dates.js'
import {
  filterPlaces,
  formatPlaceCost,
  formatPlaceRating,
  PLACE_STATUS_LABEL,
} from '../../lib/places.js'
import { useCloudTripPlaces } from '../../hooks/useCloudTripPlaces.js'
import { PlaceCard } from '../places/PlaceCard.jsx'
import { MapCanvas } from '../trip/MapCanvas.jsx'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudPlaceForm } from './CloudPlaceForm.jsx'

const FILTERS = ['all', 'saved', 'planned', 'visited']

export function CloudPlacesSheet({ trip, currentUserId, onClose }) {
  const cloud = useCloudTripPlaces(trip)
  const [status, setStatus] = useState('all')
  const [selectedPlaceId, setSelectedPlaceId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const visible = filterPlaces(cloud.places, status)
  const users = cloud.members.map((member) => ({
    id: member.userId,
    name: member.name,
    shortName: member.shortName,
    initials: member.initials,
  }))

  function openCreate() {
    setFormError(null)
    setDirty(false)
    setDraft({ type: 'create' })
  }

  function closeDraft() {
    if (busy) return
    setDraft(null)
    setFormError(null)
    setDirty(false)
  }

  async function handleSubmit(input) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.save(input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(result.place ? { type: 'view', placeId: result.place.id } : null)
    setDirty(false)
  }

  async function handleDelete(place) {
    if (!place?.id) return
    setBusy(true)
    setFormError(null)
    const result = await cloud.remove(place.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
    if (selectedPlaceId === place.id) setSelectedPlaceId(null)
  }

  async function handleVisited(place) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.markVisited(place)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    if (result.place) setDraft({ type: 'view', placeId: result.place.id })
  }

  const viewing = draft?.type === 'view' ? cloud.places.find((item) => item.id === draft.placeId) : null
  const editing = draft?.type === 'edit' ? cloud.places.find((item) => item.id === draft.placeId) : null

  return (
    <>
      <Sheet kicker="Cloud" title="Places" onClose={onClose} wide>
        <div className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trip places</p>
              <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
            </div>
            {cloud.canCreate ? (
              <Button size="sm" onClick={openCreate}>
                Add place
              </Button>
            ) : null}
          </div>

          <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto">
            {FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatus(id)}
                className={`h-10 shrink-0 px-3 text-sm ${
                  status === id ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'
                }`}
              >
                {id === 'all' ? 'All' : PLACE_STATUS_LABEL[id]}
              </button>
            ))}
          </div>

          {cloud.loading ? <p className="text-sm text-ink-muted">Loading places…</p> : null}
          {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
          <CloudLiveStatus error={cloud.liveError} />

          {cloud.places.length ? (
            <MapCanvas
              destination={trip.destination}
              places={cloud.places}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={(placeId) => {
                setSelectedPlaceId(placeId)
                setDraft({ type: 'view', placeId })
              }}
            />
          ) : null}

          {!cloud.loading && !cloud.places.length ? (
            <EmptyState
              title="No cloud places yet"
              body={
                cloud.canCreate
                  ? 'Save a hotel, café, or sight on this cloud trip. A name is enough to start.'
                  : 'Places will appear here once they’re saved.'
              }
              action={
                cloud.canCreate ? (
                  <button type="button" className="text-sm text-accent" onClick={openCreate}>
                    Add a place
                  </button>
                ) : null
              }
            />
          ) : null}

          {cloud.places.length && !visible.length ? (
            <div className="border border-line px-5 py-10 text-center">
              <p className="text-sm text-ink-muted">No places in this list yet.</p>
              <p className="mt-1 text-[13px] text-ink-subtle">Try another filter, or save a new place.</p>
            </div>
          ) : null}

          {visible.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {visible.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  trip={trip}
                  users={users}
                  currentUserId={currentUserId}
                  selected={place.id === selectedPlaceId}
                  onSelect={() => {
                    setSelectedPlaceId(place.id)
                    setFormError(null)
                    setDraft({ type: 'view', placeId: place.id })
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </Sheet>

      {draft?.type === 'create' || editing ? (
        <Sheet
          kicker="Cloud"
          title={editing ? 'Edit place' : 'Add place'}
          onClose={closeDraft}
          dirty={dirty}
        >
          <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <CloudPlaceForm
              key={editing?.id ?? 'create'}
              trip={trip}
              place={editing}
              error={formError}
              busy={busy}
              onSubmit={handleSubmit}
              onDelete={editing && cloud.canDeletePlace(editing) ? () => handleDelete(editing) : undefined}
              onCancel={closeDraft}
            />
          </div>
        </Sheet>
      ) : null}

      {viewing ? (
        <CloudPlaceDetails
          place={viewing}
          trip={trip}
          error={formError}
          busy={busy}
          canEdit={cloud.canEditPlace(viewing)}
          canDelete={cloud.canDeletePlace(viewing)}
          onClose={closeDraft}
          onEdit={() => {
            setFormError(null)
            setDirty(false)
            setDraft({ type: 'edit', placeId: viewing.id })
          }}
          onDelete={() => handleDelete(viewing)}
          onVisited={() => handleVisited(viewing)}
        />
      ) : null}
    </>
  )
}

function CloudPlaceDetails({
  place,
  trip,
  error,
  busy,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
  onVisited,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rows = [
    ['Category', place.category],
    ['Address', place.address || place.area],
    ['Rating', formatPlaceRating(place)],
    ['Estimated cost', formatPlaceCost(place)],
    ['Opening hours', place.openingHours],
    ['Planned day', place.plannedDay ? formatQuietDate(place.plannedDay) : ''],
    ['Status', PLACE_STATUS_LABEL[place.status]],
    [
      'Coordinates',
      place.latitude != null && place.longitude != null ? `${place.latitude}, ${place.longitude}` : '',
    ],
  ].filter(([, value]) => value)

  return (
    <Sheet kicker="Cloud" title={place.name} onClose={onClose}>
      <p className="text-[13px] text-ink-subtle">{trip.destination} · cloud place</p>
      <dl className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</dt>
            <dd className="mt-1 text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {place.notes ? <p className="mt-5 text-sm leading-relaxed text-ink-muted">{place.notes}</p> : null}
      <p className="mt-5 text-[13px] text-ink-subtle">Ready to attach to a cloud itinerary later.</p>
      {error ? <p className="mt-4 text-sm text-ink-muted">{error}</p> : null}

      <div className="mt-8 space-y-2">
        {canEdit && place.status !== 'visited' ? (
          <Button className="w-full" variant="outline" onClick={onVisited} disabled={busy}>
            Mark as visited
          </Button>
        ) : null}
        {canEdit ? (
          <Button className="w-full" variant="outline" onClick={onEdit} disabled={busy}>
            Edit
          </Button>
        ) : null}
        {canDelete ? (
          confirmDelete ? (
            <Button className="w-full" onClick={onDelete} disabled={busy}>
              Confirm delete
            </Button>
          ) : (
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center text-sm text-ink-subtle"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )
        ) : null}
      </div>
    </Sheet>
  )
}
