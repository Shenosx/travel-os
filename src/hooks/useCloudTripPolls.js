import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import {
  cloudPollCapabilities,
  createCloudPoll,
  deleteCloudPoll,
  getCloudTripPolls,
  updateCloudPoll,
  voteCloudPoll,
} from '../lib/trips/polls.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'

export function useCloudTripPolls(trip) {
  const { session, user } = useAuth()
  const tripId = trip?.id ?? null
  const [polls, setPolls] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setPolls([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { polls: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [pollResult, memberResult] = await Promise.all([
      getCloudTripPolls({ client, session, tripId, currentUserId: user?.id }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setPolls(pollResult.polls)
    setMembers(memberResult.members)
    const nextError = pollResult.error || memberResult.error
    setError(nextError)
    setLoading(false)
    return { polls: pollResult.polls, members: memberResult.members, error: nextError }
  }, [session, tripId, user?.id])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setPolls([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['polls', 'access', 'gone'], handleRealtime)

  const myRole = members.find((member) => member.userId === user?.id)?.role ?? null
  const capabilities = cloudPollCapabilities(myRole)

  const create = useCallback(
    async (input) => {
      const result = await createCloudPoll({ client: getSupabaseClient(), session, tripId, input })
      if (result.poll) await reload()
      return result
    },
    [reload, session, tripId],
  )

  const update = useCallback(
    async (id, changes) => {
      const result = await updateCloudPoll({ client: getSupabaseClient(), session, id, changes })
      if (result.poll) await reload()
      return result
    },
    [reload, session],
  )

  const remove = useCallback(
    async (id) => {
      const result = await deleteCloudPoll({ client: getSupabaseClient(), session, id })
      if (result.ok) setPolls((current) => current.filter((poll) => poll.id !== id))
      return result
    },
    [session],
  )

  const vote = useCallback(
    async (pollId, optionId) => {
      const result = await voteCloudPoll({ client: getSupabaseClient(), session, pollId, optionId })
      if (result.vote) await reload()
      return result
    },
    [reload, session],
  )

  return {
    polls,
    members,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    role: myRole,
    canCreate: capabilities.canCreate,
    canEdit: capabilities.canEdit,
    canDelete: capabilities.canDelete,
    canVote: capabilities.canVote,
    reload,
    create,
    update,
    remove,
    vote,
  }
}
