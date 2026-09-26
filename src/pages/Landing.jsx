import { Link } from 'react-router-dom'

const FEATURES = [
  {
    kicker: 'Plan',
    title: 'The days, in one place.',
    points: ['Build your itinerary', 'Organize places and bookings'],
  },
  {
    kicker: 'Spend',
    title: 'What it actually cost.',
    points: ['Track your own spending', "See the whole trip's spending", 'Split expenses fairly'],
  },
  {
    kicker: 'Share',
    title: 'Travel with other people.',
    points: ['Invite travel companions', 'Shared planning', 'Track balances and repayments'],
  },
]

const PREVIEW_DAYS = [
  { day: 'Day 1', title: 'Arrival', items: ['Hotel Sacher', 'Figlmüller'] },
  { day: 'Day 2', title: 'Imperial Vienna', items: ['Schönbrunn Palace', 'Belvedere'] },
  { day: 'Day 3', title: 'Old town', items: ['St. Stephen’s', 'Café Central'] },
]

const PREVIEW_PLACES = ['Hotel Sacher', 'Schönbrunn Palace', 'Café Central']

const ROLES = [
  { role: 'Owner', body: 'The trip, the people, and the last word on what stays.' },
  { role: 'Editor', body: 'Days, places, and bookings — without managing the guest list.' },
  { role: 'Viewer', body: 'Read the plan. Leave the editing to someone else.' },
]

