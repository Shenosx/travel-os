import { Link } from 'react-router-dom'
import { BOOKING_TYPE_LABEL, formatBookingWhen } from '../../lib/bookings.js'
import { formatDateRange } from '../../lib/dates.js'
import { formatMoney, formatTime, spendingPercent } from '../../lib/format.js'
import { describeTripCountdown, getTripDurationDays, STATUS_LABEL } from '../../lib/trips.js'
import { Badge } from '../ui/Badge.jsx'
import { Card } from '../ui/Card.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'

export function UpcomingHero({ trip, spent, nextItem, nextBooking }) {
  const countdown = describeTripCountdown(trip)
  const status = countdown.status
  const duration = getTripDurationDays(trip)
  const percent = spendingPercent(spent, trip.budgetAmount)
  const remaining = trip.budgetAmount - spent

  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[1.3fr_0.9fr]">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Next trip</p>
            <Badge tone="accent">{STATUS_LABEL[status]}</Badge>
            <Badge tone="muted">{trip.visibility === 'shared' ? 'Shared' : 'Private'}</Badge>
          </div>
          <h2 className="font-display mt-4 text-[36px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[44px]">
            {trip.destination}
          </h2>
          <p className="mt-3 text-[15px] text-ink-muted">
            {formatDateRange(trip.startDate, trip.endDate)}
            <span className="text-ink-subtle"> · {duration} days</span>
          </p>

          <div className="mt-8 grid grid-cols-2 gap-6 sm:max-w-[360px]">
            <div>
              <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Budget</p>
              <p className="mt-1 text-lg text-ink">{formatMoney(trip.budgetAmount, trip.currency)}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Spent</p>
              <p className="mt-1 text-lg text-ink">{formatMoney(spent, trip.currency)}</p>
            </div>
          </div>
          <ProgressBar value={percent} className="mt-4 max-w-[360px]" />
          <p className="mt-2 text-[13px] text-ink-subtle">
            {remaining >= 0
              ? `${formatMoney(remaining, trip.currency)} remaining`
              : `${formatMoney(Math.abs(remaining), trip.currency)} over budget`}
          </p>

          <Link
            to={`/trips/${trip.id}`}
            className="mt-8 inline-flex text-sm font-medium text-accent hover:text-accent-hover"
          >
            Open trip
          </Link>
        </div>

        <div className="flex flex-col justify-between border-t border-line bg-canvas-muted px-6 py-8 sm:px-8 lg:border-t-0 lg:border-l">
          <div>
            <p className="text-[11px] tracking-[0.14em] text-ink-subtle uppercase">
              {status === 'upcoming' ? 'Departs in' : status === 'ongoing' ? 'Travelling now' : 'Ended'}
            </p>
            {status === 'upcoming' ? (
              <p className="font-display mt-3 text-[64px] leading-none tracking-[-0.05em] text-ink">
                {countdown.value}
                <span className="ml-2 font-sans text-base tracking-normal text-ink-muted">
                  {countdown.value === 1 ? 'day to go' : 'days to go'}
                </span>
              </p>
            ) : (
              <p className="font-display mt-3 text-[32px] tracking-[-0.04em] text-ink">{countdown.label}</p>
            )}
            {nextItem || nextBooking ? (
              <div className="mt-8 space-y-4">
                {nextItem ? (
                  <div>
                    <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">Next</p>
                    <p className="mt-1 text-sm text-ink">
                      {nextItem.title}
                      <span className="text-ink-subtle">
                        {' '}
                        · Day {nextItem.dayNumber}
                        {nextItem.time ? ` · ${formatTime(nextItem.time)}` : ''}
                      </span>
                    </p>
                  </div>
                ) : null}
                {nextBooking ? (
                  <div>
                    <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">
                      {BOOKING_TYPE_LABEL[nextBooking.type] ?? 'Booking'}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {nextBooking.title}
                      <span className="text-ink-subtle"> · {formatBookingWhen(nextBooking)}</span>
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {trip.notes ? (
            <p className="mt-10 max-w-[28ch] text-[14px] leading-relaxed text-ink-muted italic">
              {trip.notes}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
