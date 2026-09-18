/**
 * Public Supabase env for the browser client.
 * Never read service_role, database passwords, or other secrets here.
 */

export const SUPABASE_URL_ENV = 'VITE_SUPABASE_URL'
export const SUPABASE_ANON_KEY_ENV = 'VITE_SUPABASE_ANON_KEY'

const FORBIDDEN_ENV = [
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
]

export function decodeJwtRole(token) {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return null
  try {
    const json = decodeBase64Url(parts[1])
    const payload = JSON.parse(json)
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function decodeBase64Url(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (segment.length % 4)) % 4)
  if (typeof atob === 'function') return atob(padded)
  return Buffer.from(padded, 'base64').toString('utf8')
}

/**
 * @param {Record<string, string | undefined>} [source]
 * @returns {{ url: string, anonKey: string } | null}
 */
export function getSupabaseConfig(source = {}) {
  for (const name of FORBIDDEN_ENV) {
    if (source[name]) {
      throw new Error('Service-role credentials must not be exposed to the client.')
    }
  }

  const url = String(source[SUPABASE_URL_ENV] ?? '').trim()
  const anonKey = String(source[SUPABASE_ANON_KEY_ENV] ?? '').trim()
  if (!url || !anonKey) return null

  const role = decodeJwtRole(anonKey)
  if (role === 'service_role') {
    throw new Error('The Supabase client must use the anon/publishable key, not the service role key.')
  }

  return { url, anonKey }
}

export function isSupabaseConfigured(source = {}) {
  return getSupabaseConfig(source) != null
}
