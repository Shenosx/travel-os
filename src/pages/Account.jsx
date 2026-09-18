import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthPanel } from '../components/auth/AuthPanel.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { safeCloudJoinPath } from '../lib/trips/invitations.js'

export function AccountPage() {
  const {
    configured,
    loading,
    session,
    identity,
    profileStatus,
    pendingConfirmationEmail,
    signOut,
  } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeCloudJoinPath(params.get('next'))

  useEffect(() => {
    if (!session || loading || !next) return undefined
    navigate(next, { replace: true })
  }, [loading, navigate, next, session])

  return (
    <div className="mx-auto max-w-[440px]">
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Account</p>
      <h1 className="font-display mt-2 text-[36px] leading-[1.1] tracking-[-0.04em] text-ink">
        Cloud account
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        Optional. Trips on this device stay local until a later phase. Signing in does not upload
        them.
      </p>

      <Card className="mt-8 p-6 sm:p-8">
        {!configured ? <UnconfiguredState /> : null}
        {configured && loading ? (
          <p className="text-sm text-ink-muted">Checking the current session…</p>
        ) : null}
        {configured && !loading && pendingConfirmationEmail && !session ? (
          <ConfirmationState email={pendingConfirmationEmail} />
        ) : null}
        {configured && !loading && session ? (
          <SignedInState identity={identity} profileStatus={profileStatus} onSignOut={signOut} />
        ) : null}
        {configured && !loading && !session && !pendingConfirmationEmail ? <AuthPanel /> : null}
      </Card>

      <p className="mt-6 text-center text-[13px] text-ink-subtle">
        <Link to="/" className="hover:text-ink">
          Back to the atlas
        </Link>
      </p>
    </div>
  )
}

function UnconfiguredState() {
  return (
    <div>
      <p className="text-sm text-ink-muted">
        Cloud account is not connected on this device. Add the public Supabase URL and anon key to
        continue. Local trips still work as usual.
      </p>
      <p className="mt-4 text-[13px] text-ink-subtle">
        Copy <code className="text-ink">.env.example</code> to <code className="text-ink">.env.local</code>.
      </p>
    </div>
  )
}

function ConfirmationState({ email }) {
  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Confirm email</p>
      <h2 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.03em]">
        Check your inbox
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        We sent a confirmation link to <span className="text-ink">{email}</span>. Confirm the address
        before signing in. The app cannot skip that step.
      </p>
    </div>
  )
}

function SignedInState({ identity, profileStatus, onSignOut }) {
  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Signed in</p>
      <h2 className="font-display mt-3 text-[28px] leading-tight tracking-[-0.03em]">
        {identity.name || identity.email || 'Account'}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">{identity.email}</p>
      <p className="mt-1 text-[13px] text-ink-subtle">
        {identity.emailConfirmed ? 'Email confirmed.' : 'Email confirmation is still pending.'}
      </p>
      {profileStatus === 'ready' ? (
        <p className="mt-4 text-[13px] text-ink-subtle">Profile is on file for this account.</p>
      ) : null}
      {profileStatus === 'missing' ? (
        <p className="mt-4 text-[13px] text-ink-muted">
          Signed in, but the profile row is not visible yet. It is created by the database on signup,
          not by this app.
        </p>
      ) : null}
      {profileStatus === 'error' ? (
        <p className="mt-4 text-[13px] text-ink-muted">Could not read the profile just now.</p>
      ) : null}
      <Button className="mt-8" variant="outline" onClick={() => onSignOut()}>
        Sign out
      </Button>
    </div>
  )
}
