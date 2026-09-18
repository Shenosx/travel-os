import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'
import { useCloudSync } from './useCloudSync.jsx'
import {
  cloudBookingCapabilities,
  createCloudBooking,
  deleteCloudBooking,
  getCloudTripBookings,
  updateCloudBooking,
} from '../lib/trips/bookings.js'

export function useCloudTripBookings(trip) {
  const { session, user } = useAuth()
  const { runCloudWrite } = useCloudSync()
  const tripId = trip?.id ?? null
  const [bookings, setBookings] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setBookings([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { bookings: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [bookingResult, memberResult] = await Promise.all([
      getCloudTripBookings({ client, session, tripId }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setBookings(bookingResult.bookings)
    setMembers(memberResult.members)
    setError(bookingResult.error || memberResult.error)
    setLoading(false)
    return {
      bookings: bookingResult.bookings,
      members: memberResult.members,
      error: bookingResult.error || memberResult.error,
    }
  }, [session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setBookings([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['bookings', 'access', 'gone'], handleRealtime)

  const myRole = members.find((member) => member.userId === user?.id)?.role ?? null
  const capabilities = cloudBookingCapabilities(myRole, user?.id)

  const save = useCallback(
    async (input) => {
      const isUpdate = Boolean(input?.id)
      const result = await runCloudWrite({
        op: {
          entity: 'booking',
          action: isUpdate ? 'update' : 'create',
          cloudTripId: tripId,
          cloudEntityId: isUpdate ? input.id : undefined,
          payload: input,
        },
        mutate: (op) =>
          op.action === 'update'
            ? updateCloudBooking({ client: getSupabaseClient(), session, id: op.cloudEntityId, changes: op.payload })
            : createCloudBooking({
                client: getSupabaseClient(),
                session,
                tripId: op.cloudTripId,
                input: op.payload,
                id: op.cloudEntityId,
              }),
      })
      if (result.booking) await reload()
      return result
    },
    [reload, runCloudWrite, session, tripId],
  )

  const remove = useCallback(
    async (id) => {
      const result = await runCloudWrite({
        op: {
          entity: 'booking',
          action: 'delete',
          cloudTripId: tripId,
          cloudEntityId: id,
          payload: { id },
        },
        mutate: (op) => deleteCloudBooking({ client: getSupabaseClient(), session, id: op.cloudEntityId }),
      })
      if (result.ok) setBookings((current) => current.filter((booking) => booking.id !== id))
      return result
    },
    [runCloudWrite, session, tripId],
  )

  return {
    bookings,
    members,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    role: myRole,
    canCreate: capabilities.canCreate,
    canEditBooking: (booking) => cloudBookingCapabilities(myRole, user?.id, booking).canEdit,
    canDeleteBooking: (booking) => cloudBookingCapabilities(myRole, user?.id, booking).canDelete,
    reload,
    save,
    remove,
  }
}
