import { useState } from 'react'
import { formatLongDate, formatQuietDate, formatWeekday, tripDates } from '../../lib/dates.js'
import { formatTime } from '../../lib/format.js'
import { cloudItineraryAttribution } from '../../lib/trips/itinerary.js'
import { useCloudTripItinerary } from '../../hooks/useCloudTripItinerary.js'
import { MapCanvas } from '../trip/MapCanvas.jsx'
import { Button } from '../ui/Button.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudItineraryItemForm } from './CloudItineraryItemForm.jsx'

const CATEGORY_LABEL = {
  arrival: 'Arrival',
  departure: 'Departure',
  lodging: 'Stay',
  food: 'Food',
  sight: 'Place',
  transport: 'Transit',
  free: 'Open',
}

export function CloudItinerarySheet({ trip, currentUserId, onClose }) {
  const cloud = useCloudTripItinerary(trip)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const [dirty, setDirty] = useState(false)
  const selectedItem = cloud.items.find((item) => item.id === selectedItemId) ?? null
  const unusedDates = tripDates(trip).filter((date) => !cloud.days.some((day) => day.date === date))

  function closeDraft() {
    if (busy) return
    setDraft(null)
    setFormError(null)
    setDirty(false)
  }

  async function handleSaveItem(input) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.saveItem(input)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
    if (result.item) setSelectedItemId(result.item.id)
  }

  async function handleDeleteItem(item) {
    if (!item?.id) return
    setBusy(true)
    setFormError(null)
    const result = await cloud.removeItem(item.id)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
    if (selectedItemId === item.id) setSelectedItemId(null)
  }

  async function handleSaveDay(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const date = String(data.get('date') || '')
    if (!date) return
    setBusy(true)
    setFormError(null)
    const result = await cloud.saveDay({
      date,
      title: String(data.get('title') || '').trim(),
    })
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
    setDirty(false)
  }

  async function handleCreateTripDays() {
    setBusy(true)
    setFormError(null)
    for (const date of unusedDates) {
      const result = await cloud.saveDay({ date })
      if (result.error) {
        setFormError(result.error)
        setBusy(false)
        return
      }
    }
    setBusy(false)
  }

  async function handleReorder(day, item, direction) {
    const ids = day.items.map((entry) => entry.id)
    const index = ids.indexOf(item.id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= ids.length) return
    const ordered = ids.slice()
    ordered.splice(index, 1)
    ordered.splice(next, 0, item.id)
    setBusy(true)
    setFormError(null)
    const result = await cloud.reorderDay(day.date, ordered)
    setBusy(false)
    if (result.error) setFormError(result.error)
  }

  async function handleMove(item, itemDate) {
    setBusy(true)
    setFormError(null)
    const result = await cloud.moveItem(item, itemDate)
    setBusy(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setDraft(null)
  }

  const editing = draft?.type === 'edit' ? cloud.items.find((item) => item.id === draft.itemId) : null
  const viewing = draft?.type === 'view' ? cloud.items.find((item) => item.id === draft.itemId) : null

  return (
    <>
      <Sheet kicker="Cloud" title="Itinerary" onClose={onClose} wide>
        <div className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trip itinerary</p>
              <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
            </div>
            <div className="flex items-center gap-3">
              {cloud.canCreate ? (
                <button
                  type="button"
                  className="text-sm text-ink-muted"
                  onClick={() => {
                    setFormError(null)
                    setDirty(false)
                    setDraft({ type: 'day' })
                  }}
                >
                  Add day
                </button>
              ) : null}
              {cloud.canCreate && cloud.days.length ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setFormError(null)
                    setDirty(false)
                    setDraft({ type: 'create' })
                  }}
                >
                  Add stop
                </Button>
              ) : null}
            </div>
          </div>

          {cloud.loading ? <p className="text-sm text-ink-muted">Loading itinerary…</p> : null}
          {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
          <CloudLiveStatus error={cloud.liveError} />
          {formError && !draft ? <p className="text-sm text-ink-muted">{formError}</p> : null}

          {!cloud.loading && !cloud.days.length && !cloud.items.length ? (
            <EmptyState
              title="No days planned yet"
              body={
                cloud.canCreate
                  ? 'Add a day, then a stop — a place, a booking, or a free hour.'
                  : 'The days will appear here once they’re planned.'
              }
              action={
                cloud.canCreate ? (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      className="text-sm text-accent"
                      onClick={() => {
                        setFormError(null)
                        setDraft({ type: 'day' })
                      }}
                    >
                      Add a day
                    </button>
                    {unusedDates.length ? (
                      <button type="button" className="text-sm text-ink-muted" onClick={handleCreateTripDays} disabled={busy}>
                        Create days from trip dates
                      </button>
                    ) : null}
                  </div>
                ) : null
              }
            />
          ) : null}

          {cloud.itinerary.days.map((day) => (
            <CloudItineraryDay
              key={day.id ?? day.date}
              day={day}
              places={cloud.places}
              bookings={cloud.bookings}
              members={cloud.members}
              currentUserId={currentUserId}
              selectedItemId={selectedItemId}
              canEdit={cloud.canEdit}
              busy={busy}
              onSelect={(item) => {
                setSelectedItemId(item.id)
                setFormError(null)
                setDraft({ type: 'view', itemId: item.id })
              }}
              onMoveUp={(item) => handleReorder(day, item, -1)}
              onMoveDown={(item) => handleReorder(day, item, 1)}
            />
          ))}

          {cloud.places.length ? (
            <MapCanvas
              destination={trip.destination}
              places={cloud.places}
              selectedPlaceId={selectedItem?.placeId ?? null}
              itineraryPlaceId={selectedItem?.placeId ?? null}
            />
          ) : null}
        </div>
      </Sheet>

      {draft?.type === 'day' ? (
        <Sheet kicker="Cloud" title="Add day" onClose={closeDraft} dirty={dirty}>
          <form className="space-y-4" onSubmit={handleSaveDay} onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <p className="text-[13px] text-ink-subtle">Cloud trip · {trip.destination}</p>
            <Field label="Date">
              {unusedDates.length ? (
                <select className={fieldClass} name="date" defaultValue={unusedDates[0]} required>
                  {unusedDates.map((date) => (
                    <option key={date} value={date}>
                      {formatQuietDate(date)}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={fieldClass} type="date" name="date" required />
              )}
            </Field>
            <Field label="Title">
              <input className={fieldClass} name="title" placeholder="Optional" />
            </Field>
            {formError ? <p className="text-sm text-ink-muted">{formError}</p> : null}
            <div className="flex items-center justify-between pt-2">
              <button type="button" className="text-sm text-ink-muted" onClick={closeDraft}>
                Cancel
              </button>
              <Button type="submit" disabled={busy}>
                Add
              </Button>
            </div>
          </form>
        </Sheet>
      ) : null}

      {draft?.type === 'create' || editing ? (
        <Sheet kicker="Cloud" title={editing ? 'Edit stop' : 'Add stop'} onClose={closeDraft} dirty={dirty}>
          <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
            <CloudItineraryItemForm
              key={editing?.id ?? 'create'}
              trip={trip}
              days={cloud.itinerary.days}
              places={cloud.places}
              bookings={cloud.bookings}
              item={editing}
              error={formError}
              busy={busy}
              onSubmit={handleSaveItem}
              onDelete={editing && cloud.canDelete ? () => handleDeleteItem(editing) : undefined}
              onCancel={closeDraft}
            />
          </div>
        </Sheet>
      ) : null}

      {viewing ? (
        <CloudItineraryItemDetails
          item={viewing}
          trip={trip}
          days={cloud.itinerary.days}
          places={cloud.places}
          bookings={cloud.bookings}
          members={cloud.members}
          currentUserId={currentUserId}
          error={formError}
          busy={busy}
          canEdit={cloud.canEdit}
          canDelete={cloud.canDelete}
          onClose={closeDraft}
          onEdit={() => {
            setFormError(null)
            setDirty(false)
            setDraft({ type: 'edit', itemId: viewing.id })
          }}
          onDelete={() => handleDeleteItem(viewing)}
          onMove={(date) => handleMove(viewing, date)}
        />
      ) : null}
    </>
  )
}

function CloudItineraryDay({
  day,
  places,
  bookings,
  members,
  currentUserId,
  selectedItemId,
  canEdit,
  busy,
  onSelect,
  onMoveUp,
  onMoveDown,
}) {
  return (
    <section>
      <header className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {day.dayNumber != null ? (
          <p className="text-[12px] tracking-[0.16em] text-accent uppercase">Day {day.dayNumber}</p>
        ) : null}
        <h3 className="font-display text-[26px] tracking-[-0.03em] text-ink">
          {day.title || formatWeekday(day.date)}
        </h3>
        <p className="text-sm text-ink-subtle">
          {formatWeekday(day.date)}, {formatLongDate(day.date)}
        </p>
      </header>
      {day.items.length ? (
        <ol>
          {day.items.map((item, index) => {
            const last = index === day.items.length - 1
            const attribution = cloudItineraryAttribution(item, members, currentUserId)
            const resolved = resolveItem(item, places, bookings)
            const selected = item.id === selectedItemId
            return (
              <li key={item.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(item)}
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
                    {attribution ? <p className="mt-1.5 text-[12px] text-ink-subtle">{attribution}</p> : null}
                  </div>
                </button>
                {canEdit && day.items.length > 1 ? (
                  <div className="absolute top-0 right-0 flex gap-2">
                    {index > 0 ? (
                      <button type="button" className="text-[11px] text-ink-subtle" disabled={busy} onClick={() => onMoveUp(item)}>
                        Up
                      </button>
                    ) : null}
                    {!last ? (
                      <button type="button" className="text-[11px] text-ink-subtle" disabled={busy} onClick={() => onMoveDown(item)}>
                        Down
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-sm text-ink-muted">No stops on this day yet.</p>
      )}
    </section>
  )
}

function CloudItineraryItemDetails({
  item,
  trip,
  days,
  places,
  bookings,
  members,
  currentUserId,
  error,
  busy,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
  onMove,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [moving, setMoving] = useState(false)
  const resolved = resolveItem(item, places, bookings)
  const attribution = cloudItineraryAttribution(item, members, currentUserId)
  const otherDays = days.filter((day) => day.date !== item.itemDate)

  return (
    <Sheet kicker="Cloud" title={resolved.title} onClose={onClose}>
      <p className="text-[13px] text-ink-subtle">{trip.destination} · cloud itinerary</p>
      <dl className="mt-5 space-y-3">
        {[
          ['Category', CATEGORY_LABEL[item.category]],
          ['Time', item.time ? formatTime(item.time) : ''],
          ['Place', resolved.place?.name],
          ['Booking', resolved.booking?.title],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{label}</dt>
              <dd className="mt-1 text-sm text-ink">{value}</dd>
            </div>
          ))}
      </dl>
      {item.notes ? <p className="mt-5 text-sm leading-relaxed text-ink-muted">{item.notes}</p> : null}
      {attribution ? <p className="mt-4 text-[12px] text-ink-subtle">{attribution}</p> : null}
      {error ? <p className="mt-4 text-sm text-ink-muted">{error}</p> : null}

      {moving && otherDays.length ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const date = new FormData(event.currentTarget).get('itemDate')
            if (date) onMove(String(date))
          }}
        >
          <Field label="Move to">
            <select className={fieldClass} name="itemDate" defaultValue={otherDays[0]?.date}>
              {otherDays.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.dayNumber ? `Day ${day.dayNumber}` : day.date}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center justify-between">
            <button type="button" className="text-sm text-ink-muted" onClick={() => setMoving(false)}>
              Cancel
            </button>
            <Button type="submit" disabled={busy}>
              Move
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-8 space-y-2">
          {canEdit && otherDays.length ? (
            <Button className="w-full" variant="outline" onClick={() => setMoving(true)} disabled={busy}>
              Move to another day
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
      )}
    </Sheet>
  )
}

function resolveItem(item, places, bookings) {
  const place = item.placeId ? places.find((entry) => entry.id === item.placeId) : null
  const booking = item.bookingId ? bookings.find((entry) => entry.id === item.bookingId) : null
  const title = item.title || place?.name || booking?.title || ''
  const subtitle = place?.name && place.name !== title ? place.name : booking?.provider || ''
  return { title, subtitle, place, booking }
}
