import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'

export function AccountLink({ className = '' }) {
  const { configured, loading, session, identity } = useAuth()
  const label = !configured
    ? 'Account'
    : loading
      ? 'Account'
      : session
        ? identity.name || identity.email || 'Account'
        : 'Sign in'

  return (
    <NavLink
      to="/account"
      className={({ isActive }) =>
        `truncate text-[12px] tracking-[0.04em] ${
          isActive ? 'text-accent' : 'text-ink-subtle hover:text-ink'
        } ${className}`
      }
    >
      {label}
    </NavLink>
  )
}
