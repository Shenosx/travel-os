import { Link } from 'react-router-dom'
import { SectionHeading } from './SectionHeading.jsx'

export function HomeQuickActions({ onExpense, onPlace, onBooking, noteHref }) {
  return (
    <section>
      <SectionHeading kicker="Quick actions" />
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[14px]">
        <ActionButton onClick={onExpense}>Expense</ActionButton>
        <ActionButton onClick={onPlace}>Place</ActionButton>
        <ActionButton onClick={onBooking}>Booking</ActionButton>
        {noteHref ? (
          <Link to={noteHref} className="text-ink hover:text-accent">
            Note
          </Link>
        ) : (
          <span className="text-ink-subtle">Note</span>
        )}
      </div>
    </section>
  )
}

function ActionButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="text-ink hover:text-accent">
      {children}
    </button>
  )
}
