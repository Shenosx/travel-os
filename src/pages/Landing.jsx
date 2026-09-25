import { Link } from 'react-router-dom'

const FEATURES = [
  {
    title: 'Plan your itinerary',
    body: 'Days, times, and the spaces between them — a quiet timeline instead of a crowded calendar.',
  },
  {
    title: 'Save places',
    body: 'Hotels, cafés, and sights stay with the trip, ready for the map and the day they belong to.',
  },
  {
    title: 'Keep bookings together',
    body: 'Flights, stays, and tickets sit beside the days they serve, with confirmations close at hand.',
  },
  {
    title: 'Track spending',
    body: 'See what has been spent, what remains, and where the money actually went.',
  },
  {
    title: 'Split expenses with friends',
    body: 'Unequal shares, more than one currency, and a settlement that stays honest.',
  },
  {
    title: 'Organize every trip in one place',
    body: 'Upcoming and remembered, personal or shared — without a second set of notes.',
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
    <div>
      <section className="mx-auto grid max-w-[1120px] items-end gap-12 px-5 pt-12 pb-20 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:pt-20 lg:pb-28">
        <div>
          <p className="landing-rise text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Travel OS</p>
          <h1 className="landing-rise landing-delay-1 font-display mt-5 text-[48px] leading-[0.98] tracking-[-0.05em] text-ink sm:text-[68px] lg:text-[76px]">
            Plan less. Travel better.
          </h1>
          <p className="landing-rise landing-delay-2 mt-6 max-w-[42ch] text-[17px] leading-relaxed text-ink-muted sm:text-[18px]">
            Trips, itineraries, places, bookings, expenses, and the quieter work of planning — held
            together in one editorial travel companion.
          </p>
          <div className="landing-rise landing-delay-3 mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Start planning
            </Link>
            <Link to="/signin" className="inline-flex min-h-11 items-center text-sm text-ink-subtle hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
        <HeroPreview />
      </section>

      <section id="features" className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Features</p>
          <h2 className="font-display mt-3 max-w-[16ch] text-[32px] leading-[1.08] tracking-[-0.04em] text-ink sm:text-[40px]">
            Everything a trip needs, without the noise.
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <h3 className="font-display text-[22px] leading-snug tracking-[-0.03em] text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-canvas-muted">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">A trip, gathered</p>
          <h2 className="font-display mt-3 text-[32px] leading-[1.08] tracking-[-0.04em] text-ink sm:text-[40px]">
            Vienna, as it comes together.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            Destination, dates, the days themselves, the places you mean to keep, and what it costs —
            one view, not five apps.
          </p>
          <TripPreview />
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Shared travel</p>
          <h2 className="font-display mt-3 max-w-[18ch] text-[32px] leading-[1.08] tracking-[-0.04em] text-ink sm:text-[40px]">
            Invite people. Keep the plan honest.
          </h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            A shared itinerary, roles that stay quiet, and expenses that can be split unequally —
            because not everyone ordered the same dinner.
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {ROLES.map((item) => (
              <article key={item.role}>
                <p className="text-[11px] tracking-[0.16em] text-accent uppercase">{item.role}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-[1120px] px-5 py-20 text-center sm:px-8 sm:py-24">
          <h2 className="font-display text-[40px] leading-[1.05] tracking-[-0.045em] text-ink sm:text-[52px]">
            Your next trip starts here.
          </h2>
          <Link
            to="/signup"
            className="mt-8 inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Get started
          </Link>
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
    <aside className="landing-rise landing-delay-2 rounded-lg border border-line bg-surface px-6 py-7 sm:px-8 sm:py-8">
      <p className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Upcoming · Shared</p>
      <h2 className="font-display mt-4 text-[40px] leading-[1.02] tracking-[-0.045em] text-ink sm:text-[48px]">
        Vienna
      </h2>
      <p className="mt-2 text-[14px] text-ink-muted">Austria</p>
      <p className="mt-4 text-[15px] text-ink">12–19 December 2026</p>
      <div className="mt-8 border-t border-line pt-6">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Departs in</p>
        <p className="font-display mt-2 text-[52px] leading-none tracking-[-0.05em] text-ink">
          {days}
          <span className="ml-2 font-sans text-[13px] tracking-normal text-ink-muted">
            {days === 1 ? 'day' : 'days'}
          </span>
        </p>
      </div>
      <ol className="mt-8 space-y-3">
        <li className="flex justify-between gap-4 text-[14px]">
          <span className="text-ink">Arrival</span>
          <span className="text-ink-subtle">14:20</span>
        </li>
        <li className="flex justify-between gap-4 text-[14px]">
          <span className="text-ink">Hotel Sacher</span>
          <span className="text-ink-subtle">16:00</span>
        </li>
        <li className="flex justify-between gap-4 text-[14px]">
          <span className="text-ink">Figlmüller</span>
          <span className="text-ink-subtle">19:30</span>
        </li>
      </ol>
    </aside>
  )
}

function TripPreview() {
  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <article className="rounded-lg border border-line bg-surface px-6 py-7 sm:px-8">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Itinerary</p>
        <div className="mt-6 space-y-7">
          {PREVIEW_DAYS.map((day) => (
            <div key={day.day}>
              <p className="text-[11px] tracking-[0.16em] text-accent uppercase">{day.day}</p>
              <h3 className="font-display mt-1.5 text-[24px] tracking-[-0.03em] text-ink">{day.title}</h3>
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
      </article>
      <div className="grid gap-6">
        <article className="rounded-lg border border-line bg-surface px-6 py-7 sm:px-8">
          <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Places</p>
          <ul className="mt-5 space-y-3">
            {PREVIEW_PLACES.map((place) => (
              <li key={place} className="font-display text-[22px] tracking-[-0.03em] text-ink">
                {place}
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-lg border border-line bg-surface px-6 py-7 sm:px-8">
          <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Expenses</p>
          <p className="font-display mt-4 text-[36px] leading-none tracking-[-0.04em] text-ink">RM 3,403</p>
          <p className="mt-2 text-[14px] text-ink-muted">of RM 4,000</p>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-canvas-muted">
            <div className="h-full w-[85%] bg-accent" />
          </div>
        </article>
      </div>
    </div>
  )
}
