import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BookingsPanel } from '../components/bookings/BookingsPanel.jsx'
import { PlacesPanel } from '../components/places/PlacesPanel.jsx'
import { ExpensePanel } from '../components/trip/ExpensePanel.jsx'
import { ItineraryWorkspace } from '../components/trip/ItineraryTimeline.jsx'
import { MapPanel } from '../components/trip/MapPanel.jsx'
import { PackingView } from '../components/trip/packing/PackingView.jsx'
import { ChecklistView } from '../components/trip/checklist/ChecklistView.jsx'
import { PeoplePanel } from '../components/trip/PeoplePanel.jsx'
import { TripOverview } from '../components/trip/TripOverview.jsx'
import { MoveToCloudSheet } from '../components/trips/MoveToCloudSheet.jsx'
import { TripStatusBadge } from '../components/trips/TripCard.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { isOpenInvitation, openInvitationsForEmail } from '../lib/collaboration.js'
import { formatDateRange, resolveSelectedCalendarDate } from '../lib/dates.js'
import { CALENDAR_VIEWS, ITINERARY_VIEWS } from '../lib/itinerary.js'
import {
  getBalances,
  getExpenseActorIds,
  getExpensesForTrip,
  getSettlements,
  getSpendingSummary,
  getUserSettlement,
} from '../lib/expenses.js'
import { membersForTrip, peopleForTrip } from '../lib/people.js'
import { getTripDurationDays, getTripSpending } from '../lib/trips.js'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'map', label: 'Map' },
  { id: 'places', label: 'Places' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'people', label: 'People' },
]

