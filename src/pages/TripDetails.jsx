import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ExpensePanel } from '../components/trip/ExpensePanel.jsx'
import { ItineraryTimeline } from '../components/trip/ItineraryTimeline.jsx'
import { MapPanel } from '../components/trip/MapPanel.jsx'
import { PeoplePanel } from '../components/trip/PeoplePanel.jsx'
import { TripOverview } from '../components/trip/TripOverview.jsx'
import { TripStatusBadge } from '../components/trips/TripCard.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { Tabs } from '../components/ui/Tabs.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { isOpenInvitation, openInvitationsForEmail } from '../lib/collaboration.js'
import { formatDateRange } from '../lib/dates.js'
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
    users,
    currentUser,
    invitations,
    polls,
    votePoll,
    acceptInvitation,
    permissionsFor,
  } = useAppData()
  const trip = trips.find((item) => item.id === tripId)

  const tab = TABS.some((item) => item.id === params.get('tab')) ? params.get('tab') : 'overview'

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
      </div>

      <div className="mt-8">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(next) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })}
        />
      </div>

      <div className="mt-8">
        {tab === 'overview' ? (
          <TripOverview
            trip={trip}
            spent={spent}
            members={members}
            itinerary={itinerary}
            currentUserId={currentUser.id}
            finance={finance}
            poll={poll}
            canVote={permissions.canVote}
            onVote={(optionId) => votePoll(poll.id, optionId)}
          />
        ) : null}
        {tab === 'itinerary' ? (
          <ItineraryTimeline itinerary={itinerary} users={users} currentUserId={currentUser.id} />
        ) : null}
        {tab === 'map' ? <MapPanel places={tripPlaces} destination={trip.destination} /> : null}
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
      </div>
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
