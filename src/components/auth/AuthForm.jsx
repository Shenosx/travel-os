import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { safeCloudJoinPath } from '../../lib/trips/invitations.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'

export function AuthForm({ mode }) {
  const { configured, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = safeCloudJoinPath(params.get('next'))

  async function onSubmit(event) {
    event.preventDefault()
    if (!configured) {
      setError('Cloud account is not connected on this device.')
      return
    }
    setError('')
    setBusy(true)
    const result =
      mode === 'signup'
        ? await signUp({ email, password, name })
        : await signIn({ email, password })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.needsConfirmation) return
    navigate(next || '/', { replace: true })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!configured ? (
        <div className="rounded-md border border-line bg-canvas-muted px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-muted">
            Cloud account is not connected on this device. Add the public Supabase URL and anon key
            to continue.
          </p>
          <p className="mt-2 text-[13px] text-ink-subtle">
            Copy <code className="text-ink">.env.example</code> to{' '}
            <code className="text-ink">.env.local</code>.
          </p>
        </div>
      ) : null}
      {mode === 'signup' ? (
        <Field label="Name">
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Jamie Lim"
            required
          />
        </Field>
      ) : null}
      <Field label="Email">
        <input
          className={fieldClass}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
        />
      </Field>
      <Field label="Password">
        <input
          className={fieldClass}
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </Field>

      {error ? <p className="text-sm text-accent">{error}</p> : null}

      <Button type="submit" className="w-full min-h-11" disabled={busy}>
        {busy ? 'Please wait' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-[13px] text-ink-muted">
        {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
        <Link
          to={next ? `/${mode === 'signup' ? 'signin' : 'signup'}?next=${encodeURIComponent(next)}` : mode === 'signup' ? '/signin' : '/signup'}
          className="text-accent hover:text-accent-hover"
        >
          {mode === 'signup' ? 'Sign in' : 'Sign up'}
        </Link>
      </p>
    </form>
  )
}
