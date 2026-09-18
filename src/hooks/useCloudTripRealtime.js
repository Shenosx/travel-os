import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import {
  cloudRealtimeRegistry,
  formatCloudRealtimeError,
} from '../lib/realtime/cloudRealtime.js'

export function useCloudRealtimeRefresh(tripId, domains, onRefresh) {
  const { session } = useAuth()
  const [liveError, setLiveError] = useState(null)
  const domainKey = Array.isArray(domains) ? domains.join(',') : ''

  const handleChange = useCallback(
    (nextDomains) => {
      if (!Array.isArray(nextDomains) || !onRefresh) return
      const wanted = new Set(domainKey.split(',').filter(Boolean))
      if (nextDomains.some((domain) => wanted.has(domain))) onRefresh(nextDomains)
    },
    [domainKey, onRefresh],
  )

  useEffect(() => {
    const client = getSupabaseClient()
    if (!client || !session?.user || !tripId) {
      setLiveError(null)
      return undefined
    }

    const handle = cloudRealtimeRegistry.retain({
      client,
      session,
      tripId,
      listener: {
        onChange: handleChange,
        onStatus(status, error) {
          if (status === 'SUBSCRIBED') setLiveError(null)
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setLiveError(formatCloudRealtimeError(error || status))
          }
        },
      },
    })

    return () => handle.release()
  }, [handleChange, session, tripId])

  return { liveError }
}
