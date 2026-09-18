import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import { getCloudTripBookings } from '../lib/trips/bookings.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import { getCloudTripPlaces } from '../lib/trips/places.js'
import {
  assembleCloudItinerary,
  cloudItineraryCapabilities,
  cloudItineraryDayNumberFor,
  createCloudItineraryDay,
  createCloudItineraryItem,
  deleteCloudItineraryDay,
  deleteCloudItineraryItem,
  getCloudItineraryDays,
  getCloudItineraryItems,
  moveCloudItineraryItem,
  nextCloudItinerarySortOrder,
  reorderCloudItineraryItems,
  updateCloudItineraryDay,
  updateCloudItineraryItem,
} from '../lib/trips/itinerary.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'
import { useCloudSync } from './useCloudSync.jsx'

export function useCloudTripItinerary(trip) {
  const { session, user } = useAuth()
  const { runCloudWrite } = useCloudSync()
  const tripId = trip?.id ?? null
  const [days, setDays] = useState([])
  const [items, setItems] = useState([])
  const [places, setPlaces] = useState([])
  const [bookings, setBookings] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setDays([])
      setItems([])
      setPlaces([])
      setBookings([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { days: [], items: [], places: [], bookings: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [dayResult, itemResult, placeResult, bookingResult, memberResult] = await Promise.all([
      getCloudItineraryDays({ client, session, tripId }),
      getCloudItineraryItems({ client, session, tripId }),
      getCloudTripPlaces({ client, session, tripId }),
      getCloudTripBookings({ client, session, tripId }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setDays(dayResult.days)
    setItems(itemResult.items)
    setPlaces(placeResult.places)
    setBookings(bookingResult.bookings)
    setMembers(memberResult.members)
    const nextError =
      dayResult.error || itemResult.error || placeResult.error || bookingResult.error || memberResult.error
    setError(nextError)
    setLoading(false)
    return {
      days: dayResult.days,
      items: itemResult.items,
      places: placeResult.places,
      bookings: bookingResult.bookings,
      members: memberResult.members,
      error: nextError,
    }
  }, [session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setDays([])
        setItems([])
        setPlaces([])
        setBookings([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['itinerary', 'access', 'gone'], handleRealtime)

  const itinerary = useMemo(() => assembleCloudItinerary(days, items), [days, items])
  const myRole = members.find((member) => member.userId === user?.id)?.role ?? null
  const capabilities = cloudItineraryCapabilities(myRole)

  const saveDay = useCallback(
    async (input) => {
      const isUpdate = Boolean(input?.id)
      const result = await runCloudWrite({
        op: {
          entity: 'itinerary_day',
          action: isUpdate ? 'update' : 'create',
          cloudTripId: tripId,
          cloudEntityId: isUpdate ? input.id : undefined,
          payload: {
            ...input,
            dayNumber: input.dayNumber ?? cloudItineraryDayNumberFor(trip, input.date, days),
          },
        },
        mutate: (op) =>
          op.action === 'update'
            ? updateCloudItineraryDay({ client: getSupabaseClient(), session, id: op.cloudEntityId, changes: op.payload })
            : createCloudItineraryDay({
                client: getSupabaseClient(),
                session,
                tripId: op.cloudTripId,
                input: op.payload,
                id: op.cloudEntityId,
              }),
      })
      if (result.day) await reload()
      return result
    },
    [days, reload, runCloudWrite, session, trip, tripId],
  )

  const removeDay = useCallback(
    async (id) => {
      const result = await runCloudWrite({
        op: {
          entity: 'itinerary_day',
          action: 'delete',
          cloudTripId: tripId,
          cloudEntityId: id,
          payload: { id },
        },
        mutate: (op) => deleteCloudItineraryDay({ client: getSupabaseClient(), session, id: op.cloudEntityId }),
      })
      if (result.ok) await reload()
      return result
    },
    [reload, runCloudWrite, session, tripId],
  )

  const saveItem = useCallback(
    async (input) => {
      const client = getSupabaseClient()
      const day = days.find((entry) => entry.date === (input.itemDate || input.date))
      const nextDate = input.itemDate || input.date
      const current = input?.id ? items.find((entry) => entry.id === input.id) : null
      const moving = Boolean(current && nextDate && current.itemDate !== nextDate)
      const payload = {
        ...input,
        dayId: input.dayId ?? day?.id ?? null,
      }
      if (!input?.id || moving) {
        payload.sortOrder = input.sortOrder ?? nextCloudItinerarySortOrder(
          items.filter((entry) => entry.id !== input.id),
          nextDate,
        )
      }
      const isUpdate = Boolean(input?.id)
      const result = await runCloudWrite({
        op: {
          entity: 'itinerary_item',
          action: isUpdate ? 'update' : 'create',
          cloudTripId: tripId,
          cloudEntityId: isUpdate ? input.id : undefined,
          payload,
        },
        mutate: (op) =>
          op.action === 'update'
            ? updateCloudItineraryItem({ client, session, id: op.cloudEntityId, changes: op.payload })
            : createCloudItineraryItem({
                client,
                session,
                tripId: op.cloudTripId,
                input: op.payload,
                id: op.cloudEntityId,
              }),
      })
      if (result.item) await reload()
      return result
    },
    [days, items, reload, runCloudWrite, session, tripId],
  )

  const removeItem = useCallback(
    async (id) => {
      const result = await runCloudWrite({
        op: {
          entity: 'itinerary_item',
          action: 'delete',
          cloudTripId: tripId,
          cloudEntityId: id,
          payload: { id },
        },
        mutate: (op) => deleteCloudItineraryItem({ client: getSupabaseClient(), session, id: op.cloudEntityId }),
      })
      if (result.ok) setItems((current) => current.filter((item) => item.id !== id))
      return result
    },
    [runCloudWrite, session, tripId],
  )

  const moveItem = useCallback(
    async (item, itemDate) => {
      const day = days.find((entry) => entry.date === itemDate)
      const result = await runCloudWrite({
        op: {
          entity: 'itinerary_item',
          action: 'update',
          cloudTripId: tripId,
          cloudEntityId: item.id,
          payload: {
            itemDate,
            dayId: day?.id ?? null,
            sortOrder: nextCloudItinerarySortOrder(items.filter((entry) => entry.id !== item.id), itemDate),
          },
        },
        mutate: (op) =>
          moveCloudItineraryItem({
            client: getSupabaseClient(),
            session,
            id: op.cloudEntityId,
            itemDate: op.payload.itemDate,
            dayId: op.payload.dayId,
            sortOrder: op.payload.sortOrder,
          }),
      })
      if (result.item) await reload()
      return result
    },
    [days, items, reload, runCloudWrite, session, tripId],
  )

  const reorderDay = useCallback(
    async (itemDate, orderedIds) => {
      const result = await reorderCloudItineraryItems({
        client: getSupabaseClient(),
        session,
        orderedIds,
      })
      if (!result.error) await reload()
      return result
    },
    [reload, session],
  )

  return {
    itinerary,
    days,
    items,
    places,
    bookings,
    members,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    role: myRole,
    canCreate: capabilities.canCreate,
    canEdit: capabilities.canEdit,
    canDelete: capabilities.canDelete,
    reload,
    saveDay,
    removeDay,
    saveItem,
    removeItem,
    moveItem,
    reorderDay,
  }
}