export function TripDetailsPage() {
  const { tripId } = useParams()
  const [params, setParams] = useSearchParams()
  const {
    trips,
    expenses,
    itineraries,
    places,
    bookings,
    users,
    currentUser,
    invitations,
    polls,
    activities,
    votePoll,
    acceptInvitation,
    permissionsFor,
    pendingOps,
    tripMigrations,
    upsertTripMigration,
  } = useAppData()
  const { configured, user: cloudUser } = useAuth()
  const [migrateOpen, setMigrateOpen] = useState(false)
  const trip = trips.find((item) => item.id === tripId)

  const tab = TABS.some((item) => item.id === params.get('tab')) ? params.get('tab') : 'overview'
  const packingOpen = params.get('packing') === '1'
  const checklistOpen = params.get('checklist') === '1'
  const selectedPlaceId = params.get('place')
  const selectedItemId = params.get('item')
  const selectedBookingId = params.get('booking')
  const itineraryView = ITINERARY_VIEWS.includes(params.get('view')) ? params.get('view') : 'list'
  const requestedDate = params.get('date')

  function writeTripParams({
    tab: nextTab = tab,
    place,
    item,
    booking,
    view: nextView,
    date,
  } = {}) {
    const out = {}
    if (nextTab !== 'overview') out.tab = nextTab
    const placeValue = place !== undefined ? place : selectedPlaceId
    const itemValue = item !== undefined ? item : selectedItemId
    const bookingValue = booking !== undefined ? booking : selectedBookingId
    const viewValue = nextView !== undefined ? nextView : itineraryView
    const dateValue = date !== undefined ? date : requestedDate

    if (placeValue && (nextTab === 'places' || nextTab === 'map' || nextTab === 'itinerary')) {
      out.place = placeValue
    }
    if (itemValue && (nextTab === 'itinerary' || nextTab === 'map')) {
      out.item = itemValue
    }
    if (bookingValue && nextTab === 'bookings') {
      out.booking = bookingValue
    }
    if (nextTab === 'itinerary') {
      if (CALENDAR_VIEWS.has(viewValue)) out.view = viewValue
      if (dateValue) out.date = dateValue
    }
    setParams(out, { replace: true })
  }

  function setTab(next) {
    writeTripParams({ tab: next, view: next === 'itinerary' ? itineraryView : 'list' })
  }

  function setPlaceSelection(placeId, extra = {}) {
    writeTripParams({
      tab: extra.tab ?? (tab === 'overview' ? 'places' : tab),
      place: placeId || '',
      item: 'item' in extra ? extra.item : '',
      view: extra.view,
      date: extra.date,
    })
  }

  const members = useMemo(() => (trip ? membersForTrip(trip, users) : []), [trip, users])
  const invite = trip
    ? openInvitationsForEmail(invitations, currentUser.email).find((item) => item.tripId === trip.id)
    : null
  const isMember = Boolean(trip?.members.some((member) => member.userId === currentUser.id))

  if (!trip) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-3xl tracking-[-0.03em]">Trip not found</p>
        <Link to="/trips" className="mt-4 inline-block text-sm text-accent">
          Back to trips
        </Link>
      </div>
    )
  }

  if (!isMember && invite && isOpenInvitation(invite)) {
    return (
      <JoinTripScreen
        trip={trip}
        invitation={invite}
        onJoin={() => acceptInvitation(invite.id)}
      />
    )
  }

  if (!isMember) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-3xl tracking-[-0.03em]">This trip is private</p>
        <Link to="/trips" className="mt-4 inline-block text-sm text-accent">
          Back to trips
        </Link>
      </div>
    )
  }

  const permissions = permissionsFor(trip)
  const spent = getTripSpending(expenses, trip.id)
  const itinerary = itineraries.find((entry) => entry.tripId === trip.id)
  const tripPlaces = places.filter((place) => place.tripId === trip.id)
  const tripBookings = bookings.filter((booking) => booking.tripId === trip.id)
  const tripExpenses = getExpensesForTrip(expenses, trip.id)
  const people = peopleForTrip(trip, tripExpenses, users)
  const finance = (() => {
    const actorIds = getExpenseActorIds(tripExpenses, trip.members.map((member) => member.userId))
    const balances = getBalances(tripExpenses, actorIds)
    const transfers = getSettlements(balances)
    const userSettlement = getUserSettlement(transfers, currentUser.id)
    const summary = getSpendingSummary(tripExpenses, currentUser.id)
    return {
      ...summary,
      youOweTotal: userSettlement.youOweTotal,
      youReceiveTotal: userSettlement.youReceiveTotal,
    }
  })()
  const poll = polls.find((item) => item.tripId === trip.id)
  const recentActivity = activities
    .filter((activity) => activity.tripId === trip.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4)

  return (
    <div>
      <Link to="/trips" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trips
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TripStatusBadge trip={trip} />
            <Badge tone="muted">{trip.visibility === 'shared' ? 'Shared' : 'Private'}</Badge>
          </div>
          <h1 className="font-display mt-3 text-[40px] leading-[1.05] tracking-[-0.04em] sm:text-[52px]">
            {trip.city}
          </h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            {trip.country}
            <span className="text-ink-subtle"> · {formatDateRange(trip.startDate, trip.endDate)}</span>
            <span className="text-ink-subtle"> · {getTripDurationDays(trip)} days</span>
          </p>
        </div>
        {configured && cloudUser ? (
          <Button variant="outline" onClick={() => setMigrateOpen(true)}>
            Move to Cloud
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-8">
        {packingOpen ? (
          <PackingView tripId={trip.id} />
        ) : checklistOpen ? (
          <ChecklistView tripId={trip.id} />
        ) : (
          <>
        {tab === 'overview' ? (
          <TripOverview
            trip={trip}
            spent={spent}
            members={members}
            itinerary={itinerary}
            currentUserId={currentUser.id}
            finance={finance}
            poll={poll}
            activities={recentActivity}
            users={users}
            canVote={permissions.canVote}
            onVote={(optionId) => votePoll(poll.id, optionId)}
          />
        ) : null}
        {tab === 'itinerary' ? (
          <ItineraryWorkspace
            trip={trip}
            itinerary={itinerary}
            places={tripPlaces}
            bookings={tripBookings}
            users={users}
            currentUserId={currentUser.id}
            canEdit={permissions.canEditItinerary}
            selectedItemId={selectedItemId}
            selectedPlaceId={selectedPlaceId}
            view={itineraryView}
            selectedDate={resolveSelectedCalendarDate(trip, requestedDate)}
            onViewChange={(next) => {
              writeTripParams({
                tab: 'itinerary',
                view: next,
                date: resolveSelectedCalendarDate(trip, requestedDate),
              })
            }}
            onSelectDate={(iso) =>
              writeTripParams({
                tab: 'itinerary',
                view: CALENDAR_VIEWS.has(itineraryView) ? itineraryView : 'month',
                date: iso,
              })
            }
            onSelectItem={(item, date) =>
              setPlaceSelection(item.placeId, {
                tab: 'itinerary',
                item: item.id,
                date,
              })
            }
            onSelectPlace={(placeId) => setPlaceSelection(placeId, { tab: 'itinerary', item: selectedItemId })}
          />
        ) : null}
        {tab === 'map' ? (
          <MapPanel
            trip={trip}
            places={tripPlaces}
            itinerary={itinerary}
            users={users}
            currentUserId={currentUser.id}
            selectedPlaceId={selectedPlaceId}
            itineraryPlaceId={
              itinerary?.days?.flatMap((day) => day.items).find((item) => item.id === selectedItemId)?.placeId ??
              selectedPlaceId
            }
            onSelectPlace={(placeId) => setPlaceSelection(placeId, { tab: 'map', item: selectedItemId })}
            canAdd={permissions.canAddPlace}
          />
        ) : null}
        {tab === 'places' ? (
          <PlacesPanel
            trip={trip}
            places={tripPlaces}
            itinerary={itinerary}
            users={users}
            currentUserId={currentUser.id}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(placeId) => setPlaceSelection(placeId, { tab: 'places' })}
            canAdd={permissions.canAddPlace}
          />
        ) : null}
        {tab === 'bookings' ? (
          <BookingsPanel
            trip={trip}
            bookings={tripBookings}
            selectedBookingId={selectedBookingId}
            onSelectBooking={(bookingId) => setParams({ tab: 'bookings', booking: bookingId }, { replace: true })}
            canAdd={permissions.canAddBooking}
          />
        ) : null}
        {tab === 'expenses' ? (
          <ExpensePanel
            trip={trip}
            expenses={tripExpenses}
            members={people}
            currency={trip.currency}
            currentUserId={currentUser.id}
            canAdd={permissions.canAddExpense}
            canEditExpense={permissions.canEditExpense}
          />
        ) : null}
        {tab === 'people' ? (
          <PeoplePanel trip={trip} members={members} currentUserId={currentUser.id} />
        ) : null}
          </>
        )}
      </div>
      {migrateOpen ? (
        <MoveToCloudSheet
          trip={trip}
          places={tripPlaces}
          bookings={tripBookings}
          expenses={tripExpenses}
          itinerary={itinerary}
          polls={polls.filter((poll) => poll.tripId === trip.id)}
          invitations={invitations.filter((invitation) => invitation.tripId === trip.id)}
          activities={activities.filter((activity) => activity.tripId === trip.id)}
          users={users}
          pendingOps={pendingOps}
          existingMigration={tripMigrations.find((item) => item.localTripId === trip.id) ?? null}
          onPersist={upsertTripMigration}
          onClose={() => setMigrateOpen(false)}
        />
      ) : null}
    </div>
  )
}

function JoinTripScreen({ trip, invitation, onJoin }) {
  return (
    <div className="mx-auto max-w-[420px] py-10">
      <Link to="/trips" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trips
      </Link>
      <Card className="mt-6 p-6 sm:p-8">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">You’re invited</p>
        <h1 className="font-display mt-3 text-[36px] leading-tight tracking-[-0.04em]">{trip.city}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Join this trip as {invitation.role === 'editor' ? 'an editor' : 'a viewer'}. You can look around
          once you’re on the list.
        </p>
        <p className="mt-4 text-[13px] text-ink-subtle">{trip.country} · {formatDateRange(trip.startDate, trip.endDate)}</p>
        <Button className="mt-6 w-full" onClick={onJoin}>
          Join the trip
        </Button>
      </Card>
    </div>
  )
}
