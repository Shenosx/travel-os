import { useAuth } from './useAuth.jsx'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authUserFromSession } from '../lib/auth/session.js'
import { getUserById, CURRENT_USER_ID } from '../data/mock.js'
import {
  canPersistLocalSnapshot,
  createEmptyAccountSnapshot,
  getUserStorageKey,
  loadSnapshotForAuthUser,
  saveSnapshot,
} from '../data/storage.js'
import {
  acceptInvitation as applyAcceptInvitation,
  acceptInvitationAsInvitee,
  changeMemberRole as applyChangeMemberRole,
  ensureUserForInvite,
  findJoinTarget,
  liveInviteLink,
  isOpenInvitation,
  openInvitationsForEmail,
  removeMember as applyRemoveMember,
  upsertInvitation,
  voteOnPoll,
} from '../lib/collaboration.js'
import { nowIso, todayIso } from '../lib/dates.js'
import { createId } from '../lib/format.js'
import { normalizePendingOp } from '../lib/sync/pendingOps.js'
import { sanitizeTripMigration } from '../lib/migration/mappings.js'
import { clearItineraryRefs, moveItineraryItemRecord, updateItineraryItemRecord } from '../lib/itinerary.js'
import { HOME_CURRENCY, withConvertedAmount } from '../lib/currency.js'
import { validateRepayment } from '../lib/repayments.js'
import { bookingItineraryDate, bookingItineraryPatch, itineraryItemForBooking } from '../lib/bookings.js'
import { categoryToItinerary, itineraryItemForPlace, markPlaceVisited } from '../lib/places.js'
import {
  canDeleteBooking,
  canDeleteExpense,
  canDeleteRepayment,
  canDeletePlace,
  canEditBooking,
  canEditExpense,
  canEditChecklist,
  canEditNotes,
  canEditPacking,
  canEditPlace,
  canOnTrip,
  getTripPermissions,
} from '../lib/permissions.js'
import {
  createChecklistCategory as applyCreateChecklistCategory,
  createChecklistItem as applyCreateChecklistItem,
  createPackingCategory as applyCreatePackingCategory,
  createPackingItem as applyCreatePackingItem,
  deleteChecklistCategory as applyDeleteChecklistCategory,
  deleteChecklistItem as applyDeleteChecklistItem,
  deletePackingCategory as applyDeletePackingCategory,
  deletePackingItem as applyDeletePackingItem,
  personalRowsForUser,
  removePersonalRowsForTrip,
  reorderChecklistCategories as applyReorderChecklistCategories,
  reorderChecklistItems as applyReorderChecklistItems,
  reorderPackingCategories as applyReorderPackingCategories,
  reorderPackingItems as applyReorderPackingItems,
  seedDefaultChecklistCategories as applySeedDefaultChecklistCategories,
  seedDefaultPackingCategories as applySeedDefaultPackingCategories,
  toggleChecklistItemDone as applyToggleChecklistItemDone,
  togglePackingItemPacked as applyTogglePackingItemPacked,
  updateChecklistCategory as applyUpdateChecklistCategory,
  updateChecklistItem as applyUpdateChecklistItem,
  updatePackingCategory as applyUpdatePackingCategory,
  updatePackingItem as applyUpdatePackingItem,
  createNote as applyCreateNote,
  updateNote as applyUpdateNote,
  deleteNote as applyDeleteNote,
  createMemory as applyCreateMemory,
  updateMemory as applyUpdateMemory,
  deleteMemory as applyDeleteMemory,
} from '../lib/planning.js'

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
  const { user: authUser, session, loading: authLoading } = useAuth()
  const cloudUserId = authUser?.id ?? authUserFromSession(session)?.id ?? null
  const accountStorageKey = getUserStorageKey(cloudUserId)
  const [hydratedKey, setHydratedKey] = useState(() => (authLoading ? null : accountStorageKey))
  const [boot] = useState(() =>
    authLoading ? createEmptyAccountSnapshot() : loadSnapshotForAuthUser(cloudUserId).snapshot,
  )

  const [users, setUsers] = useState(() => boot.users)
  const [trips, setTrips] = useState(() => boot.trips)
  const [expenses, setExpenses] = useState(() => boot.expenses)
  const [repayments, setRepayments] = useState(() => boot.repayments ?? [])
  const [itineraries, setItineraries] = useState(() => boot.itineraries)
  const [places, setPlaces] = useState(() => boot.places)
  const [bookings, setBookings] = useState(() => boot.bookings)
  const [invitations, setInvitations] = useState(() => boot.invitations)
  const [activities, setActivities] = useState(() => boot.activities)
  const [polls, setPolls] = useState(() => boot.polls)
  const [pendingOps, setPendingOps] = useState(() => boot.pendingOps ?? [])
  const [tripMigrations, setTripMigrations] = useState(() => boot.tripMigrations ?? [])
  const [packingCategories, setPackingCategories] = useState(() => boot.packingCategories ?? [])
  const [packingItems, setPackingItems] = useState(() => boot.packingItems ?? [])
  const [checklistCategories, setChecklistCategories] = useState(() => boot.checklistCategories ?? [])
  const [checklistItems, setChecklistItems] = useState(() => boot.checklistItems ?? [])
  const [notes, setNotes] = useState(() => boot.notes ?? [])
  const [memories, setMemories] = useState(() => boot.memories ?? [])
  const [sessionUserId, setSessionUserIdState] = useState(readSessionUserId)

  // Load the destination snapshot during render so persist never sees
  // account A's collections with account B's (or a new user's) storage key.
  if (!authLoading && hydratedKey !== accountStorageKey) {
    const snapshot = loadSnapshotForAuthUser(cloudUserId).snapshot
    setHydratedKey(accountStorageKey)
    setUsers(snapshot.users ?? [])
    setTrips(snapshot.trips ?? [])
    setExpenses(snapshot.expenses ?? [])
    setRepayments(snapshot.repayments ?? [])
    setItineraries(snapshot.itineraries ?? [])
    setPlaces(snapshot.places ?? [])
    setBookings(snapshot.bookings ?? [])
    setInvitations(snapshot.invitations ?? [])
    setActivities(snapshot.activities ?? [])
    setPolls(snapshot.polls ?? [])
    setPendingOps(snapshot.pendingOps ?? [])
    setTripMigrations(snapshot.tripMigrations ?? [])
    setPackingCategories(snapshot.packingCategories ?? [])
    setPackingItems(snapshot.packingItems ?? [])
    setChecklistCategories(snapshot.checklistCategories ?? [])
    setChecklistItems(snapshot.checklistItems ?? [])
    setNotes(snapshot.notes ?? [])
    setMemories(snapshot.memories ?? [])
  }

  useEffect(() => {
    if (!canPersistLocalSnapshot({ authLoading, hydratedKey, accountStorageKey })) return

    saveSnapshot(
      {
        users,
        trips,
        expenses,
        repayments,
        itineraries,
        places,
        bookings,
        invitations,
        activities,
        polls,
        pendingOps,
        tripMigrations,
        packingCategories,
        packingItems,
        checklistCategories,
        checklistItems,
        notes,
        memories,
      },
      accountStorageKey,
    )
  }, [
    authLoading,
    hydratedKey,
    accountStorageKey,
    users,
    trips,
    expenses,
    repayments,
    itineraries,
    places,
    bookings,
    invitations,
    activities,
    polls,
    pendingOps,
    tripMigrations,
    packingCategories,
    packingItems,
    checklistCategories,
    checklistItems,
    notes,
    memories,
  ])

  const currentUser =
    getUserById(sessionUserId, users) ?? getUserById(CURRENT_USER_ID, users) ?? users[0]

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
      allInvitations: invitations,
      expenses: expenses.filter((expense) => memberTripIds.has(expense.tripId)),
      repayments: repayments.filter((repayment) => memberTripIds.has(repayment.tripId)),
      itineraries: itineraries.filter((entry) => memberTripIds.has(entry.tripId)),
      places: places.filter((place) => memberTripIds.has(place.tripId)),
      bookings: bookings.filter((booking) => memberTripIds.has(booking.tripId)),
      invitations: invitations.filter(
        (invitation) =>
          memberTripIds.has(invitation.tripId) ||
          (invitation.email.toLowerCase() === currentUser.email.toLowerCase() && isOpenInvitation(invitation)),
      ),
      activities: activities.filter((activity) => memberTripIds.has(activity.tripId)),
      polls: polls.filter((poll) => memberTripIds.has(poll.tripId)),
      packingCategories: personalRowsForUser(packingCategories, currentUser.id),
      packingItems: personalRowsForUser(packingItems, currentUser.id),
      checklistCategories: personalRowsForUser(checklistCategories, currentUser.id),
      checklistItems: personalRowsForUser(checklistItems, currentUser.id),
      notes: personalRowsForUser(notes, currentUser.id),
      memories: personalRowsForUser(memories, currentUser.id),
      pendingOps,
      tripMigrations,
      ready: true,
      upsertTripMigration: (next) => {
        const sanitized = sanitizeTripMigration(next)
        setTripMigrations((current) => {
          const index = current.findIndex(
            (item) => item.id === sanitized.id || item.localTripId === sanitized.localTripId,
          )
          if (index === -1) return [...current, sanitized]
          const copy = [...current]
          copy[index] = sanitized
          return copy
        })
        return sanitized
      },
      enqueuePendingOp: (op) => {
        const next = normalizePendingOp({
          id: op?.id || createId('op'),
          createdAt: nowIso(),
          status: 'pending',
          ...op,
        })
        setPendingOps((current) => {
          if (current.some((item) => item.id === next.id)) return current
          return [...current, next]
        })
        return next
      },
      replacePendingOps: (updater) => {
        setPendingOps((current) => (typeof updater === 'function' ? updater(current) : updater))
      },
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
        if (!current) return null
        const trip = tripById(current.tripId)
        if (!canDeleteExpense(trip, currentUser.id, current)) return null
        setExpenses((list) => list.filter((item) => item.id !== expenseId))
        recordActivity({
          tripId: current.tripId,
          actorId: currentUser.id,
          type: 'expense.delete',
          meta: { title: current.description },
        })
        return current
      },
      restoreExpense: (expense) => {
        if (!expense?.id) return null
        setExpenses((list) => {
          if (list.some((item) => item.id === expense.id)) return list
          return [expense, ...list]
        })
        return expense
      },
      addRepayment: (input) => {
        const trip = tripById(input.tripId)
        if (!canOnTrip(trip, currentUser.id, 'addExpense')) return null
        const memberIds = trip.members.map((member) => member.userId)
        const tripExpenses = expenses.filter((item) => item.tripId === input.tripId)
        const tripRepayments = repayments.filter((item) => item.tripId === input.tripId)
        const check = validateRepayment(input, tripExpenses, tripRepayments, memberIds)
        if (!check.ok) return null
        const stamp = nowIso()
        const next = {
          id: createId('repay'),
          tripId: input.tripId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amount: Number(input.amount),
          currency: input.currency ?? trip.currency ?? HOME_CURRENCY,
          paymentMethod: input.paymentMethod,
          paidAt: input.paidAt ?? todayIso(),
          note: typeof input.note === 'string' ? input.note : '',
          expenseId: input.expenseId || null,
          createdBy: currentUser.id,
          createdAt: stamp,
        }
        setRepayments((current) => [next, ...current])
        recordActivity({
          tripId: next.tripId,
          actorId: currentUser.id,
          type: 'repayment.add',
          meta: { title: String(next.amount) },
        })
        return next
      },
      deleteRepayment: (repaymentId) => {
        const current = repayments.find((item) => item.id === repaymentId)
        if (!current) return null
        const trip = tripById(current.tripId)
        if (!canDeleteRepayment(trip, currentUser.id, current)) return null
        setRepayments((list) => list.filter((item) => item.id !== repaymentId))
        recordActivity({
          tripId: current.tripId,
          actorId: currentUser.id,
          type: 'repayment.delete',
          meta: { title: String(current.amount) },
        })
        return current
      },
      restoreRepayment: (repayment) => {
        if (!repayment?.id) return null
        setRepayments((list) => {
          if (list.some((item) => item.id === repayment.id)) return list
          return [repayment, ...list]
        })
        return repayment
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
      updateItineraryItem: (tripId, itemId, patch) => {
        const trip = tripById(tripId)
        if (!canOnTrip(trip, currentUser.id, 'editItinerary')) return null
        const stamp = nowIso()
        const result = updateItineraryItemRecord(itineraries, tripId, itemId, patch, currentUser.id, stamp)
        if (!result.item) return null
        setItineraries(result.itineraries)
        recordActivity({
          tripId,
          actorId: currentUser.id,
          type: 'itinerary.update',
          meta: { title: result.item.title },
        })
        return result.item
      },
      addPlace: (place) => {
        const trip = tripById(place.tripId)
        if (!canOnTrip(trip, currentUser.id, 'addPlace')) return null
        const stamp = nowIso()
        const next = {
          status: place.plannedDay ? 'planned' : 'saved',
          currency: trip?.currency,
          ...place,
          id: place.id ?? createId('place'),
          createdBy: currentUser.id,
          createdAt: stamp,
        }
        setPlaces((current) => [next, ...current])
        recordActivity({
          tripId: next.tripId,
          actorId: currentUser.id,
          type: 'place.add',
          meta: { title: next.name },
        })
        return next
      },
      updatePlace: (placeId, patch) => {
        const current = places.find((item) => item.id === placeId)
        if (!current) return null
        const trip = tripById(current.tripId)
        if (!canEditPlace(trip, currentUser.id, current)) return null
        const updated = {
          ...current,
          ...patch,
          id: current.id,
          tripId: current.tripId,
          createdBy: current.createdBy,
          createdAt: current.createdAt,
          updatedAt: nowIso(),
        }
        setPlaces((list) => list.map((item) => (item.id === placeId ? updated : item)))
        recordActivity({
          tripId: updated.tripId,
          actorId: currentUser.id,
          type: 'place.update',
          meta: { title: updated.name },
        })
        return updated
      },
      deletePlace: (placeId) => {
        const current = places.find((item) => item.id === placeId)
        if (!current) return false
        const trip = tripById(current.tripId)
        if (!canDeletePlace(trip, currentUser.id, current)) return false
        setPlaces((list) => list.filter((item) => item.id !== placeId))
        setItineraries((list) => clearItineraryRefs(list, current.tripId, { placeId }))
        recordActivity({
          tripId: current.tripId,
          actorId: currentUser.id,
          type: 'place.delete',
          meta: { title: current.name },
        })
        return true
      },
      markPlaceVisited: (placeId) => {
        const current = places.find((item) => item.id === placeId)
        if (!current) return null
        const trip = tripById(current.tripId)
        if (!canEditPlace(trip, currentUser.id, current)) return null
        const updated = { ...markPlaceVisited(current), updatedAt: nowIso() }
        setPlaces((list) => list.map((item) => (item.id === placeId ? updated : item)))
        recordActivity({
          tripId: updated.tripId,
          actorId: currentUser.id,
          type: 'place.update',
          meta: { title: updated.name },
        })
        return updated
      },
      addPlaceToItinerary: (placeId, date, time = '') => {
        const place = places.find((item) => item.id === placeId)
        if (!place || !date) return null
        const trip = tripById(place.tripId)
        if (!canOnTrip(trip, currentUser.id, 'editItinerary')) return null
        const itinerary = itineraries.find((entry) => entry.tripId === place.tripId)
        const existing = itineraryItemForPlace(itinerary, placeId)
        if (existing) {
          const stamp = nowIso()
          const moved = moveItineraryItemRecord(itineraries, place.tripId, existing.item.id, date)
          if (!moved.item) return null
          let nextItem = moved.item
          if (time) {
            const patched = updateItineraryItemRecord(
              moved.itineraries,
              place.tripId,
              existing.item.id,
              { time },
              currentUser.id,
              stamp,
            )
            setItineraries(patched.itineraries)
            nextItem = patched.item
          } else {
            setItineraries(moved.itineraries)
          }
          const nextStatus = place.status === 'visited' ? 'visited' : 'planned'
          setPlaces((list) =>
            list.map((item) =>
              item.id === placeId ? { ...item, plannedDay: date, status: nextStatus, updatedAt: stamp } : item,
            ),
          )
          return nextItem
        }
        const stamp = nowIso()
        const nextItem = {
          id: createId('item'),
          time: time || '',
          category: categoryToItinerary(place.category),
          title: place.name,
          placeId: place.id,
          createdBy: currentUser.id,
          createdAt: stamp,
        }
        setItineraries((current) => {
          const existingEntry = current.find((entry) => entry.tripId === place.tripId)
          if (!existingEntry) {
            return [
              ...current,
              { tripId: place.tripId, days: [{ date, dayNumber: 1, title: '', items: [nextItem] }] },
            ]
          }
          return current.map((entry) => {
            if (entry.tripId !== place.tripId) return entry
            const hasDay = entry.days.some((day) => day.date === date)
            const days = hasDay
              ? entry.days.map((day) =>
                  day.date === date ? { ...day, items: [...day.items, nextItem] } : day,
                )
              : [...entry.days, { date, dayNumber: entry.days.length + 1, title: '', items: [nextItem] }]
            return { ...entry, days }
          })
        })
        const nextStatus = place.status === 'visited' ? 'visited' : 'planned'
        setPlaces((list) =>
          list.map((item) =>
            item.id === placeId ? { ...item, plannedDay: date, status: nextStatus, updatedAt: stamp } : item,
          ),
        )
        recordActivity({
          tripId: place.tripId,
          actorId: currentUser.id,
          type: 'itinerary.add',
          meta: { title: nextItem.title },
        })
        return nextItem
      },
      movePlaceToDay: (placeId, date) => {
        const place = places.find((item) => item.id === placeId)
        if (!place || !date) return null
        const trip = tripById(place.tripId)
        if (!canOnTrip(trip, currentUser.id, 'editItinerary')) return null
        const itinerary = itineraries.find((entry) => entry.tripId === place.tripId)
        const existing = itineraryItemForPlace(itinerary, placeId)
        if (!existing) {
          return null
        }
        const moved = moveItineraryItemRecord(itineraries, place.tripId, existing.item.id, date)
        if (!moved.item) return null
        setItineraries(moved.itineraries)
        const nextStatus = place.status === 'visited' ? 'visited' : 'planned'
        setPlaces((list) =>
          list.map((item) =>
            item.id === placeId ? { ...item, plannedDay: date, status: nextStatus, updatedAt: nowIso() } : item,
          ),
        )
        recordActivity({
          tripId: place.tripId,
          actorId: currentUser.id,
          type: 'itinerary.update',
          meta: { title: place.name },
        })
        return moved.item
      },
      addBooking: (booking) => {
        const trip = tripById(booking.tripId)
        if (!canOnTrip(trip, currentUser.id, 'addBooking')) return null
        const stamp = nowIso()
        const next = {
          type: 'other',
          status: 'confirmed',
          currency: trip?.currency,
          documents: [],
          ...booking,
          id: booking.id ?? createId('book'),
          createdBy: currentUser.id,
          createdAt: stamp,
        }
        setBookings((current) => [next, ...current])
        recordActivity({
          tripId: next.tripId,
          actorId: currentUser.id,
          type: 'booking.add',
          meta: { title: next.title },
        })
        return next
      },
      updateBooking: (bookingId, patch) => {
        const current = bookings.find((item) => item.id === bookingId)
        if (!current) return null
        const trip = tripById(current.tripId)
        if (!canEditBooking(trip, currentUser.id, current)) return null
        const updated = {
          ...current,
          ...patch,
          id: current.id,
          tripId: current.tripId,
          createdBy: current.createdBy,
          createdAt: current.createdAt,
          updatedAt: nowIso(),
        }
        setBookings((list) => list.map((item) => (item.id === bookingId ? updated : item)))
        recordActivity({
          tripId: updated.tripId,
          actorId: currentUser.id,
          type: 'booking.update',
          meta: { title: updated.title },
        })
        return updated
      },
      deleteBooking: (bookingId) => {
        const current = bookings.find((item) => item.id === bookingId)
        if (!current) return false
        const trip = tripById(current.tripId)
        if (!canDeleteBooking(trip, currentUser.id, current)) return false
        setBookings((list) => list.filter((item) => item.id !== bookingId))
        setItineraries((list) => clearItineraryRefs(list, current.tripId, { bookingId }))
        recordActivity({
          tripId: current.tripId,
          actorId: currentUser.id,
          type: 'booking.delete',
          meta: { title: current.title },
        })
        return true
      },
      addBookingToItinerary: (bookingId, date, time) => {
        const booking = bookings.find((item) => item.id === bookingId)
        if (!booking) return null
        const trip = tripById(booking.tripId)
        if (!canOnTrip(trip, currentUser.id, 'editItinerary')) return null
        const day = date || bookingItineraryDate(booking, trip)
        if (!day) return null
        const itinerary = itineraries.find((entry) => entry.tripId === booking.tripId)
        const existing = itineraryItemForBooking(itinerary, bookingId)
        const patch = bookingItineraryPatch(booking)
        if (time) patch.time = time
        if (existing) {
          const moved = moveItineraryItemRecord(itineraries, booking.tripId, existing.item.id, day)
          if (!moved.item) return null
          const result = updateItineraryItemRecord(
            moved.itineraries,
            booking.tripId,
            existing.item.id,
            patch,
            currentUser.id,
            nowIso(),
          )
          setItineraries(result.itineraries)
          return result.item
        }
        const stamp = nowIso()
        const nextItem = {
          id: createId('item'),
          ...patch,
          createdBy: currentUser.id,
          createdAt: stamp,
        }
        setItineraries((current) => {
          const existingEntry = current.find((entry) => entry.tripId === booking.tripId)
          if (!existingEntry) {
            return [
              ...current,
              { tripId: booking.tripId, days: [{ date: day, dayNumber: 1, title: '', items: [nextItem] }] },
            ]
          }
          return current.map((entry) => {
            if (entry.tripId !== booking.tripId) return entry
            const hasDay = entry.days.some((entryDay) => entryDay.date === day)
            const days = hasDay
              ? entry.days.map((entryDay) =>
                  entryDay.date === day ? { ...entryDay, items: [...entryDay.items, nextItem] } : entryDay,
                )
              : [...entry.days, { date: day, dayNumber: entry.days.length + 1, title: '', items: [nextItem] }]
            return { ...entry, days }
          })
        })
        recordActivity({
          tripId: booking.tripId,
          actorId: currentUser.id,
          type: 'itinerary.add',
          meta: { title: nextItem.title },
        })
        return nextItem
      },
      inviteMember: (tripId, { email, role, status = 'pending' }) => {
        const trip = tripById(tripId)
        if (!trip) return { ok: false, reason: 'Trip not found.' }
        const ensured = ensureUserForInvite(users, email)
        const result = upsertInvitation({
          trip,
          users: ensured.users,
          invitations,
          actorId: currentUser.id,
          email,
          role,
          status,
          name: ensured.user.name,
        })
        if (!result.ok) return result
        if (ensured.created) setUsers(ensured.users)
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
          link: liveInviteLink(trip, result.invitation),
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
      joinByToken: (inviteCode, inviteToken) => {
        const found = findJoinTarget(trips, invitations, inviteCode, inviteToken)
        if (!found.ok) return found
        const result = acceptInvitationAsInvitee({
          trip: found.trip,
          invitation: found.invitation,
          users,
        })
        if (!result.ok) return result
        setUsers(result.users)
        setTrips((current) => current.map((item) => (item.id === found.trip.id ? result.trip : item)))
        setInvitations((current) =>
          current.map((item) => (item.id === found.invitation.id ? result.invitation : item)),
        )
        setSessionUserId(result.joinedUser.id)
        recordActivity({
          tripId: found.trip.id,
          actorId: result.joinedUser.id,
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
        setExpenses((current) => current.filter((item) => item.tripId !== tripId))
        setRepayments((current) => current.filter((item) => item.tripId !== tripId))
        setItineraries((current) => current.filter((item) => item.tripId !== tripId))
        setPlaces((current) => current.filter((item) => item.tripId !== tripId))
        setBookings((current) => current.filter((item) => item.tripId !== tripId))
        setPackingCategories((current) => removePersonalRowsForTrip(current, tripId))
        setPackingItems((current) => removePersonalRowsForTrip(current, tripId))
        setChecklistCategories((current) => removePersonalRowsForTrip(current, tripId))
        setChecklistItems((current) => removePersonalRowsForTrip(current, tripId))
        setNotes((current) => removePersonalRowsForTrip(current, tripId))
        setMemories((current) => removePersonalRowsForTrip(current, tripId))
        return true
      },
      ensurePackingCategories: (tripId) => {
        const trip = tripById(tripId)
        if (!trip || !canEditPacking(trip, currentUser.id)) return false
        const result = applySeedDefaultPackingCategories(packingCategories, tripId, currentUser.id, { now: nowIso() })
        if (!result.seeded) return false
        setPackingCategories(result.categories)
        return true
      },
      addPackingCategory: ({ tripId, name } = {}) => {
        const trip = tripById(tripId)
        if (!trip || !canEditPacking(trip, currentUser.id)) return null
        const result = applyCreatePackingCategory(
          packingCategories,
          { tripId, userId: currentUser.id, name },
          { now: nowIso() },
        )
        if (!result.category) return null
        setPackingCategories(result.categories)
        return result.category
      },
      updatePackingCategory: (categoryId, patch) => {
        const current = packingCategories.find((row) => row.id === categoryId)
        if (!canEditPacking(tripById(current?.tripId), currentUser.id)) return null
        const result = applyUpdatePackingCategory(packingCategories, categoryId, currentUser.id, patch, nowIso())
        if (!result.category) return null
        setPackingCategories(result.categories)
        return result.category
      },
      reorderPackingCategories: (tripId, orderedIds) => {
        if (!canEditPacking(tripById(tripId), currentUser.id)) return false
        const result = applyReorderPackingCategories(packingCategories, tripId, currentUser.id, orderedIds, nowIso())
        if (!result.ok) return false
        setPackingCategories(result.categories)
        return true
      },
      deletePackingCategory: (categoryId) => {
        const current = packingCategories.find((row) => row.id === categoryId)
        if (!canEditPacking(tripById(current?.tripId), currentUser.id)) return false
        const result = applyDeletePackingCategory(packingCategories, packingItems, categoryId, currentUser.id)
        if (!result.ok) return false
        setPackingCategories(result.categories)
        setPackingItems(result.items)
        return true
      },
      addPackingItem: (input = {}) => {
        const trip = tripById(input.tripId)
        if (!trip || !canEditPacking(trip, currentUser.id)) return null
        const result = applyCreatePackingItem(
          packingItems,
          packingCategories,
          { ...input, userId: currentUser.id },
          { now: nowIso() },
        )
        if (!result.item) return null
        setPackingItems(result.items)
        return result.item
      },
      updatePackingItem: (itemId, patch) => {
        const current = packingItems.find((row) => row.id === itemId)
        if (!canEditPacking(tripById(current?.tripId), currentUser.id)) return null
        const result = applyUpdatePackingItem(packingItems, packingCategories, itemId, currentUser.id, patch, nowIso())
        if (!result.item) return null
        setPackingItems(result.items)
        return result.item
      },
      togglePackingItemPacked: (itemId) => {
        const current = packingItems.find((row) => row.id === itemId)
        if (!canEditPacking(tripById(current?.tripId), currentUser.id)) return null
        const result = applyTogglePackingItemPacked(packingItems, itemId, currentUser.id, nowIso())
        if (!result.item) return null
        setPackingItems(result.items)
        return result.item
      },
      reorderPackingItems: (categoryId, orderedIds) => {
        const current = packingCategories.find((row) => row.id === categoryId)
        if (!canEditPacking(tripById(current?.tripId), currentUser.id)) return false
        const result = applyReorderPackingItems(packingItems, categoryId, currentUser.id, orderedIds, nowIso())
        if (!result.ok) return false
        setPackingItems(result.items)
        return true
      },
      deletePackingItem: (itemId) => {
        const current = packingItems.find((row) => row.id === itemId)
        if (!canEditPacking(tripById(current?.tripId), currentUser.id)) return false
        const result = applyDeletePackingItem(packingItems, itemId, currentUser.id)
        if (!result.ok) return false
        setPackingItems(result.items)
        return true
      },
      ensureChecklistCategories: (tripId) => {
        const trip = tripById(tripId)
        if (!trip || !canEditChecklist(trip, currentUser.id)) return false
        const result = applySeedDefaultChecklistCategories(
          checklistCategories,
          tripId,
          currentUser.id,
          { now: nowIso() },
        )
        if (!result.seeded) return false
        setChecklistCategories(result.categories)
        return true
      },
      addChecklistCategory: ({ tripId, phase, name } = {}) => {
        const trip = tripById(tripId)
        if (!trip || !canEditChecklist(trip, currentUser.id)) return null
        const result = applyCreateChecklistCategory(
          checklistCategories,
          { tripId, userId: currentUser.id, phase, name },
          { now: nowIso() },
        )
        if (!result.category) return null
        setChecklistCategories(result.categories)
        return result.category
      },
      updateChecklistCategory: (categoryId, patch) => {
        const current = checklistCategories.find((row) => row.id === categoryId)
        if (!canEditChecklist(tripById(current?.tripId), currentUser.id)) return null
        const result = applyUpdateChecklistCategory(checklistCategories, categoryId, currentUser.id, patch, nowIso())
        if (!result.category) return null
        setChecklistCategories(result.categories)
        return result.category
      },
      reorderChecklistCategories: (tripId, phase, orderedIds) => {
        if (!canEditChecklist(tripById(tripId), currentUser.id)) return false
        const result = applyReorderChecklistCategories(
          checklistCategories,
          tripId,
          currentUser.id,
          phase,
          orderedIds,
          nowIso(),
        )
        if (!result.ok) return false
        setChecklistCategories(result.categories)
        return true
      },
      deleteChecklistCategory: (categoryId) => {
        const current = checklistCategories.find((row) => row.id === categoryId)
        if (!canEditChecklist(tripById(current?.tripId), currentUser.id)) return false
        const result = applyDeleteChecklistCategory(
          checklistCategories,
          checklistItems,
          categoryId,
          currentUser.id,
        )
        if (!result.ok) return false
        setChecklistCategories(result.categories)
        setChecklistItems(result.items)
        return true
      },
      addChecklistItem: (input = {}) => {
        const trip = tripById(input.tripId)
        if (!trip || !canEditChecklist(trip, currentUser.id)) return null
        const result = applyCreateChecklistItem(
          checklistItems,
          checklistCategories,
          { ...input, userId: currentUser.id },
          { now: nowIso() },
        )
        if (!result.item) return null
        setChecklistItems(result.items)
        return result.item
      },
      updateChecklistItem: (itemId, patch) => {
        const current = checklistItems.find((row) => row.id === itemId)
        if (!canEditChecklist(tripById(current?.tripId), currentUser.id)) return null
        const result = applyUpdateChecklistItem(
          checklistItems,
          checklistCategories,
          itemId,
          currentUser.id,
          patch,
          nowIso(),
        )
        if (!result.item) return null
        setChecklistItems(result.items)
        return result.item
      },
      toggleChecklistItemDone: (itemId) => {
        const current = checklistItems.find((row) => row.id === itemId)
        if (!canEditChecklist(tripById(current?.tripId), currentUser.id)) return null
        const result = applyToggleChecklistItemDone(checklistItems, itemId, currentUser.id, nowIso())
        if (!result.item) return null
        setChecklistItems(result.items)
        return result.item
      },
      reorderChecklistItems: (categoryId, orderedIds) => {
        const current = checklistCategories.find((row) => row.id === categoryId)
        if (!canEditChecklist(tripById(current?.tripId), currentUser.id)) return false
        const result = applyReorderChecklistItems(checklistItems, categoryId, currentUser.id, orderedIds, nowIso())
        if (!result.ok) return false
        setChecklistItems(result.items)
        return true
      },
      deleteChecklistItem: (itemId) => {
        const current = checklistItems.find((row) => row.id === itemId)
        if (!canEditChecklist(tripById(current?.tripId), currentUser.id)) return false
        const result = applyDeleteChecklistItem(checklistItems, itemId, currentUser.id)
        if (!result.ok) return false
        setChecklistItems(result.items)
        return true
      },
      addNote: (input = {}) => {
        const trip = tripById(input.tripId)
        if (!trip || !canEditNotes(trip, currentUser.id)) return null
        const result = applyCreateNote(notes, { ...input, userId: currentUser.id }, { now: nowIso() })
        if (!result.note) return null
        setNotes(result.notes)
        return result.note
      },
      updateNote: (noteId, patch) => {
        const current = notes.find((row) => row.id === noteId)
        if (!canEditNotes(tripById(current?.tripId), currentUser.id)) return null
        const result = applyUpdateNote(notes, noteId, currentUser.id, patch, nowIso())
        if (!result.note) return null
        setNotes(result.notes)
        return result.note
      },
      deleteNote: (noteId) => {
        const current = notes.find((row) => row.id === noteId)
        if (!canEditNotes(tripById(current?.tripId), currentUser.id)) return false
        const result = applyDeleteNote(notes, noteId, currentUser.id)
        if (!result.ok) return false
        setNotes(result.notes)
        return true
      },
      addMemory: (input = {}) => {
        if (!tripById(input.tripId)) return null
        const result = applyCreateMemory(memories, { ...input, userId: currentUser.id }, { now: nowIso() })
        if (!result.memory) return null
        setMemories(result.memories)
        return result.memory
      },
      updateMemory: (memoryId, patch) => {
        const result = applyUpdateMemory(memories, memoryId, currentUser.id, patch, nowIso())
        if (!result.memory) return null
        setMemories(result.memories)
        return result.memory
      },
      deleteMemory: (memoryId) => {
        const result = applyDeleteMemory(memories, memoryId, currentUser.id)
        if (!result.ok) return false
        setMemories(result.memories)
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
    bookings,
    checklistCategories,
    checklistItems,
    currentUser,
    expenses,
    invitations,
    itineraries,
    packingCategories,
    packingItems,
    pendingOps,
    places,
    polls,
    notes,
    memories,
    tripMigrations,
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
