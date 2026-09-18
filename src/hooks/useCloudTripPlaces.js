import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'
import { useCloudSync } from './useCloudSync.jsx'
import {
  cloudPlaceCapabilities,
  cloudPlaceVisitedChanges,
  createCloudPlace,
  deleteCloudPlace,
  getCloudTripPlaces,
  updateCloudPlace,
} from '../lib/trips/places.js'

export function useCloudTripPlaces(trip) {
  const { session, user } = useAuth()
  const { runCloudWrite } = useCloudSync()
  const tripId = trip?.id ?? null
  const [places, setPlaces] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setPlaces([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { places: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [placeResult, memberResult] = await Promise.all([
      getCloudTripPlaces({ client, session, tripId }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setPlaces(placeResult.places)
    setMembers(memberResult.members)
    setError(placeResult.error || memberResult.error)
    setLoading(false)
    return {
      places: placeResult.places,
      members: memberResult.members,
      error: placeResult.error || memberResult.error,
    }
  }, [session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setPlaces([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['places', 'access', 'gone'], handleRealtime)

  const myRole = members.find((member) => member.userId === user?.id)?.role ?? null
  const capabilities = cloudPlaceCapabilities(myRole, user?.id)

  const save = useCallback(
    async (input) => {
      const isUpdate = Boolean(input?.id)
      const result = await runCloudWrite({
        op: {
          entity: 'place',
          action: isUpdate ? 'update' : 'create',
          cloudTripId: tripId,
          cloudEntityId: isUpdate ? input.id : undefined,
          payload: input,
        },
        mutate: (op) =>
          op.action === 'update'
            ? updateCloudPlace({ client: getSupabaseClient(), session, id: op.cloudEntityId, changes: op.payload })
            : createCloudPlace({
                client: getSupabaseClient(),
                session,
                tripId: op.cloudTripId,
                input: op.payload,
                id: op.cloudEntityId,
              }),
      })
      if (result.place) await reload()
      return result
    },
    [reload, runCloudWrite, session, tripId],
  )

  const remove = useCallback(
    async (id) => {
      const result = await runCloudWrite({
        op: {
          entity: 'place',
          action: 'delete',
          cloudTripId: tripId,
          cloudEntityId: id,
          payload: { id },
        },
        mutate: (op) => deleteCloudPlace({ client: getSupabaseClient(), session, id: op.cloudEntityId }),
      })
      if (result.ok) setPlaces((current) => current.filter((place) => place.id !== id))
      return result
    },
    [runCloudWrite, session, tripId],
  )

  const markVisited = useCallback(
    async (place) => {
      if (!place?.id) return { place: null, error: 'That place could not be found.' }
      const result = await runCloudWrite({
        op: {
          entity: 'place',
          action: 'update',
          cloudTripId: tripId,
          cloudEntityId: place.id,
          payload: cloudPlaceVisitedChanges(place),
        },
        mutate: (op) =>
          updateCloudPlace({
            client: getSupabaseClient(),
            session,
            id: op.cloudEntityId,
            changes: op.payload,
          }),
      })
      if (result.place) await reload()
      return result
    },
    [reload, runCloudWrite, session, tripId],
  )

  return {
    places,
    members,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    role: myRole,
    canCreate: capabilities.canCreate,
    canEditPlace: (place) => cloudPlaceCapabilities(myRole, user?.id, place).canEdit,
    canDeletePlace: (place) => cloudPlaceCapabilities(myRole, user?.id, place).canDelete,
    reload,
    save,
    remove,
    markVisited,
  }
}
