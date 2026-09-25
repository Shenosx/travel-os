import { createClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './env.js'

export const AUTH_STORAGE_KEY = 'travel-os-auth'

let client = null
let clientKey = ''

function readViteEnv() {
  try {
    return import.meta.env ?? {}
  } catch {
    return {}
  }
}

/**
 * Single browser Supabase client. Returns null when env is not configured
 * so the local Travel OS store can keep running without a cloud project.
 */
export function getSupabaseClient(source = readViteEnv()) {
  try {
    return createConfiguredClient(source)
  } catch (error) {
    console.error(error)
    client = null
    clientKey = ''
    return null
  }
}

function createConfiguredClient(source) {
  const config = getSupabaseConfig(source)
  if (!config) {
    client = null
    clientKey = ''
    return null
  }

  const nextKey = `${config.url}::${config.anonKey}`
  if (client && clientKey === nextKey) return client

  client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  })
  clientKey = nextKey
  return client
}

export function resetSupabaseClient() {
  client = null
  clientKey = ''
}
