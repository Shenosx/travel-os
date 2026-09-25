import { formatActivity } from '../../lib/activity.js'
import { formatQuietDate } from '../../lib/dates.js'
import { SectionHeading } from './SectionHeading.jsx'

export function HomeActivity({ activities, users, currentUserId }) {
  return (
    <section>
      <SectionHeading kicker="Recent activity" />
      {!activities.length ? (
        <p className="text-[13px] text-ink-subtle">The atlas is quiet. Updates will collect here.</p>
      ) : (
        <ol className="space-y-3">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-baseline justify-between gap-6">
              <p className="text-[13px] leading-relaxed text-ink-subtle">
                {formatActivity(activity, users, currentUserId)}
              </p>
              <p className="shrink-0 text-[12px] text-ink-subtle">{formatQuietDate(activity.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
