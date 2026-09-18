import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import { getCloudTripActivity } from '../lib/trips/activity.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'

export function useCloudTripActivity(trip) {
  const { session, user } = useAuth()
  const tripId = trip?.id ?? null
  const [activities, setActivities] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setActivities([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { activities: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [activityResult, memberResult] = await Promise.all([
      getCloudTripActivity({ client, session, tripId }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setActivities(activityResult.activities)
    setMembers(memberResult.members)
    const nextError = activityResult.error || memberResult.error
    setError(nextError)
    setLoading(false)
    return { activities: activityResult.activities, members: memberResult.members, error: nextError }
  }, [session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setActivities([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['activity', 'access', 'gone'], handleRealtime)

  return {
    activities,
    members,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    reload,
  }
}
