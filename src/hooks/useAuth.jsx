import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  displayIdentity,
  fetchOwnProfileWithRetry,
  formatAuthError,
  isEmailConfirmationPending,
  mapAuthUser,
} from '../lib/auth/session.js'
import { getSupabaseClient } from '../lib/supabase/client.js'
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

export function AuthProvider({ children }) {
  const configured = isConfigured()
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileStatus, setProfileStatus] = useState('idle')
  const [loading, setLoading] = useState(configured)
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('')

  const applySession = useCallback((nextSession) => {
    setSession(nextSession ?? null)
    setUser(nextSession?.user ?? null)
    if (!nextSession?.user) {
      setProfile(null)
      setProfileStatus('idle')
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return undefined

    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      applySession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
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

    setPendingConfirmationEmail('')
    return { ok: true, needsConfirmation: false }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { ok: false, error: 'Cloud account is not configured.' }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) return { ok: false, error: formatAuthError(error) }
    setPendingConfirmationEmail('')
    return { ok: true }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return { ok: true }
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
