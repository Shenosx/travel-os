import { cloudActivityActor, formatCloudActivity, formatCloudActivityTime } from '../../lib/trips/activity.js'
import { useCloudTripActivity } from '../../hooks/useCloudTripActivity.js'
import { Avatar } from '../ui/Avatar.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'

export function CloudActivitySheet({ trip, currentUserId, onClose }) {
  const cloud = useCloudTripActivity(trip)

  return (
    <Sheet kicker="Cloud" title="Activity" onClose={onClose} wide>
      <div className="space-y-6">
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Cloud trip activity</p>
          <p className="mt-1 text-[13px] text-ink-subtle">{trip.destination} · not on this device</p>
        </div>

        {cloud.loading ? <p className="text-sm text-ink-muted">Loading activity…</p> : null}
        {cloud.error ? <p className="text-sm text-ink-muted">{cloud.error}</p> : null}
        <CloudLiveStatus error={cloud.liveError} />

        {!cloud.loading && !cloud.activities.length ? (
          <EmptyState title="Nothing yet" body="The trip is still quiet. Places, polls, and expenses will show up here." />
        ) : null}

        {cloud.activities.length ? (
          <ol className="space-y-4">
            {cloud.activities.map((activity) => {
              const actor = cloudActivityActor(cloud.members, activity.actorId, currentUserId)
              return (
                <li key={activity.id} className="flex items-start gap-3">
                  <Avatar initials={actor.initials} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-ink-muted">
                      {formatCloudActivity(activity, cloud.members, currentUserId, { destination: trip.city })}
                    </p>
                    <p className="mt-1 text-[12px] text-ink-subtle">{formatCloudActivityTime(activity.createdAt)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : null}
      </div>
    </Sheet>
  )
}
