import { Link } from 'react-router-dom'
import { AuthForm } from '../components/auth/AuthForm.jsx'
import { useAuth } from '../hooks/useAuth.jsx'

export function SignUpPage() {
  const { loading, pendingConfirmationEmail, session } = useAuth()

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 py-12 sm:py-16">
      <Link to="/" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Back to Travel OS
      </Link>
      <p className="mt-8 text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Account</p>
      <h1 className="font-display mt-3 text-[36px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[42px]">
        Create account
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        One place for itineraries, places, bookings, and what the trip actually costs.
      </p>
      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-ink-muted">Checking the current session…</p>
        ) : pendingConfirmationEmail && !session ? (
          <ConfirmationState email={pendingConfirmationEmail} />
        ) : (
          <AuthForm mode="signup" />
        )}
      </div>
    </main>
  )
}

function ConfirmationState({ email }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Confirm email</p>
      <h2 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.03em] text-ink">
        Check your inbox
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        We sent a confirmation link to <span className="text-ink">{email}</span>. Confirm the address
        before signing in. The app cannot skip that step.
      </p>
      <p className="mt-6 text-[13px] text-ink-muted">
        <Link to="/signin" className="text-accent hover:text-accent-hover">
          Sign in
        </Link>
        {' · '}
        <Link to="/" className="hover:text-ink">
          Back to Travel OS
        </Link>
      </p>
    </div>
  )
}
