import { createContext, useContext, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { usePlaceComposer } from '../places/PlaceComposer.jsx'
import { useBookingComposer } from '../bookings/BookingComposer.jsx'
import { useAppData } from '../../hooks/useAppData.jsx'
import { isIsoDate } from '../../lib/dates.js'
import { resolveCalendarAddDate } from '../../lib/itinerary.js'
import { canOnTrip } from '../../lib/permissions.js'
import { IconPlus } from '../icons.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'

const QuickAddContext = createContext(null)

const ACTIONS = [
  {
    id: 'trip',
    label: 'Trip',
    hint: 'Destination and dates',
  },
  {
    id: 'expense',
    label: 'Expense',
    hint: 'Amount, payer, unequal shares',
  },
  {
    id: 'itinerary',
    label: 'Itinerary stop',
    hint: 'A stop in the day',
  },
  {
    id: 'place',
    label: 'Place',
    hint: 'Save somewhere to return to',
  },
  {
    id: 'booking',
    label: 'Booking',
    hint: 'Flight, hotel, ticket, or other',
  },
]

function tripIdFromPath(pathname) {
  const match = pathname.match(/^\/trips\/([^/]+)/)
  return match?.[1] ?? null
}

export function QuickAddProvider({ children }) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState(null)

  const value = useMemo(
    () => ({
      openMenu: () => {
        setAction(null)
        setOpen(true)
      },
      openAction: (id) => {
        setAction(id)
        setOpen(true)
      },
    }),
    [],
  )

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddButton open={open} setOpen={setOpen} action={action} setAction={setAction} />
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd() {
  return useContext(QuickAddContext) ?? { openMenu: () => {}, openAction: () => {} }
}

export function QuickAddButton({ open, setOpen, action, setAction }) {
  const { openCreate } = useExpenseComposer()
  const { openCreate: openPlace } = usePlaceComposer()
  const { openCreate: openBooking } = useBookingComposer()
  const { trips, currentUser } = useAppData()
  const location = useLocation()
  const contextTripId = tripIdFromPath(location.pathname)
  const contextTrip = trips.find((trip) => trip.id === contextTripId)
  const [dirty, setDirty] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)
  const visibleActions = ACTIONS.filter((item) => {
    if (item.id === 'trip') return true
    if (item.id === 'expense') {
      return contextTrip
        ? canOnTrip(contextTrip, currentUser.id, 'addExpense')
        : trips.some((trip) => canOnTrip(trip, currentUser.id, 'addExpense'))
    }
    if (item.id === 'itinerary') {
      return contextTrip
        ? canOnTrip(contextTrip, currentUser.id, 'editItinerary')
        : trips.some((trip) => canOnTrip(trip, currentUser.id, 'editItinerary'))
    }
    if (item.id === 'place') {
      return contextTrip
        ? canOnTrip(contextTrip, currentUser.id, 'addPlace')
        : trips.some((trip) => canOnTrip(trip, currentUser.id, 'addPlace'))
    }
    if (item.id === 'booking') {
      return contextTrip
        ? canOnTrip(contextTrip, currentUser.id, 'addBooking')
        : trips.some((trip) => canOnTrip(trip, currentUser.id, 'addBooking'))
    }
    return true
  })

  function dismiss() {
    setAskDiscard(false)
    setDirty(false)
    setOpen(false)
    setAction(null)
  }

  function choose(id) {
    const tripId = tripIdFromPath(location.pathname)
    if (id === 'expense') {
      dismiss()
      openCreate(tripId)
      return
    }
    if (id === 'place') {
      dismiss()
      openPlace(tripId)
      return
    }
    if (id === 'booking') {
      dismiss()
      openBooking(tripId)
      return
    }
    setDirty(false)
    setAction(id)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAskDiscard(false)
          setDirty(false)
          setAction(null)
          setOpen(true)
        }}
        className="fixed right-5 bottom-20 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover lg:right-8 lg:bottom-8"
        aria-label="Quick add"
      >
        <IconPlus className="h-5 w-5" />
      </button>

      {open ? (
        <Sheet
          kicker="Quick add"
          title={action ? ACTIONS.find((item) => item.id === action)?.label : 'Add to your trip'}
          onClose={dismiss}
          dirty={dirty}
        >
          {action ? (
            <QuickAddForm
              action={action}
              onBack={() => {
                if (dirty) {
                  setAskDiscard(true)
                  return
                }
                setAction(null)
              }}
              onDirty={() => setDirty(true)}
              onDone={dismiss}
            />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {visibleActions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item.id)}
                    className="flex w-full items-center justify-between py-3.5 text-left"
                  >
                    <span>
                      <span className="block text-sm font-medium text-ink">{item.label}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-subtle">{item.hint}</span>
                    </span>
                    <span className="text-ink-subtle">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {askDiscard ? (
            <div
              className="absolute inset-0 z-10 flex items-end rounded-t-xl bg-ink/25 sm:items-center sm:justify-center sm:rounded-xl dark:bg-black/50"
              role="alertdialog"
              aria-modal="true"
              aria-label="Discard changes?"
            >
              <div className="w-full border-t border-line bg-surface p-5 sm:mx-6 sm:rounded-xl sm:border">
                <p className="text-sm text-ink">Discard changes?</p>
                <div className="mt-4 flex justify-end gap-3">
                  <button type="button" className="text-sm text-ink-muted" onClick={() => setAskDiscard(false)}>
                    Cancel
                  </button>
                  <Button onClick={dismiss}>Discard</Button>
                </div>
              </div>
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </>
  )
}

function QuickAddForm({ action, onBack, onDone, onDirty }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { trips, currentUser, addTrip, addItineraryItem } = useAppData()
  const permission = action === 'itinerary' ? 'editItinerary' : null
  const eligibleTrips = permission
    ? trips.filter((trip) => canOnTrip(trip, currentUser.id, permission))
    : trips
  const contextTripId = tripIdFromPath(location.pathname)
  const calendarDate = new URLSearchParams(location.search).get('date')
  const defaultTripId = eligibleTrips.some((trip) => trip.id === contextTripId)
    ? contextTripId
    : (eligibleTrips[0]?.id ?? '')

  const [tripId, setTripId] = useState(defaultTripId)
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => {
    const trip = trips.find((entry) => entry.id === defaultTripId)
    return resolveCalendarAddDate(calendarDate, trip)
  })
  const [place, setPlace] = useState('')

  function selectedTrip() {
    return trips.find((trip) => trip.id === tripId)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (action === 'trip') {
      const [city, country] = destination.split(',').map((part) => part.trim())
      const trip = addTrip({
        city: city || destination,
        country: country || '',
        destination,
        startDate,
        endDate,
        budgetAmount: Number(budget) || 0,
      })
      onDone()
      navigate(`/trips/${trip.id}`)
      return
    }
    if (action === 'itinerary') {
      if (!tripId || !title) return
      const trip = selectedTrip()
      const itemDate = resolveCalendarAddDate(date, trip)
      const item = addItineraryItem(tripId, itemDate, { title, place })
      if (!item) return
      onDone()
      const next = new URLSearchParams(location.search)
      next.set('tab', 'itinerary')
      next.set('item', item.id)
      if (itemDate) next.set('date', itemDate)
      const view = next.get('view')
      if (view !== 'month' && view !== 'week' && view !== 'day') next.delete('view')
      navigate(`/trips/${tripId}?${next.toString()}`)
      return
    }
  }

  return (
    <form onSubmit={handleSubmit} onInput={onDirty} onChange={onDirty} className="space-y-4">
      {action === 'trip' ? (
        <>
          <Field label="Destination">
            <input
              className={fieldClass}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Kyoto, Japan"
              required
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input className={fieldClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </Field>
            <Field label="End">
              <input className={fieldClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </Field>
          </div>
          <Field label="Budget (RM)">
            <input className={fieldClass} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="4000" />
          </Field>
        </>
      ) : null}

      {action !== 'trip' ? (
        <Field label="Trip">
          <select className={fieldClass} value={tripId} onChange={(e) => setTripId(e.target.value)}>
            {eligibleTrips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.destination}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {action === 'itinerary' ? (
        <>
          <Field label="Title">
            <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Museum morning" required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                className={fieldClass}
                type="date"
                value={isIsoDate(date) ? date : ''}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Place">
              <input className={fieldClass} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" className="text-sm text-ink-muted" onClick={onBack}>
          Back
        </button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
