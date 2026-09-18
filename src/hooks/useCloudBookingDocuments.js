import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import {
  cloudDocumentCapabilities,
  deleteCloudBookingDocument,
  getCloudBookingDocuments,
  getCloudBookingDocumentUrl,
  uploadCloudBookingDocument,
} from '../lib/trips/documents.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'

export function useCloudBookingDocuments(trip, booking) {
  const { session, user } = useAuth()
  const tripId = trip?.id ?? null
  const bookingId = booking?.id ?? null
  const [documents, setDocuments] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !bookingId || !session?.user) {
      setDocuments([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { documents: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [documentResult, memberResult] = await Promise.all([
      getCloudBookingDocuments({ client, session, tripId, bookingId }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setDocuments(documentResult.documents)
    setMembers(memberResult.members)
    const nextError = documentResult.error || memberResult.error
    setError(nextError)
    setLoading(false)
    return {
      documents: documentResult.documents,
      members: memberResult.members,
      error: nextError,
    }
  }, [bookingId, session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setDocuments([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['documents', 'access', 'gone'], handleRealtime)

  const myRole = members.find((member) => member.userId === user?.id)?.role ?? null
  const capabilities = cloudDocumentCapabilities(myRole)

  const upload = useCallback(
    async (file) => {
      const result = await uploadCloudBookingDocument({
        client: getSupabaseClient(),
        session,
        tripId,
        bookingId,
        file,
      })
      if (result.document) await reload()
      return result
    },
    [bookingId, reload, session, tripId],
  )

  const open = useCallback(
    async (id) => {
      return getCloudBookingDocumentUrl({
        client: getSupabaseClient(),
        session,
        id,
        tripId,
        bookingId,
      })
    },
    [bookingId, session, tripId],
  )

  const remove = useCallback(
    async (id) => {
      const result = await deleteCloudBookingDocument({
        client: getSupabaseClient(),
        session,
        id,
        tripId,
        bookingId,
      })
      if (result.ok) setDocuments((current) => current.filter((document) => document.id !== id))
      return result
    },
    [bookingId, session, tripId],
  )

  return {
    documents,
    members,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    role: myRole,
    canUpload: capabilities.canUpload,
    canDelete: capabilities.canDelete,
    reload,
    upload,
    open,
    remove,
  }
}