export function LandingPage() {
  return (
    <div className="overflow-x-hidden">
      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pt-12 pb-20 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:pt-20 lg:pb-28">
        <div>
          <p className="landing-rise text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Travel OS</p>
          <h1 className="landing-rise landing-delay-1 font-display mt-5 text-[48px] leading-[0.96] tracking-[-0.05em] text-ink sm:text-[68px] lg:text-[80px]">
            Plan less. Travel better.
          </h1>
          <p className="landing-rise landing-delay-2 mt-6 max-w-[38ch] text-[17px] leading-relaxed text-ink-muted sm:text-[19px]">
            Travel OS brings trips, itineraries, places, bookings, expenses, and shared travel into
            one place — for people who would rather be away than buried in tabs.
          </p>
          <div className="landing-rise landing-delay-3 mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Get started
            </Link>
            <Link to="/signin" className="inline-flex min-h-11 items-center text-sm text-ink-subtle hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
        <HeroPreview />
      </section>

      <section id="features" className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Features</p>
          <h2 className="font-display mt-3 max-w-[14ch] text-[32px] leading-[1.06] tracking-[-0.04em] text-ink sm:text-[42px]">
            Built around the trip, not the software.
          </h2>
          <div className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-10">
            {FEATURES.map((feature) => (
              <article key={feature.kicker}>
                <p className="text-[11px] tracking-[0.16em] text-accent uppercase">{feature.kicker}</p>
                <h3 className="font-display mt-3 text-[24px] leading-snug tracking-[-0.03em] text-ink">
                  {feature.title}
                </h3>
                <ul className="mt-5 space-y-2">
                  {feature.points.map((point) => (
                    <li key={point} className="text-[15px] leading-relaxed text-ink-muted">
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">A trip, gathered</p>
          <h2 className="font-display mt-3 text-[32px] leading-[1.06] tracking-[-0.04em] text-ink sm:text-[42px]">
            Vienna, as it comes together.
          </h2>
          <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-ink-muted">
            Destination, dates, the itinerary, saved places, a booking, and what it costs — held as
            one trip.
          </p>
          <TripPreview />
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Shared travel</p>
          <h2 className="font-display mt-3 max-w-[16ch] text-[32px] leading-[1.06] tracking-[-0.04em] text-ink sm:text-[42px]">
            Invite people. Keep the plan honest.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            A shared itinerary, roles that stay quiet, and expenses that can be split unequally —
            then settled when someone actually pays the other back.
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {ROLES.map((item) => (
              <article key={item.role}>
                <p className="text-[11px] tracking-[0.16em] text-accent uppercase">{item.role}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{item.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-14 max-w-[46ch] text-[15px] leading-relaxed text-ink-subtle">
            Shared itinerary. Unequal splits. Settlement and repayments — without turning the trip
            into a spreadsheet.
          </p>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[720px] px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">The idea</p>
          <h2 className="font-display mt-5 text-[34px] leading-[1.08] tracking-[-0.045em] text-ink sm:text-[48px]">
            Everything for the trip. Nothing you don't need.
          </h2>
          <p className="mt-6 max-w-[42ch] text-[16px] leading-relaxed text-ink-muted">
            Travel OS is a quiet companion for the plan: the days, the places, the tickets, and who
            owes whom. Not another dashboard to manage.
          </p>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-8 sm:py-24">
          <h2 className="font-display text-[40px] leading-[1.05] tracking-[-0.045em] text-ink sm:text-[56px]">
            Your next trip starts here.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Get started
            </Link>
            <Link to="/signin" className="inline-flex min-h-11 items-center text-sm text-ink-subtle hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <p className="font-display text-[18px] tracking-[-0.03em] text-ink">Travel OS</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-subtle">
            <a href="#features" className="inline-flex min-h-11 items-center hover:text-ink">
              Features
            </a>
            <Link to="/signin" className="inline-flex min-h-11 items-center hover:text-ink">
              Sign in
            </Link>
            <Link to="/signup" className="inline-flex min-h-11 items-center text-accent hover:text-accent-hover">
              Get started
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function viennaDaysUntil() {
  const start = new Date(2026, 11, 12)
  const now = new Date()
  start.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((start.getTime() - now.getTime()) / 86400000))
}

function HeroPreview() {
  const days = viennaDaysUntil()

  return (
    <aside className="landing-rise landing-delay-2 min-w-0 border border-line bg-surface px-5 py-6 sm:px-7 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Upcoming · Shared</p>
          <h2 className="font-display mt-3 text-[40px] leading-[1.02] tracking-[-0.045em] text-ink sm:text-[48px]">
            Vienna
          </h2>
          <p className="mt-2 text-[14px] text-ink-muted">12–19 December 2026</p>
        </div>
        <p className="font-display text-[36px] leading-none tracking-[-0.05em] text-ink">
          {days}
          <span className="ml-1.5 font-sans text-[12px] tracking-normal text-ink-muted">
            {days === 1 ? 'day' : 'days'}
          </span>
        </p>
      </div>
      <div className="mt-8 border-t border-line pt-6">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Day 1</p>
        <ol className="mt-4 space-y-3">
          <li className="flex justify-between gap-4 text-[14px]">
            <span className="text-ink">KUL → VIE</span>
            <span className="text-ink-subtle">14:20</span>
          </li>
          <li className="flex justify-between gap-4 text-[14px]">
            <span className="text-ink">Hotel Sacher</span>
            <span className="text-ink-subtle">Confirmed</span>
          </li>
          <li className="flex justify-between gap-4 text-[14px]">
            <span className="text-ink">Figlmüller</span>
            <span className="text-ink-subtle">19:30</span>
          </li>
        </ol>
      </div>
    </aside>
  )
}

function TripPreview() {
  return (
    <div className="mt-12 min-w-0 border border-line bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-6 sm:px-8">
        <div>
          <p className="font-display text-[32px] leading-none tracking-[-0.04em] text-ink sm:text-[36px]">Vienna</p>
          <p className="mt-2 text-[14px] text-ink-muted">Austria · Shared</p>
        </div>
        <p className="text-[14px] text-ink">12–19 December 2026</p>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="border-b border-line px-5 py-7 sm:px-8 lg:border-r lg:border-b-0">
          <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Itinerary</p>
          <div className="mt-6 space-y-7">
            {PREVIEW_DAYS.map((day) => (
              <div key={day.day}>
                <p className="text-[11px] tracking-[0.16em] text-accent uppercase">{day.day}</p>
                <h3 className="font-display mt-1.5 text-[22px] tracking-[-0.03em] text-ink sm:text-[24px]">
                  {day.title}
                </h3>
                <ul className="mt-3 space-y-1.5">
                  {day.items.map((item) => (
                    <li key={item} className="text-[14px] text-ink-muted">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="border-b border-line px-5 py-7 sm:px-8">
            <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Places</p>
            <ul className="mt-5 space-y-3">
              {PREVIEW_PLACES.map((place) => (
                <li key={place} className="font-display text-[20px] tracking-[-0.03em] text-ink sm:text-[22px]">
                  {place}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-b border-line px-5 py-7 sm:px-8">
            <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Booking</p>
            <p className="font-display mt-4 text-[22px] tracking-[-0.03em] text-ink">KUL → VIE</p>
            <p className="mt-2 text-[14px] text-ink-muted">12 December · 14:20 · Confirmed</p>
          </div>
          <div className="px-5 py-7 sm:px-8">
            <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Spending</p>
            <p className="font-display mt-4 text-[32px] leading-none tracking-[-0.04em] text-ink">RM 3,403</p>
            <p className="mt-2 text-[14px] text-ink-muted">of RM 4,000</p>
          </div>
        </div>
      </div>
    </div>
  )
}
