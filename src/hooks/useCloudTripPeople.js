import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import {
  createCloudInvitation,
  getCloudTripInvitations,
  isOpenCloudInvitation,
  revokeCloudInvitation,
} from '../lib/trips/invitations.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'

export function useCloudTripPeople(trip) {
  const { session, user } = useAuth()
  const tripId = trip?.id ?? null
  const inviteCode = trip?.inviteCode ?? ''
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setMembers([])
      setInvitations([])
      setError(null)
      setLoading(false)
      return { members: [], invitations: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [people, invites] = await Promise.all([
      getCloudTripMembers({ client, session, tripId }),
      getCloudTripInvitations({ client, session, tripId }),
    ])
    setMembers(people.members)
    setInvitations(invites.invitations)
    setError(people.error || invites.error)
    setLoading(false)
    return {
      members: people.members,
      invitations: invites.invitations,
      error: people.error || invites.error,
    }
  }, [session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setMembers([])
        setInvitations([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['people', 'access', 'gone'], handleRealtime)

  const invite = useCallback(
    async ({ email, role, invitedName }) => {
      const result = await createCloudInvitation({
        client: getSupabaseClient(),
        session,
        tripId,
        email,
        role,
        invitedName,
        inviteCode,
      })
      if (!result.error) await reload()
      return result
    },
    [inviteCode, reload, session, tripId],
  )

  const revoke = useCallback(
    async (id) => {
      const result = await revokeCloudInvitation({ client: getSupabaseClient(), session, id })
      if (result.ok) {
        setInvitations((current) =>
          current.map((item) => (item.id === id ? { ...item, status: 'revoked' } : item)),
        )
      }
      return result
    },
    [session],
  )

  return {
    members,
    invitations,
    pending: invitations.filter(isOpenCloudInvitation),
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    reload,
    invite,
    revoke,
  }
}
