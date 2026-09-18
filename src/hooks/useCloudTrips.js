import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import {
  cloudTripsForSignedOut,
  createCloudTrip,
  deleteCloudTrip,
  getCloudTrips,
  updateCloudTrip,
} from '../lib/trips/cloud.js'
import { useCloudSync } from './useCloudSync.jsx'

export function useCloudTrips() {
  const { configured, session, user } = useAuth()
  const { runCloudWrite } = useCloudSync()
  const [trips, setTrips] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!configured || !session || !user) {
      const cleared = cloudTripsForSignedOut()
      setTrips(cleared.trips)
      setError(cleared.error)
      setLoading(false)
      return cleared
    }

    const result = await getCloudTrips({ client: getSupabaseClient(), session })
    setTrips(result.trips)
    setError(result.error)
    return result
  }, [configured, session, user])

  useEffect(() => {
    if (!configured || !session || !user) {
      reload()
      return undefined
    }

    let cancelled = false
    setLoading(true)
    reload().then(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [configured, session, user, reload])

  const createTrip = useCallback(
    async (input) => {
      const result = await runCloudWrite({
        op: {
          entity: 'trip',
          action: 'create',
          payload: input,
        },
        mutate: (op) =>
          createCloudTrip({ client: getSupabaseClient(), session, input: op.payload, id: op.cloudEntityId }),
      })
      if (result.trip) {
        setTrips((current) => [result.trip, ...current.filter((trip) => trip.id !== result.trip.id)])
        setError(null)
      }
      return result
    },
    [runCloudWrite, session],
  )

  const updateTrip = useCallback(
    async (id, changes) => {
      const result = await runCloudWrite({
        op: {
          entity: 'trip',
          action: 'update',
          cloudTripId: id,
          cloudEntityId: id,
          payload: changes,
        },
        mutate: (op) =>
          updateCloudTrip({ client: getSupabaseClient(), session, id: op.cloudEntityId, changes: op.payload }),
      })
      if (result.trip) {
        setTrips((current) => current.map((trip) => (trip.id === result.trip.id ? result.trip : trip)))
        setError(null)
      }
      return result
    },
    [runCloudWrite, session],
  )

  const deleteTrip = useCallback(
    async (id) => {
      const result = await runCloudWrite({
        op: {
          entity: 'trip',
          action: 'delete',
          cloudTripId: id,
          cloudEntityId: id,
          payload: { id },
        },
        mutate: (op) => deleteCloudTrip({ client: getSupabaseClient(), session, id: op.cloudEntityId }),
      })
      if (result.ok) {
        setTrips((current) => current.filter((trip) => trip.id !== id))
        setError(null)
      }
      return result
    },
    [runCloudWrite, session],
  )

  return {
    trips,
    error,
    loading,
    visible: Boolean(configured && session && user),
    currentUserId: user?.id ?? null,
    reload,
    createTrip,
    updateTrip,
    deleteTrip,
  }
}
