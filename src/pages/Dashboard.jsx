import { UpcomingHero } from '../components/dashboard/UpcomingHero.jsx'
import { HomeActivity } from '../components/dashboard/HomeActivity.jsx'
import { HomeItinerary } from '../components/dashboard/HomeItinerary.jsx'
import { HomeQuickActions } from '../components/dashboard/HomeQuickActions.jsx'
import { HomeSpending } from '../components/dashboard/HomeSpending.jsx'
import { HomeTripRail } from '../components/dashboard/HomeTripRail.jsx'
import { useQuickAdd } from '../components/layout/QuickAddButton.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { visibleAccount } from '../lib/auth/session.js'
import { flattenItineraryItems } from '../lib/itinerary.js'
import { greetingForTime, todayIso } from '../lib/dates.js'
import { HOME_CURRENCY } from '../lib/currency.js'
import {
  checklistProgress,
  checklistRowsForTripUser,
  packingPercent,
  packingProgress,
  packingRowsForTripUser,
} from '../lib/planning.js'
import { getNextTrip, getTripSpending, getTripStatus, getUpcomingTrips } from '../lib/trips.js'

function formatToday(now = new Date()) {
  return now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function railTrips(trips, nextTrip) {
  const upcoming = getUpcomingTrips(trips).filter((trip) => trip.id !== nextTrip?.id)
  const recent = trips
    .filter((trip) => getTripStatus(trip) === 'completed')
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
  const seen = new Set()
  return [...upcoming, ...recent].filter((trip) => {
    if (seen.has(trip.id)) return false
    seen.add(trip.id)
    return true
  })
}

function upcomingItineraryItems(itinerary, places, today = todayIso()) {
  return flattenItineraryItems(itinerary)
    .filter((item) => item.date >= today)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      location:
        item.place || places.find((place) => place.id === item.placeId)?.name || item.dayTitle || '',
    }))
}

export function DashboardPage() {
  const { currentUser, trips, expenses, itineraries, places, activities, users, packingItems, checklistItems } =
    useAppData()
  const { identity } = useAuth()
  const account = visibleAccount(identity)
  const { openAction } = useQuickAdd()
  const nextTrip = getNextTrip(trips)
  const nextItinerary = nextTrip ? itineraries.find((entry) => entry.tripId === nextTrip.id) : null
  const itineraryItems = upcomingItineraryItems(nextItinerary, places)
  const otherTrips = railTrips(trips, nextTrip)
  const spent = nextTrip
    ? getTripSpending(expenses, nextTrip.id)
    : expenses.reduce((sum, expense) => sum + (expense.convertedAmount ?? expense.amount ?? 0), 0)
  const budget = nextTrip
    ? nextTrip.budgetAmount
    : trips.reduce((sum, trip) => sum + (trip.budgetAmount ?? 0), 0)
  const currency = nextTrip?.currency ?? HOME_CURRENCY
  const recentActivity = [...activities]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 6)
  const noteHref = nextTrip ? `/trips/${nextTrip.id}?notes=1` : trips[0] ? `/trips/${trips[0].id}?notes=1` : ''
  const nextPackingItems = nextTrip
    ? packingRowsForTripUser(packingItems, nextTrip.id, currentUser.id)
    : []
  const nextPacking = packingProgress(nextPackingItems)
  const nextPackingPercent = packingPercent(nextPackingItems)
  const nextChecklist = nextTrip
    ? checklistProgress(checklistRowsForTripUser(checklistItems, nextTrip.id, currentUser.id))
    : { done: 0, total: 0 }

  return (
    <div>
      <header>
        <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">{greetingForTime()}</p>
        <h1 className="font-display mt-2 text-[34px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[44px]">
          {account.greeting || '—'}
        </h1>
        <p className="mt-2 text-[14px] text-ink-muted">{formatToday()}</p>
      </header>

      <div className="mt-9 sm:mt-11">
        {nextTrip ? (
          <UpcomingHero
            trip={nextTrip}
            packing={
              nextPacking.total
                ? { percent: nextPackingPercent, href: `/trips/${nextTrip.id}?packing=1` }
                : null
            }
            checklist={
              nextChecklist.total
                ? {
                    done: nextChecklist.done,
                    total: nextChecklist.total,
                    href: `/trips/${nextTrip.id}?checklist=1`,
                  }
                : null
            }
          />
        ) : (
          <EmptyState
            className="px-6 py-14"
            title={trips.length ? 'No upcoming trip' : 'The atlas is empty'}
            body={
              trips.length
                ? 'The trips on file have already happened. Add the next destination when you are ready.'
                : 'Start with a destination and dates. The countdown will wait here.'
            }
            action={
              <button type="button" className="text-sm text-accent" onClick={() => openAction('trip')}>
                Add a trip
              </button>
            }
          />
        )}
      </div>

      <div className="mt-14 lg:mt-16">
        <HomeTripRail
          trips={otherTrips}
          emptyAction={
            !trips.length ? (
              <button type="button" className="text-sm text-accent" onClick={() => openAction('trip')}>
                Add a trip
              </button>
            ) : null
          }
        />
      </div>

      <div className="mt-14 grid gap-12 lg:mt-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-start lg:gap-16">
        <HomeItinerary
          items={itineraryItems}
          tripId={nextTrip?.id}
          emptyAction={
            nextTrip ? (
              <button type="button" className="text-sm text-accent" onClick={() => openAction('itinerary')}>
                Add a stop
              </button>
            ) : null
          }
        />
        <div className="space-y-12">
          <HomeSpending
            spent={spent}
            budget={budget}
            currency={currency}
            emptyAction={
              <button type="button" className="text-sm text-accent" onClick={() => openAction('expense')}>
                Add expense
              </button>
            }
          />
          <HomeQuickActions
            onExpense={() => openAction('expense')}
            onPlace={() => openAction('place')}
            onBooking={() => openAction('booking')}
            noteHref={noteHref}
          />
        </div>
      </div>

      <div className="mt-16 border-t border-line pt-10 lg:mt-20">
        <HomeActivity activities={recentActivity} users={users} currentUserId={currentUser.id} />
      </div>
    </div>
  )
}
