import { displayName } from '../../data/mock.js'
import { formatActivity } from '../../lib/activity.js'
import { BOOKING_TYPE_LABEL, formatBookingWhen } from '../../lib/bookings.js'
import { openInvitationsForTrip } from '../../lib/collaboration.js'
import { formatDateRange, formatLongDate, formatQuietDate, formatShortWeekday, todayIso } from '../../lib/dates.js'
import { CATEGORY_LABEL, getSpendByCategory } from '../../lib/expenses.js'
import { formatMoney, formatTime, spendingPercent } from '../../lib/format.js'
import { flattenItineraryItems } from '../../lib/itinerary.js'
import { PLACE_STATUS_LABEL } from '../../lib/places.js'
import { ROLE_LABEL } from '../../lib/people.js'
import { getTripDurationDays } from '../../lib/trips.js'
import { EmptyState } from '../ui/EmptyState.jsx'
import { ProgressBar } from '../ui/ProgressBar.jsx'
import { SectionHeading } from '../dashboard/SectionHeading.jsx'
import { TripPoll } from './TripPoll.jsx'

const PLACE_STATUS_ORDER = { planned: 0, saved: 1, visited: 2 }

function countStops(itinerary) {
  return flattenItineraryItems(itinerary).length
}

function placeCounts(places) {
  return {
    saved: places.filter((place) => place.status === 'saved').length,
    planned: places.filter((place) => place.status === 'planned').length,
    visited: places.filter((place) => place.status === 'visited').length,
  }
}

function placeSummary(places) {
  if (!places.length) return 'None saved yet'
  const counts = placeCounts(places)
  const parts = []
  if (counts.saved) parts.push(`${counts.saved} saved`)
  if (counts.planned) parts.push(`${counts.planned} planned`)
  if (counts.visited) parts.push(`${counts.visited} visited`)
  return parts.join(' · ')
}

function upcomingItinerary(itinerary, places, today = todayIso()) {
  return flattenItineraryItems(itinerary)
    .filter((item) => item.date >= today)
    .slice(0, 6)
    .map((item) => ({
      ...item,
      location: item.place || places.find((place) => place.id === item.placeId)?.name || item.dayTitle || '',
    }))
}

function groupByDate(items) {
  const groups = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last?.date === item.date) last.items.push(item)
    else groups.push({ date: item.date, items: [item] })
  }
  return groups
}

function previewPlaces(places) {
  return places
    .slice()
    .sort((a, b) => (PLACE_STATUS_ORDER[a.status] ?? 9) - (PLACE_STATUS_ORDER[b.status] ?? 9))
    .slice(0, 4)
}

function upcomingBookings(bookings, today = todayIso()) {
  return bookings
    .filter((booking) => booking.status !== 'cancelled' && (booking.startDate || '') >= today)
    .sort((a, b) => `${a.startDate || ''}${a.startTime || ''}`.localeCompare(`${b.startDate || ''}${b.startTime || ''}`))
    .slice(0, 4)
}

