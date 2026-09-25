import { Link } from 'react-router-dom'
import { AuthForm } from '../components/auth/AuthForm.jsx'
import { useAuth } from '../hooks/useAuth.jsx'

export function SignInPage() {
  const { loading } = useAuth()

  return (
    <main className="mx-auto w-full max-w-[440px] px-5 py-12 sm:py-16">
      <Link to="/" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Back to Travel OS
      </Link>
      <p className="mt-8 text-[11px] tracking-[0.18em] text-ink-subtle uppercase">Account</p>
      <h1 className="font-display mt-3 text-[36px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[42px]">
        Sign in
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        Continue a trip already underway, or pick up plans left on this account.
      </p>
      <div className="mt-8">
        {loading ? <p className="text-sm text-ink-muted">Checking the current session…</p> : <AuthForm mode="signin" />}
      </div>
    </main>
  )
}
