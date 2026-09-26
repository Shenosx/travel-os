import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BookingsPanel } from '../components/bookings/BookingsPanel.jsx'
import { PlacesPanel } from '../components/places/PlacesPanel.jsx'
import { ExpensePanel } from '../components/trip/ExpensePanel.jsx'
import { ItineraryWorkspace } from '../components/trip/ItineraryTimeline.jsx'
import { MapPanel } from '../components/trip/MapPanel.jsx'
import { PackingView } from '../components/trip/packing/PackingView.jsx'
import { ChecklistView } from '../components/trip/checklist/ChecklistView.jsx'
import { NotesView } from '../components/trip/notes/NotesView.jsx'
import { PeoplePanel } from '../components/trip/PeoplePanel.jsx'
import { TripOverview } from '../components/trip/TripOverview.jsx'
import { MoveToCloudSheet } from '../components/trips/MoveToCloudSheet.jsx'
import { TripInsights } from '../components/trip/TripInsights.jsx'
import { ExportPdfButton } from '../components/trip/ExportPdfButton.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { isOpenInvitation, openInvitationsForEmail } from '../lib/collaboration.js'
import { formatDateRange, resolveSelectedCalendarDate } from '../lib/dates.js'
import { CALENDAR_VIEWS, ITINERARY_VIEWS } from '../lib/itinerary.js'
import { getExpensesForTrip, getSpendingSummary } from '../lib/expenses.js'
import { membersForTrip, peopleForTrip } from '../lib/people.js'
import {
  checklistProgress,
  checklistRowsForTripUser,
  notesForTripUser,
  packingPercent,
  packingProgress,
  packingRowsForTripUser,
} from '../lib/planning.js'
import { describeTripCountdown, getTripSpending, STATUS_LABEL } from '../lib/trips.js'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'map', label: 'Map' },
  { id: 'places', label: 'Places' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'people', label: 'People' },
  { id: 'insights', label: 'Insights' },
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
    packingItems,
    packingCategories,
    checklistItems,
    checklistCategories,
    notes,
    repayments,
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
  const notesOpen = params.get('notes') === '1'
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

  function openPacking() {
    setParams({ packing: '1' }, { replace: true })
  }

  function openChecklist() {
    setParams({ checklist: '1' }, { replace: true })
  }

  function openNotes() {
    setParams({ notes: '1' }, { replace: true })
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
  const tripPackingItems = packingRowsForTripUser(packingItems, trip.id, currentUser.id)
  const packing = {
    ...packingProgress(tripPackingItems),
    percent: packingPercent(tripPackingItems),
  }
  const tripChecklistItems = checklistRowsForTripUser(checklistItems, trip.id, currentUser.id)
  const checklist = checklistProgress(tripChecklistItems)
  const tripNotes = notesForTripUser(notes, trip.id, currentUser.id)
  const people = peopleForTrip(trip, tripExpenses, users)
  const finance = getSpendingSummary(tripExpenses, currentUser.id)
  const poll = polls.find((item) => item.tripId === trip.id)
  const recentActivity = activities
    .filter((activity) => activity.tripId === trip.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4)

  const countdown = describeTripCountdown(trip)
  const showCountdown = countdown.status === 'upcoming' && countdown.value != null

  return (
    <div>
      <Link to="/trips" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trips
      </Link>

      <header className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">
            {STATUS_LABEL[countdown.status]}
            <span className="text-ink-muted">
              {' '}
              · {trip.visibility === 'shared' ? 'Shared' : 'Personal'}
            </span>
          </p>
          <h1 className="font-display mt-3 break-words text-[40px] leading-[1.02] tracking-[-0.045em] text-ink sm:text-[56px]">
            {trip.city || trip.destination}
          </h1>
          {trip.country ? <p className="mt-2 text-[15px] text-ink-muted">{trip.country}</p> : null}
          <p className="mt-4 text-[15px] text-ink">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>

        <div className="flex flex-wrap items-end gap-6">
          {showCountdown ? (
            <div>
              <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Departs in</p>
              <p className="font-display mt-2 text-[44px] leading-none tracking-[-0.05em] text-ink sm:text-[52px]">
                {countdown.value}
                <span className="ml-1.5 font-sans text-[13px] tracking-normal text-ink-muted">
                  {countdown.value === 1 ? 'day' : 'days'}
                </span>
              </p>
            </div>
          ) : countdown.status === 'ongoing' ? (
            <p className="font-display text-[22px] tracking-[-0.03em] text-ink">{countdown.label}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <ExportPdfButton
              input={{
                trip,
                itinerary,
                places: tripPlaces,
                bookings: tripBookings,
                expenses: tripExpenses,
                repayments,
                users,
                currentUserId: currentUser.id,
                packingCategories,
                packingItems,
                checklistCategories,
                checklistItems,
                notes,
              }}
            />
            {configured && cloudUser ? (
              <Button variant="outline" onClick={() => setMigrateOpen(true)}>
                Move to Cloud
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-8 sm:mt-10">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="mt-8">
        {packingOpen ? (
          <PackingView tripId={trip.id} canEdit={permissions.canEditPacking} />
        ) : checklistOpen ? (
          <ChecklistView tripId={trip.id} canEdit={permissions.canEditChecklist} />
        ) : notesOpen ? (
          <NotesView tripId={trip.id} canEdit={permissions.canEditNotes} />
        ) : (
          <>
        {tab === 'overview' ? (
          <TripOverview
            trip={trip}
            spent={spent}
            members={members}
            itinerary={itinerary}
            places={tripPlaces}
            bookings={tripBookings}
            expenses={tripExpenses}
            invitations={invitations}
            currentUserId={currentUser.id}
            finance={finance}
            poll={poll}
            activities={recentActivity}
            users={users}
            permissions={permissions}
            canVote={permissions.canVote}
            onVote={(optionId) => votePoll(poll.id, optionId)}
            onOpenTab={setTab}
            onOpenPlace={(placeId) => setPlaceSelection(placeId, { tab: 'places' })}
            packing={packing}
            onOpenPacking={openPacking}
            checklist={checklist}
            onOpenChecklist={openChecklist}
            notesCount={tripNotes.length}
            onOpenNotes={openNotes}
            onOpenBooking={(bookingId) =>
              setParams({ tab: 'bookings', booking: bookingId }, { replace: true })
            }
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
                view: itineraryView,
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
        {tab === 'insights' ? (
          <TripInsights
            trip={trip}
            expenses={tripExpenses}
            currentUserId={currentUser.id}
            canAdd={permissions.canAddExpense}
          />
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
