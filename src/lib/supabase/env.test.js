import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeJwtRole,
  getSupabaseConfig,
  isSupabaseConfigured,
  SUPABASE_ANON_KEY_ENV,
  SUPABASE_URL_ENV,
} from './env.js'

function jwtWithRole(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url')
  return `${header}.${payload}.sig`
}

test('missing public env means supabase is not configured', () => {
  assert.equal(getSupabaseConfig({}), null)
  assert.equal(isSupabaseConfigured({}), false)
  assert.equal(getSupabaseConfig({ [SUPABASE_URL_ENV]: 'https://example.supabase.co' }), null)
})

test('anon key and url produce a public config', () => {
  const anon = jwtWithRole('anon')
  const config = getSupabaseConfig({
    [SUPABASE_URL_ENV]: 'https://example.supabase.co',
    [SUPABASE_ANON_KEY_ENV]: anon,
  })
  assert.deepEqual(config, { url: 'https://example.supabase.co', anonKey: anon })
  assert.equal(decodeJwtRole(anon), 'anon')
})

test('publishable non-jwt keys are accepted', () => {
  const config = getSupabaseConfig({
    [SUPABASE_URL_ENV]: 'https://example.supabase.co',
    [SUPABASE_ANON_KEY_ENV]: 'sb_publishable_example',
  })
  assert.equal(config.anonKey, 'sb_publishable_example')
})

test('a service_role key is rejected even if placed in the anon env var', () => {
  assert.throws(
    () =>
      getSupabaseConfig({
        [SUPABASE_URL_ENV]: 'https://example.supabase.co',
        [SUPABASE_ANON_KEY_ENV]: jwtWithRole('service_role'),
      }),
    /anon\/publishable key/,
  )
})

test('service-role env names are refused', () => {
  assert.throws(
    () =>
      getSupabaseConfig({
        [SUPABASE_URL_ENV]: 'https://example.supabase.co',
        [SUPABASE_ANON_KEY_ENV]: jwtWithRole('anon'),
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'secret',
      }),
    /must not be exposed/,
  )
})
