/**
 * Optional client-generated primary keys for idempotent Cloud inserts.
 * Triggers still set created_by / owner_id from auth.uid().
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isClientRowId(value) {
  return UUID_RE.test(String(value ?? ''))
}

export function attachClientRowId(payload, id) {
  if (!payload || typeof payload !== 'object') return payload
  if (isClientRowId(id)) payload.id = id
  return payload
}

/**
 * After a unique-violation insert, load the row by the client id.
 * If it exists, the first attempt already committed.
 */
export async function recoverDuplicateInsert(args = {}) {
  const error = args.error
  const id = args.id
  if (String(error?.code ?? '') !== '23505' || !isClientRowId(id) || !args.client?.from) {
    return { data: null, recovered: false }
  }

  const query = args.client.from(args.table).select(args.columns)
  const filtered = typeof query?.eq === 'function' ? query.eq('id', id) : query
  const result = await (typeof filtered?.maybeSingle === 'function'
    ? filtered.maybeSingle()
    : Promise.resolve({ data: null, error: null }))

  if (result?.error || !result?.data) return { data: null, recovered: false }
  return { data: result.data, recovered: true }
}
