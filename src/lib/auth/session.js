/**
 * Pure auth/session helpers. Profile rows are created by the database trigger,
 * never by this module.
 */

export function mapAuthUser(user) {
  if (!user) return null
  const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}
  return {
    id: user.id,
    email: user.email ?? '',
    name: String(metadata.name ?? metadata.full_name ?? '').trim(),
    emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
  }
}

export function isEmailConfirmationPending(result) {
  return Boolean(result?.user) && !result?.session
}

export function formatAuthError(error) {
  const message = String(error?.message ?? error ?? '').trim()
  if (!message) return 'Something went wrong. Try again.'
  if (/email not confirmed/i.test(message)) {
    return 'Confirm this email address before signing in. Check your inbox.'
  }
  if (/invalid login credentials/i.test(message)) {
    return 'That email or password is not right.'
  }
  if (/user already registered/i.test(message)) {
    return 'An account with that email already exists. Sign in instead.'
  }
  if (/password/i.test(message) && /at least|too short|6/i.test(message)) {
    return 'Use a password of at least 6 characters.'
  }
  return message
}

export function initialsFromName(name, email = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase()
  const local = String(email).split('@')[0]
  return (local.slice(0, 2) || 'YO').toUpperCase()
}

/**
 * Reads the caller's own profile. Relies on RLS (id = auth.uid()).
 * Does not insert or upsert a profile.
 *
 * @param {{ from: Function }} supabase
 * @param {string} userId
 */
export async function fetchOwnProfile(supabase, userId) {
  if (!supabase || !userId) return { profile: null, error: null }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, short_name, email, initials')
    .eq('id', userId)
    .maybeSingle()

  if (error) return { profile: null, error }
  return { profile: data ?? null, error: null }
}

export async function fetchOwnProfileWithRetry(supabase, userId, wait = delay) {
  const first = await fetchOwnProfile(supabase, userId)
  if (first.profile || first.error) return first
  await wait(400)
  return fetchOwnProfile(supabase, userId)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function displayIdentity(profile, user) {
  const mapped = mapAuthUser(user)
  const name = profile?.name || mapped?.name || mapped?.email || ''
  const email = profile?.email || mapped?.email || ''
  return {
    id: mapped?.id ?? profile?.id ?? null,
    name,
    email,
    initials: profile?.initials || initialsFromName(name, email),
    emailConfirmed: mapped?.emailConfirmed ?? false,
  }
}
