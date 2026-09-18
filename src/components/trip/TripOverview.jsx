import { formatDateRange } from '../../lib/dates.js'
import { formatMoney, spendingPercent } from '../../lib/format.js'
import { describeTripCountdown, getTripDurationDays } from '../../lib/trips.js'
import { displayName } from '../../data/mock.js'
import { ROLE_LABEL } from '../../lib/people.js'
import { Avatar } from '../ui/Avatar.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Card } from '../ui/Card.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'
import { ActivityFeed } from './ActivityFeed.jsx'
import { TripPoll } from './TripPoll.jsx'

export function TripOverview({
  trip,
  spent,
  members,
  itinerary,
  currentUserId,
  finance,
  poll,
  activities,
  users,
  canVote,
  onVote,
}) {
  const duration = getTripDurationDays(trip)
  const countdown = describeTripCountdown(trip)
  const percent = spendingPercent(spent, trip.budgetAmount)
  const remaining = trip.budgetAmount - spent
  const firstDay = itinerary?.days?.[0]
  const owner = members.find((member) => member.role === 'owner')

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
      <div className="space-y-6">
        <Card className="p-6 sm:p-7">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Overview</p>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-muted">
            {trip.notes || 'No notes yet for this trip.'}
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Dates</dt>
              <dd className="mt-1 text-sm text-ink">
                {formatDateRange(trip.startDate, trip.endDate)}
                <span className="mt-1 block text-[13px] text-ink-subtle">{countdown.label}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Duration</dt>
              <dd className="mt-1 text-sm text-ink">{duration} days</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Owner</dt>
              <dd className="mt-1 text-sm text-ink">{owner ? displayName(owner.user, currentUserId) : '—'}</dd>
            </div>
          </dl>
        </Card>

        {firstDay ? (
          <Card className="p-6 sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Opening day</p>
              <p className="text-sm text-ink-muted">Day {firstDay.dayNumber}</p>
            </div>
            <h3 className="font-display mt-2 text-[24px] tracking-[-0.03em]">{firstDay.title}</h3>
            <ul className="mt-5 divide-y divide-line">
              {firstDay.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm text-ink">{item.title}</span>
                  <span className="text-[13px] text-ink-subtle tabular-nums">{item.time || '—'}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Budget</p>
          <p className="font-display mt-3 text-[34px] tracking-[-0.04em]">
            {formatMoney(spent, trip.currency)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            of {formatMoney(trip.budgetAmount, trip.currency)}
          </p>
          <ProgressBar value={percent} className="mt-5" />
          <p className="mt-2 text-[13px] text-ink-subtle">
            {remaining >= 0
              ? `${formatMoney(remaining, trip.currency)} left`
              : `${formatMoney(Math.abs(remaining), trip.currency)} over`}
          </p>

          {finance ? (
            <dl className="mt-6 space-y-3 border-t border-line pt-5">
              <OverviewStat
                label="Shared expenses"
                value={`${finance.sharedCount} · ${formatMoney(finance.shared, trip.currency)}`}
              />
              <OverviewStat label="Your share" value={formatMoney(finance.yourShare, trip.currency)} />
              <OverviewStat label="You owe" value={formatMoney(finance.youOweTotal, trip.currency)} />
              <OverviewStat label="Friends owe you" value={formatMoney(finance.youReceiveTotal, trip.currency)} />
            </dl>
          ) : null}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">People</p>
            <Badge tone="muted">{trip.visibility === 'shared' ? 'Shared itinerary' : 'Private'}</Badge>
          </div>
            <ul className="mt-5 space-y-3">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar initials={member.user.initials} size="sm" emphasis={member.role === 'owner'} />
                  <div>
                    <p className="text-sm text-ink">{displayName(member.user, currentUserId)}</p>
                    <p className="text-[12px] text-ink-subtle">{ROLE_LABEL[member.role]}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {activities?.length ? (
          <ActivityFeed activities={activities} users={users} currentUserId={currentUserId} />
        ) : null}

        <TripPoll poll={poll} currentUserId={currentUserId} canVote={canVote} onVote={onVote} />
      </div>
    </div>
  )
}

function OverviewStat({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-ink-subtle">{label}</dt>
      <dd className="text-sm tabular-nums text-ink">{value}</dd>
    </div>
  )
}
