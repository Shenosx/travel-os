import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthPanel } from '../components/auth/AuthPanel.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Field, fieldClass } from '../components/ui/Field.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { visibleAccount } from '../lib/auth/session.js'
import { useTheme } from '../hooks/useTheme.jsx'
import {
  buildAccountExport,
  clearLocalAccountSnapshot,
  guestAccountDestination,
  planClearLocalData,
} from '../lib/account.js'
import { PREFERRED_CURRENCIES, readPreferences, writePreferences } from '../lib/preferences.js'
import { THEME_PREFERENCES } from '../lib/theme.js'
import { safeCloudJoinPath } from '../lib/trips/invitations.js'

export function AccountPage() {
  const {
    configured,
    loading,
    session,
    identity,
    pendingConfirmationEmail,
    signOut,
  } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeCloudJoinPath(params.get('next'))
  const redirectTo = guestAccountDestination({ session, next, pendingConfirmationEmail })

  useEffect(() => {
    if (!session || loading || !next) return undefined
    navigate(next, { replace: true })
  }, [loading, navigate, next, session])

  if (loading) {
    return <p className="text-sm text-ink-muted">Checking the current session…</p>
  }

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />
  }

  if (!session) {
    return <GuestAccount configured={configured} pendingConfirmationEmail={pendingConfirmationEmail} />
  }

  return <AccountSettings identity={visibleAccount(identity)} userId={identity.id} onSignOut={signOut} />
}

function GuestAccount({ configured, pendingConfirmationEmail }) {
  return (
    <div className="mx-auto max-w-[440px]">
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Account</p>
      <h1 className="font-display mt-2 text-[36px] leading-[1.1] tracking-[-0.04em] text-ink">
        Sign in
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        Continue with the invited email, then you can return to the trip.
      </p>
      <div className="mt-8">
        {!configured ? (
          <p className="text-sm text-ink-muted">
            Cloud account is not connected on this device. Use Sign in from the public site when it
            is configured.
          </p>
        ) : pendingConfirmationEmail ? (
          <p className="text-sm leading-relaxed text-ink-muted">
            We sent a confirmation link to <span className="text-ink">{pendingConfirmationEmail}</span>.
            Confirm the address before signing in.
          </p>
        ) : (
          <AuthPanel />
        )}
      </div>
      <p className="mt-6 text-center text-[13px] text-ink-subtle">
        <Link to="/" className="hover:text-ink">
          Back to Travel OS
        </Link>
      </p>
    </div>
  )
}

function AccountSettings({ identity, userId, onSignOut }) {
  const navigate = useNavigate()
  const { preference, setTheme } = useTheme()
  const [prefs, setPrefs] = useState(() => readPreferences(userId))
  const [confirmClear, setConfirmClear] = useState(false)
  const [exporting, setExporting] = useState(false)

  function handleCurrency(event) {
    const next = writePreferences(userId, { defaultCurrency: event.target.value })
    setPrefs(next)
  }

  function handleExport() {
    const payload = buildAccountExport(userId)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = payload.exportedAt.slice(0, 10)
    link.href = url
    link.download = `travel-os-${stamp}.json`
    link.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  function handleClear() {
    const plan = planClearLocalData(confirmClear)
    if (!plan.ok) return
    clearLocalAccountSnapshot(userId)
    window.location.assign('/')
  }

  async function handleSignOut() {
    await onSignOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-w-0">
      <header>
        <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[44px]">
          Account
        </h1>
        <p className="mt-3 max-w-[42ch] text-[15px] text-ink-muted">
          Manage your Travel OS preferences.
        </p>
      </header>

      <section className="mt-12">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Profile</p>
        <dl className="mt-5 grid gap-8 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Name</dt>
            <dd className="mt-2 text-[17px] text-ink">{identity.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Email</dt>
            <dd className="mt-2 break-words text-[17px] text-ink">{identity.email || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-14">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Appearance</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {THEME_PREFERENCES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={preference === value}
              className={`inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-md px-4 text-[13px] capitalize ${
                preference === value ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-14 max-w-sm">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Preferences</p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          Default currency for future trips and expenses. Existing amounts stay as they are.
        </p>
        <div className="mt-5">
          <Field label="Default currency">
            <select className={fieldClass} value={prefs.defaultCurrency} onChange={handleCurrency}>
              {PREFERRED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="mt-14">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Data</p>
        <p className="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-ink-muted">
          Export and clear apply to Travel OS data stored on this device. Cloud trips stay in your
          Supabase account.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setExporting(true)
              handleExport()
            }}
          >
            {exporting ? 'Exporting…' : 'Export data'}
          </Button>
        </div>
        <div className="mt-8">
          {confirmClear ? (
            <div>
              <p className="max-w-[48ch] text-[14px] text-ink">
                Remove local trips, expenses, packing, checklist, and notes on this device? This
                cannot be undone. Cloud data is not deleted.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={handleClear}>Clear local data</Button>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                  Keep data
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm text-ink-subtle hover:text-ink"
              onClick={() => setConfirmClear(true)}
            >
              Clear local data
            </button>
          )}
        </div>
      </section>

      <section className="mt-16">
        <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">Session</p>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center text-sm text-accent hover:text-accent-hover"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </section>
    </div>
  )
}
