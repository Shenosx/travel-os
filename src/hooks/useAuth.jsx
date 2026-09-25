import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  authUserFromSession,
  displayIdentity,
  fetchOwnProfileWithRetry,
  formatAuthError,
  isEmailConfirmationPending,
  mapAuthUser,
} from '../lib/auth/session.js'
import { AUTH_STORAGE_KEY, getSupabaseClient } from '../lib/supabase/client.js'
import { getSupabaseConfig } from '../lib/supabase/env.js'

const AuthContext = createContext(null)

function viteEnv() {
  try {
    return import.meta.env ?? {}
  } catch {
    return {}
  }
}

function isConfigured() {
  try {
    return getSupabaseConfig(viteEnv()) != null
  } catch {
    return false
  }
}

function sessionWithUser(session, user) {
  if (!session) return user ? { user } : null
  if (!user) return session
  return { ...session, user }
}

function sanitizeSession(nextSession) {
  if (!nextSession) return null
  const resolved = authUserFromSession(nextSession)
  if (nextSession.user?.__isUserNotAvailableProxy) {
    return { ...nextSession, user: resolved ?? undefined }
  }
  if (!nextSession.user && resolved) return { ...nextSession, user: resolved }
  return nextSession
}

function readPersistedAuthSession() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.access_token !== 'string' && !parsed.user) return null
    return sanitizeSession(parsed)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const configured = isConfigured()
  const [session, setSession] = useState(readPersistedAuthSession)
  const [profile, setProfile] = useState(null)
  const [profileStatus, setProfileStatus] = useState('idle')
  const [loading, setLoading] = useState(() => configured && !readPersistedAuthSession())
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('')
  const user = authUserFromSession(session)

  const applySession = useCallback((nextSession) => {
    const resolved = sanitizeSession(nextSession)
    setSession(resolved)
    if (!authUserFromSession(resolved)) {
      setProfile(null)
      setProfileStatus('idle')
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      setLoading(false)
      return undefined
    }

    let cancelled = false

    function resolveAndApply(nextSession) {
      applySession(sanitizeSession(nextSession))
      if (nextSession && !authUserFromSession(nextSession)) {
        supabase.auth
          .getUser()
          .then(({ data }) => {
            if (cancelled || !data.user) return
            applySession(sessionWithUser(nextSession, data.user))
          })
          .catch(() => {})
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        resolveAndApply(data.session)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      resolveAndApply(nextSession)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [applySession])

  useEffect(() => {
    const userId = user?.id
    if (!userId) return undefined

    const supabase = getSupabaseClient()
    if (!supabase) return undefined

    let cancelled = false

    fetchOwnProfileWithRetry(supabase, userId).then(({ profile: nextProfile, error }) => {
      if (cancelled) return
      setProfile(nextProfile)
      setProfileStatus(error ? 'error' : nextProfile ? 'ready' : 'missing')
    })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const signUp = useCallback(async ({ email, password, name }) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { ok: false, error: 'Cloud account is not configured.' }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: name?.trim() ? { name: name.trim() } : {},
      },
    })

    if (error) return { ok: false, error: formatAuthError(error) }
    if (isEmailConfirmationPending(data)) {
      setPendingConfirmationEmail(data.user?.email ?? email.trim())
      return { ok: true, needsConfirmation: true }
    }

    applySession(sessionWithUser(data.session, data.user))
    setPendingConfirmationEmail('')
    setLoading(false)
    return { ok: true, needsConfirmation: false }
  }, [applySession])

  const signIn = useCallback(async ({ email, password }) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { ok: false, error: 'Cloud account is not configured.' }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) return { ok: false, error: formatAuthError(error) }
    applySession(sessionWithUser(data.session, data.user))
    setPendingConfirmationEmail('')
    setLoading(false)
    return { ok: true }
  }, [applySession])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      applySession(null)
      return { ok: true }
    }
    const { error } = await supabase.auth.signOut()
    if (error) return { ok: false, error: formatAuthError(error) }
    applySession(null)
    setPendingConfirmationEmail('')
    return { ok: true }
  }, [applySession])

  const value = useMemo(
    () => ({
      configured,
      loading,
      session,
      user,
      profile,
      profileStatus,
      identity: displayIdentity(profile, user),
      mappedUser: mapAuthUser(user),
      pendingConfirmationEmail,
      signUp,
      signIn,
      signOut,
    }),
    [
      configured,
      loading,
      session,
      user,
      profile,
      profileStatus,
      pendingConfirmationEmail,
      signUp,
      signIn,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
