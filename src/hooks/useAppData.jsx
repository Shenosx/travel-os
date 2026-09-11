import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  CURRENT_USER_ID,
  activities as seedActivities,
  expenses as seedExpenses,
  invitations as seedInvitations,
  itineraries as seedItineraries,
  places as seedPlaces,
  polls as seedPolls,
  trips as seedTrips,
  users as seedUsers,
  getUserById,
} from '../data/mock.js'
import {
  acceptInvitation as applyAcceptInvitation,
  changeMemberRole as applyChangeMemberRole,
  inviteLink,
  isOpenInvitation,
  openInvitationsForEmail,
  removeMember as applyRemoveMember,
  upsertInvitation,
  voteOnPoll,
} from '../lib/collaboration.js'
import { nowIso } from '../lib/dates.js'
import { HOME_CURRENCY, withConvertedAmount } from '../lib/currency.js'
import { createId } from '../lib/format.js'
import {
  canDeleteExpense,
  canEditExpense,
  canOnTrip,
  getTripPermissions,
} from '../lib/permissions.js'

const AppDataContext = createContext(null)
const SESSION_KEY = 'travel-os-session-user'

function readSessionUserId() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || CURRENT_USER_ID
  } catch {
    return CURRENT_USER_ID
  }
}

function writeSessionUserId(userId) {
  try {
    sessionStorage.setItem(SESSION_KEY, userId)
  } catch {
    /* ignore */
  }
}

function prepareExpense(expense, trips) {
  const trip = trips.find((item) => item.id === expense.tripId)
  const to = trip?.currency ?? HOME_CURRENCY
  return withConvertedAmount(
    {
      currency: expense.currency ?? to,
      ...expense,
      id: expense.id ?? createId('exp'),
    },
    to,
  )
}

function isTripVisible(trip, user, invitations) {
  if (!trip || !user) return false
  if (trip.members.some((member) => member.userId === user.id)) return true
  return openInvitationsForEmail(invitations, user.email).some((invitation) => invitation.tripId === trip.id)
}

