import { CLOUD_REALTIME_UNAVAILABLE } from '../../lib/realtime/cloudRealtime.js'

export function CloudLiveStatus({ error }) {
  if (!error) return null
  return <p className="text-[12px] text-ink-subtle">{error || CLOUD_REALTIME_UNAVAILABLE}</p>
}
