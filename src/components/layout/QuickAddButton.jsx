import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useExpenseComposer } from '../expenses/ExpenseComposer.jsx'
import { useAppData } from '../../hooks/useAppData.jsx'
import { canOnTrip } from '../../lib/permissions.js'
import { IconClose, IconPlus } from '../icons.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'

const ACTIONS = [
  {
    id: 'trip',
    label: 'New trip',
    hint: 'Destination and dates',
  },
  {
    id: 'expense',
    label: 'Add expense',
    hint: 'Amount, payer, unequal shares',
  },
  {
    id: 'itinerary',
    label: 'Add itinerary item',
    hint: 'A stop in the day',
  },
  {
    id: 'place',
    label: 'Add place',
    hint: 'Save somewhere to return to',
  },
]

function tripIdFromPath(pathname) {
  const match = pathname.match(/^\/trips\/([^/]+)/)
  return match?.[1] ?? null
}

export function QuickAddButton() {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState(null)
  const { openCreate } = useExpenseComposer()
  const { trips, currentUser } = useAppData()
  const location = useLocation()
  const contextTripId = tripIdFromPath(location.pathname)
  const contextTrip = trips.find((trip) => trip.id === contextTripId)
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
    return true
  })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setAction(null)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function choose(id) {
    if (id === 'expense') {
      setOpen(false)
      setAction(null)
      openCreate(tripIdFromPath(location.pathname))
      return
    }
    setAction(id)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAction(null)
          setOpen(true)
        }}
        className="fixed right-5 bottom-20 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover lg:right-8 lg:bottom-8"
        aria-label="Quick add"
      >
        <IconPlus className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25 dark:bg-black/50"
            aria-label="Dismiss overlay"
            onClick={() => {
              setOpen(false)
              setAction(null)
            }}
          />
          <div className="relative w-full max-w-[420px] rounded-t-xl border border-line bg-surface p-5 sm:rounded-xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Quick add</p>
                <h2 className="font-display mt-1 text-[26px] leading-tight tracking-[-0.03em]">
                  {action ? ACTIONS.find((item) => item.id === action)?.label : 'Add to your trip'}
                </h2>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-canvas-muted"
                onClick={() => {
                  setOpen(false)
                  setAction(null)
                }}
                aria-label="Close"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            {action ? (
              <QuickAddForm
                action={action}
                onBack={() => setAction(null)}
                onDone={() => {
                  setOpen(false)
                  setAction(null)
                }}
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
          </div>
        </div>
      ) : null}
    </>
  )
}

function QuickAddForm({ action, onBack, onDone }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { trips, currentUser, addTrip, addItineraryItem, addPlace } = useAppData()
  const permission =
    action === 'itinerary' ? 'editItinerary' : action === 'place' ? 'addPlace' : null
  const eligibleTrips = permission
    ? trips.filter((trip) => canOnTrip(trip, currentUser.id, permission))
    : trips
  const contextTripId = tripIdFromPath(location.pathname)
  const defaultTripId = eligibleTrips.some((trip) => trip.id === contextTripId)
    ? contextTripId
    : (eligibleTrips[0]?.id ?? '')

  const [tripId, setTripId] = useState(defaultTripId)
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
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
      const item = addItineraryItem(tripId, date || selectedTrip()?.startDate, { title, place })
      if (!item) return
      onDone()
      navigate(`/trips/${tripId}?tab=itinerary`)
      return
    }
    if (action === 'place') {
      if (!tripId || !title) return
      const saved = addPlace({ tripId, name: title, area: place, category: 'Saved' })
      if (!saved) return
      onDone()
      navigate(`/trips/${tripId}?tab=map`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
              <input className={fieldClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Place">
              <input className={fieldClass} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </>
      ) : null}

      {action === 'place' ? (
        <>
          <Field label="Name">
            <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Café Sperl" required autoFocus />
          </Field>
          <Field label="Area">
            <input className={fieldClass} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Mariahilf" />
          </Field>
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
