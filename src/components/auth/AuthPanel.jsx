import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { Button } from '../ui/Button.jsx'
import { fieldClass, Field } from '../ui/Field.jsx'

export function AuthPanel() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const result =
      mode === 'signup'
        ? await signUp({ email, password, name })
        : await signIn({ email, password })
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      {mode === 'signup' ? (
        <Field label="Name">
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Jamie Lim"
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

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Please wait' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-[13px] text-ink-muted">
        {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
        <button
          type="button"
          className="text-accent hover:text-accent-hover"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup')
            setError('')
          }}
        >
          {mode === 'signup' ? 'Sign in' : 'Sign up'}
        </button>
      </p>
    </form>
  )
}