export function TripOverview({
  trip,
  spent,
  members,
  itinerary,
  places = [],
  bookings = [],
  expenses = [],
  invitations = [],
  currentUserId,
  finance,
  poll,
  activities,
  users,
  permissions = {},
  canVote,
  onVote,
  onOpenTab,
  onOpenPlace,
  onOpenBooking,
}) {
  const stops = countStops(itinerary)
  const pending = openInvitationsForTrip(invitations, trip.id)
  const shared = members.length > 1 || pending.length > 0 || trip.visibility === 'shared'
  const remaining = trip.budgetAmount - spent
  const percent = spendingPercent(spent, trip.budgetAmount)
  const categories = getSpendByCategory(expenses, trip.id).slice(0, 4)
  const maxCategory = categories[0]?.amount ?? 1
  const recentExpenses = expenses.slice(0, 4)
  const itineraryItems = upcomingItinerary(itinerary, places)
  const placesPreview = previewPlaces(places)
  const bookingsPreview = upcomingBookings(bookings)

  return (
    <div>
      {trip.notes ? (
        <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-muted">{trip.notes}</p>
      ) : null}

      <section className={trip.notes ? 'mt-10' : ''}>
        <SectionHeading kicker="At a glance" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
          <SummaryStat label="Dates" value={formatDateRange(trip.startDate, trip.endDate)} hint={`${getTripDurationDays(trip)} days`} />
          <SummaryStat
            label="Itinerary"
            value={stops ? `${stops} ${stops === 1 ? 'stop' : 'stops'}` : 'None yet'}
          />
          <SummaryStat
            label="Places"
            value={places.length ? `${places.length} ${places.length === 1 ? 'place' : 'places'}` : 'None yet'}
            hint={places.length ? placeSummary(places) : undefined}
          />
          <SummaryStat
            label="Spending"
            value={formatMoney(spent, trip.currency)}
            hint={trip.budgetAmount ? `of ${formatMoney(trip.budgetAmount, trip.currency)}` : undefined}
          />
          <SummaryStat
            label="Bookings"
            value={
              bookings.length
                ? `${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`
                : 'None yet'
            }
          />
          <SummaryStat
            label="People"
            value={shared ? `${members.length} ${members.length === 1 ? 'person' : 'people'}` : 'Personal'}
            hint={shared ? 'Shared trip' : 'Just you'}
          />
        </dl>
      </section>

      <div className="mt-14 grid gap-12 lg:mt-16 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-16">
        <PreviewSection
          kicker="Itinerary"
          actionLabel="View itinerary"
          onAction={() => onOpenTab?.('itinerary')}
        >
          {!itineraryItems.length ? (
            <EmptyState
              title={stops ? 'Nothing upcoming on the itinerary' : 'No stops planned yet'}
              body={
                stops
                  ? 'Past days stay on the itinerary tab.'
                  : 'Add a day when the first stop is known.'
              }
              action={
                <button type="button" className="text-sm text-accent" onClick={() => onOpenTab?.('itinerary')}>
                  {permissions.canEditItinerary ? 'Add a stop' : 'View itinerary'}
                </button>
              }
            />
          ) : (
            <div className="space-y-7">
              {groupByDate(itineraryItems).map((group) => (
                <div key={group.date}>
                  <p className="text-[13px] text-ink">
                    <span className="text-ink-subtle">{formatShortWeekday(group.date)}</span>
                    <span className="mx-2 text-ink-subtle">·</span>
                    {formatLongDate(group.date).replace(/ \d{4}$/, '')}
                  </p>
                  <ol className="relative mt-3 space-y-3 border-l border-line pl-4">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTab?.('itinerary')}
                          className="block w-full py-0.5 text-left hover:text-accent"
                        >
                          <p className="text-[12px] tabular-nums tracking-[0.02em] text-ink-subtle">
                            {item.time ? formatTime(item.time) : 'Anytime'}
                          </p>
                          <p className="mt-0.5 text-[15px] text-ink">{item.title}</p>
                          {item.location ? (
                            <p className="mt-0.5 text-[13px] text-ink-muted">{item.location}</p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </PreviewSection>

        <PreviewSection
          kicker="Places"
          actionLabel="View places"
          onAction={() => onOpenTab?.('places')}
        >
          {!placesPreview.length ? (
            <EmptyState
              title="No places saved yet"
              body="Hotels, cafés, and sights will collect here as you save them."
              action={
                <button type="button" className="text-sm text-accent" onClick={() => onOpenTab?.('places')}>
                  {permissions.canAddPlace ? 'Save a place' : 'View places'}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {placesPreview.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPlace?.(place.id)}
                    className="flex w-full items-baseline justify-between gap-4 py-3.5 text-left first:pt-0 last:pb-0"
                  >
                    <span>
                      <span className="text-[15px] text-ink">{place.name}</span>
                      {place.category ? (
                        <span className="mt-0.5 block text-[13px] text-ink-muted">{place.category}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">
                      {PLACE_STATUS_LABEL[place.status] ?? place.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PreviewSection>

        <PreviewSection
          kicker="Expenses"
          actionLabel="View expenses"
          onAction={() => onOpenTab?.('expenses')}
        >
          {!expenses.length ? (
            <EmptyState
              title="No spending yet"
              body="Totals and recent expenses will appear once something is saved."
              action={
                <button type="button" className="text-sm text-accent" onClick={() => onOpenTab?.('expenses')}>
                  {permissions.canAddExpense ? 'Add an expense' : 'View expenses'}
                </button>
              }
            />
          ) : (
            <div>
              <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Spent</p>
              <p className="font-display mt-2 text-[32px] leading-none tracking-[-0.04em] text-ink">
                {formatMoney(spent, trip.currency)}
              </p>
              {trip.budgetAmount ? (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Budget</p>
                      <p className="mt-1.5 text-[15px] text-ink">{formatMoney(trip.budgetAmount, trip.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Remaining</p>
                      <p className="mt-1.5 text-[15px] text-ink">
                        {remaining >= 0
                          ? formatMoney(remaining, trip.currency)
                          : `−${formatMoney(Math.abs(remaining), trip.currency)}`}
                      </p>
                    </div>
                  </div>
                  <ProgressBar value={percent} label="Budget used" className="mt-6" />
                </>
              ) : null}

              {categories.length ? (
                <ul className="mt-7 space-y-3">
                  {categories.map((item) => (
                    <li key={item.category} className="flex items-baseline justify-between gap-4">
                      <span className="text-[13px] text-ink-muted">{CATEGORY_LABEL[item.category] ?? item.category}</span>
                      <span className="text-[13px] tabular-nums text-ink">
                        {formatMoney(item.amount, trip.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {finance?.sharedCount ? (
                <p className="mt-5 text-[13px] text-ink-subtle">
                  {finance.sharedCount} shared · your share {formatMoney(finance.yourShare, trip.currency)}
                </p>
              ) : null}

              <ul className="mt-7 divide-y divide-line border-t border-line">
                {recentExpenses.map((expense) => (
                  <li key={expense.id}>
                    <button
                      type="button"
                      onClick={() => onOpenTab?.('expenses')}
                      className="flex w-full items-baseline justify-between gap-4 py-3 text-left"
                    >
                      <span>
                        <span className="text-[14px] text-ink">{expense.description}</span>
                        <span className="mt-0.5 block text-[12px] text-ink-subtle">
                          {formatQuietDate(expense.date)} · {CATEGORY_LABEL[expense.category]}
                        </span>
                      </span>
                      <span className="shrink-0 text-[14px] tabular-nums text-ink">
                        {formatMoney(expense.convertedAmount ?? expense.amount, trip.currency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PreviewSection>

        <PreviewSection
          kicker="Bookings"
          actionLabel="View bookings"
          onAction={() => onOpenTab?.('bookings')}
        >
          {!bookingsPreview.length ? (
            <EmptyState
              title={bookings.length ? 'No upcoming bookings' : 'No bookings yet'}
              body={
                bookings.length
                  ? 'Past reservations stay on the bookings tab.'
                  : 'Flights, hotels, and tickets will wait here.'
              }
              action={
                <button type="button" className="text-sm text-accent" onClick={() => onOpenTab?.('bookings')}>
                  {permissions.canAddBooking ? 'Add a booking' : 'View bookings'}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {bookingsPreview.map((booking) => (
                <li key={booking.id}>
                  <button
                    type="button"
                    onClick={() => onOpenBooking?.(booking.id)}
                    className="flex w-full items-baseline justify-between gap-4 py-3.5 text-left first:pt-0 last:pb-0"
                  >
                    <span>
                      <span className="text-[15px] text-ink">{booking.title}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-muted">
                        {formatBookingWhen(booking)}
                        {booking.provider ? ` · ${booking.provider}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">
                      {BOOKING_TYPE_LABEL[booking.type] ?? booking.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PreviewSection>
      </div>

      <section className="mt-14 lg:mt-16">
        <PreviewSection
          kicker="People"
          actionLabel="View people"
          onAction={() => onOpenTab?.('people')}
        >
          {!shared ? (
            <div>
              <p className="text-[15px] text-ink">This trip is just yours.</p>
              <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed text-ink-muted">
                Invite someone when you want to share the days, places, and spending.
              </p>
              {permissions.canInvite ? (
                <button type="button" className="mt-4 text-sm text-accent" onClick={() => onOpenTab?.('people')}>
                  Invite people
                </button>
              ) : null}
            </div>
          ) : (
            <div>
              <ul className="divide-y divide-line">
                {members.map((member) => (
                  <li key={member.userId} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="text-[15px] text-ink">{displayName(member.user, currentUserId)}</span>
                    <span className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">
                      {ROLE_LABEL[member.role]}
                    </span>
                  </li>
                ))}
              </ul>
              {pending.length ? (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Waiting to join</p>
                  <ul className="mt-3 space-y-2">
                    {pending.map((invitation) => (
                      <li key={invitation.id} className="flex items-baseline justify-between gap-4">
                        <span className="text-[14px] text-ink-muted">{invitation.name || invitation.email}</span>
                        <span className="text-[12px] tracking-[0.08em] text-ink-subtle uppercase">
                          {ROLE_LABEL[invitation.role]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </PreviewSection>
      </section>

      {activities?.length ? (
        <section className="mt-14 lg:mt-16">
          <SectionHeading kicker="Lately" />
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
        </section>
      ) : null}

      {poll ? (
        <div className="mt-14 lg:mt-16">
          <TripPoll poll={poll} currentUserId={currentUserId} canVote={canVote} onVote={onVote} />
        </div>
      ) : null}
    </div>
  )
}

function SummaryStat({ label, value, hint }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">{label}</dt>
      <dd className="mt-2 text-[15px] text-ink">{value}</dd>
      {hint ? <dd className="mt-1 text-[13px] text-ink-subtle">{hint}</dd> : null}
    </div>
  )
}

function PreviewSection({ kicker, actionLabel, onAction, children }) {
  return (
    <section>
      <SectionHeading
        kicker={kicker}
        action={
          <button type="button" className="text-ink-subtle hover:text-ink" onClick={onAction}>
            {actionLabel}
          </button>
        }
      />
      {children}
    </section>
  )
}