export function AppDataProvider({ children }) {
  const [users] = useState(seedUsers)
  const [trips, setTrips] = useState(seedTrips)
  const [expenses, setExpenses] = useState(seedExpenses)
  const [itineraries, setItineraries] = useState(seedItineraries)
  const [places, setPlaces] = useState(seedPlaces)
  const [invitations, setInvitations] = useState(seedInvitations)
  const [activities, setActivities] = useState(seedActivities)
  const [polls, setPolls] = useState(seedPolls)
  const [sessionUserId, setSessionUserIdState] = useState(readSessionUserId)

  const currentUser = getUserById(sessionUserId, users) ?? getUserById(CURRENT_USER_ID, users)

  const setSessionUserId = useCallback((userId) => {
    writeSessionUserId(userId)
    setSessionUserIdState(userId)
  }, [])

  const recordActivity = useCallback((entry) => {
    const next = {
      id: createId('act'),
      createdAt: nowIso(),
      ...entry,
    }
    setActivities((current) => [next, ...current])
    return next
  }, [])

  const value = useMemo(() => {
    const memberTrips = trips.filter((trip) => trip.members.some((member) => member.userId === currentUser.id))
    const visibleTrips = trips.filter((trip) => isTripVisible(trip, currentUser, invitations))
    const memberTripIds = new Set(memberTrips.map((trip) => trip.id))

    function tripById(tripId) {
      return trips.find((trip) => trip.id === tripId) ?? null
    }

    return {
      currentUser,
      sessionUserId: currentUser.id,
      isPreviewing: currentUser.id !== CURRENT_USER_ID,
      setSessionUserId,
      homeUserId: CURRENT_USER_ID,
      users,
      trips: visibleTrips,
      allTrips: trips,
      expenses: expenses.filter((expense) => memberTripIds.has(expense.tripId)),
      itineraries: itineraries.filter((entry) => memberTripIds.has(entry.tripId)),
      places: places.filter((place) => memberTripIds.has(place.tripId)),
      invitations: invitations.filter(
        (invitation) =>
          memberTripIds.has(invitation.tripId) ||
          (invitation.email.toLowerCase() === currentUser.email.toLowerCase() && isOpenInvitation(invitation)),
      ),
      activities: activities.filter((activity) => memberTripIds.has(activity.tripId)),
      polls: polls.filter((poll) => memberTripIds.has(poll.tripId)),
      permissionsFor: (trip) => getTripPermissions(trip, currentUser.id),
      addTrip: (trip) => {
        const id = trip.id ?? createId('trip')
        const next = {
          visibility: 'private',
          ownerId: currentUser.id,
          members: [{ userId: currentUser.id, role: 'owner' }],
          inviteCode: id.replace('trip-', ''),
          notes: '',
          currency: 'MYR',
          ...trip,
          id,
        }
        setTrips((current) => [next, ...current])
        return next
      },
      addExpense: (expense) => {
        const trip = tripById(expense.tripId)
        if (!canOnTrip(trip, currentUser.id, 'addExpense')) return null
        const stamp = nowIso()
        const next = prepareExpense(
          {
            ...expense,
            createdBy: currentUser.id,
            createdAt: stamp,
          },
          trips,
        )
        setExpenses((current) => [next, ...current])
        recordActivity({
          tripId: next.tripId,
          actorId: currentUser.id,
          type: 'expense.add',
          meta: { title: next.description },
        })
        return next
      },
      updateExpense: (expenseId, patch) => {
        const current = expenses.find((item) => item.id === expenseId)
        if (!current) return null
        const trip = tripById(current.tripId)
        if (!canEditExpense(trip, currentUser.id, current)) return null
        const updated = prepareExpense(
          { ...current, ...patch, id: expenseId, createdBy: current.createdBy, updatedAt: nowIso() },
          trips,
        )
        setExpenses((list) => list.map((item) => (item.id === expenseId ? updated : item)))
        recordActivity({
          tripId: updated.tripId,
          actorId: currentUser.id,
          type: 'expense.update',
          meta: { title: updated.description },
        })
        return updated
      },
      deleteExpense: (expenseId) => {
        const current = expenses.find((item) => item.id === expenseId)
        if (!current) return false
        const trip = tripById(current.tripId)
        if (!canDeleteExpense(trip, currentUser.id, current)) return false
        setExpenses((list) => list.filter((item) => item.id !== expenseId))
        recordActivity({
          tripId: current.tripId,
          actorId: currentUser.id,
          type: 'expense.delete',
          meta: { title: current.description },
        })
        return true
      },
      addItineraryItem: (tripId, date, item) => {
        const trip = tripById(tripId)
        if (!canOnTrip(trip, currentUser.id, 'editItinerary')) return null
        const stamp = nowIso()
        const nextItem = {
          id: createId('item'),
          time: '',
          category: 'free',
          ...item,
          createdBy: currentUser.id,
          createdAt: stamp,
        }
        setItineraries((current) => {
          const existing = current.find((entry) => entry.tripId === tripId)
          if (!existing) {
            return [
              ...current,
              {
                tripId,
                days: [{ date, dayNumber: 1, title: '', items: [nextItem] }],
              },
            ]
          }
          return current.map((entry) => {
            if (entry.tripId !== tripId) return entry
            const hasDay = entry.days.some((day) => day.date === date)
            const days = hasDay
              ? entry.days.map((day) =>
                  day.date === date ? { ...day, items: [...day.items, nextItem] } : day,
                )
              : [
                  ...entry.days,
                  { date, dayNumber: entry.days.length + 1, title: '', items: [nextItem] },
                ]
            return { ...entry, days }
          })
        })
        recordActivity({
          tripId,
          actorId: currentUser.id,
          type: 'itinerary.add',
          meta: { title: nextItem.title },
        })
        return nextItem
      },
      addPlace: (place) => {
        const trip = tripById(place.tripId)
        if (!canOnTrip(trip, currentUser.id, 'addPlace')) return null
        const next = { id: createId('place'), ...place }
        setPlaces((current) => [next, ...current])
        recordActivity({
          tripId: next.tripId,
          actorId: currentUser.id,
          type: 'place.add',
          meta: { title: next.name },
        })
        return next
      },
      inviteMember: (tripId, { email, role, status = 'pending' }) => {
        const trip = tripById(tripId)
        if (!trip) return { ok: false, reason: 'Trip not found.' }
        const result = upsertInvitation({
          trip,
          users,
          invitations,
          actorId: currentUser.id,
          email,
          role,
          status,
        })
        if (!result.ok) return result
        setInvitations(result.invitations)
        setTrips((current) =>
          current.map((item) =>
            item.id === tripId ? { ...item, visibility: 'shared' } : item,
          ),
        )
        if (result.created) {
          recordActivity({
            tripId,
            actorId: currentUser.id,
            type: 'member.invite',
            meta: { name: result.invitation.name, role: result.invitation.role },
          })
        }
        return {
          ok: true,
          invitation: result.invitation,
          link: inviteLink(trip, result.invitation),
        }
      },
      withdrawInvitation: (invitationId) => {
        const invitation = invitations.find((item) => item.id === invitationId)
        if (!invitation || !isOpenInvitation(invitation)) return false
        const trip = tripById(invitation.tripId)
        if (!canOnTrip(trip, currentUser.id, 'inviteMembers')) return false
        setInvitations((current) => current.filter((item) => item.id !== invitationId))
        return true
      },
      acceptInvitation: (invitationId) => {
        const invitation = invitations.find((item) => item.id === invitationId)
        if (!invitation) return { ok: false, reason: 'Invitation not found.' }
        const trip = tripById(invitation.tripId)
        if (!trip) return { ok: false, reason: 'Trip not found.' }
        const result = applyAcceptInvitation({
          trip,
          invitation,
          users,
          actorId: currentUser.id,
        })
        if (!result.ok) return result
        setTrips((current) => current.map((item) => (item.id === trip.id ? result.trip : item)))
        setInvitations((current) =>
          current.map((item) => (item.id === invitation.id ? result.invitation : item)),
        )
        recordActivity({
          tripId: trip.id,
          actorId: currentUser.id,
          type: 'member.join',
          meta: { name: result.joinedUser.shortName || result.joinedUser.name },
        })
        return result
      },
      updateMemberRole: (tripId, targetUserId, nextRole) => {
        const trip = tripById(tripId)
        if (!trip) return { ok: false, reason: 'Trip not found.' }
        const result = applyChangeMemberRole(trip, currentUser.id, targetUserId, nextRole)
        if (!result.ok) return result
        const target = users.find((user) => user.id === targetUserId)
        setTrips((current) => current.map((item) => (item.id === tripId ? result.trip : item)))
        recordActivity({
          tripId,
          actorId: currentUser.id,
          type: 'member.role',
          meta: { name: target?.shortName || target?.name || 'them', role: nextRole },
        })
        return result
      },
      removeMember: (tripId, targetUserId) => {
        const trip = tripById(tripId)
        if (!trip) return { ok: false, reason: 'Trip not found.' }
        const result = applyRemoveMember(trip, currentUser.id, targetUserId)
        if (!result.ok) return result
        const target = users.find((user) => user.id === targetUserId)
        setTrips((current) => current.map((item) => (item.id === tripId ? result.trip : item)))
        recordActivity({
          tripId,
          actorId: currentUser.id,
          type: 'member.remove',
          meta: { name: target?.shortName || target?.name || 'them' },
        })
        return result
      },
      deleteTrip: (tripId) => {
        const trip = tripById(tripId)
        if (!canOnTrip(trip, currentUser.id, 'deleteTrip')) return false
        setTrips((current) => current.filter((item) => item.id !== tripId))
        setInvitations((current) => current.filter((item) => item.tripId !== tripId))
        setActivities((current) => current.filter((item) => item.tripId !== tripId))
        setPolls((current) => current.filter((item) => item.tripId !== tripId))
        return true
      },
      votePoll: (pollId, optionId) => {
        const poll = polls.find((item) => item.id === pollId)
        if (!poll) return null
        const trip = tripById(poll.tripId)
        if (!canOnTrip(trip, currentUser.id, 'votePoll')) return null
        const result = voteOnPoll(poll, currentUser.id, optionId)
        if (!result.ok) return null
        setPolls((current) => current.map((item) => (item.id === pollId ? result.poll : item)))
        return result.poll
      },
    }
  }, [
    activities,
    currentUser,
    expenses,
    invitations,
    itineraries,
    places,
    polls,
    recordActivity,
    setSessionUserId,
    trips,
    users,
  ])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) throw new Error('useAppData must be used within AppDataProvider')
  return context
}
