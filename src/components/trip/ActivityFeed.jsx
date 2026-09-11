import { formatActivity } from '../../lib/activity.js'
import { formatQuietDate } from '../../lib/dates.js'
import { Card } from '../ui/Card.jsx'

export function ActivityFeed({ activities, users, currentUserId }) {
  if (!activities?.length) {
    return (
      <Card className="p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Activity</p>
        <p className="mt-3 text-sm text-ink-muted">Nothing yet. The trip is still quiet.</p>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Activity</p>
      <ol className="mt-5 space-y-4">
        {activities.map((activity) => (
          <li key={activity.id} className="flex items-baseline justify-between gap-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              {formatActivity(activity, users, currentUserId)}
            </p>
            <p className="shrink-0 text-[12px] text-ink-subtle">{formatQuietDate(activity.createdAt)}</p>
          </li>
        ))}
      </ol>
    </Card>
  )
}
