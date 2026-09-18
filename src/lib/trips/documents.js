/**
 * Cloud booking documents. Bytes live in the private booking-docs bucket.
 * Metadata rows live in booking_documents. created_by comes from tg_force_created_by.
 * This module does not write to the local Travel OS store.
 */

import { isCloudTripId } from './cloud.js'
import { isCloudBookingId } from './bookings.js'

export const CLOUD_BOOKING_DOCS_BUCKET = 'booking-docs'
export const CLOUD_BOOKING_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const CLOUD_BOOKING_DOCUMENT_SIGNED_URL_SECONDS = 120

export const CLOUD_BOOKING_DOCUMENT_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
])

export const CLOUD_BOOKING_DOCUMENT_COLUMNS = [
  'id',
  'booking_id',
  'trip_id',
  'name',
  'storage_bucket',
  'storage_path',
  'mime_type',
  'size_bytes',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

export const CLOUD_BOOKING_DOCUMENT_INSERT_COLUMNS = Object.freeze([
  'id',
  'booking_id',
  'name',
  'storage_bucket',
  'storage_path',
  'mime_type',
  'size_bytes',
])

export const CLOUD_BOOKING_DOCUMENT_FORBIDDEN_WRITE_COLUMNS = Object.freeze([
  'created_by',
  'created_at',
  'updated_at',
  'trip_id',
  'owner_id',
  'actor_id',
  'user_id',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIME_SET = new Set(CLOUD_BOOKING_DOCUMENT_MIME_TYPES)
const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
}

const ACTION_FALLBACK = {
  load: 'Documents could not be loaded just now.',
  create: 'This document could not be saved.',
  delete: 'This document could not be deleted.',
  open: 'This document could not be opened.',
  orphan: 'The file was uploaded but could not be saved. Try again.',
}

export function isCloudDocumentId(value) {
  return UUID_RE.test(String(value ?? ''))
}

function redactSecrets(value) {
  return String(value ?? '').replace(/[0-9a-f]{32,}/gi, '[redacted]')
}

export function formatCloudDocumentError(error, action = 'load') {
  const fallback = ACTION_FALLBACK[action] ?? ACTION_FALLBACK.load
  const message = redactSecrets(String(error?.message ?? error ?? '').trim())
  const code = String(error?.code ?? '')
  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'Could not reach the cloud just now. Local trips are unchanged.'
  }
  if (code === 'PGRST301' || /jwt|not authenticated|invalid claim|must be authenticated/i.test(message)) {
    return 'Sign in to continue.'
  }
  if (action === 'orphan') return ACTION_FALLBACK.orphan
  if (/empty file|at least one byte/i.test(message)) return 'Choose a file that is not empty.'
  if (/too large|maximum|10485760|file size/i.test(message)) return 'Choose a file smaller than 10 MB.'
  if (/mime|content type|not an allowed/i.test(message)) return 'Use a PDF, JPEG, PNG, or text file.'
  if (/path must be trip\/booking\/document|cannot move|bucket cannot change/i.test(message)) {
    return 'That document does not belong to this booking.'
  }
  if (code === '23503' || /foreign key|_trip_fkey|_booking_fkey/i.test(message)) {
    return 'That document does not belong to this booking.'
  }
  if (code === '23505' || /duplicate|unique/i.test(message)) {
    return 'That document could not be saved.'
  }
  if (code === '42501' || /permission|rls|row-level|42501/i.test(message)) {
    if (action === 'create') return 'This document could not be saved.'
    if (action === 'delete') return 'This document could not be deleted.'
    if (action === 'open') return 'This document could not be opened.'
    return 'Those documents are not available to this account.'
  }
  if (/column|relation|schema cache|constraint|sqlstate|storage\.objects/i.test(message)) return fallback
  return fallback
}

function logCloudDocumentDetail(error) {
  try {
    if (import.meta?.env?.DEV) console.error('[cloud document]', error)
  } catch {
    /* node tests and non-vite runtimes */
  }
}

export function normalizeCloudDocumentMime(value) {
  const raw = String(value ?? '').trim().toLowerCase()
  const mapped = MIME_ALIASES[raw] ?? raw
  return MIME_SET.has(mapped) ? mapped : ''
}

export function cloudDocumentExtension(mimeType) {
  switch (normalizeCloudDocumentMime(mimeType)) {
    case 'application/pdf':
      return '.pdf'
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'text/plain':
      return '.txt'
    default:
      return ''
  }
}

export function sanitizeCloudDocumentName(name) {
  let value = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '')
  value = value.replace(/[\\/]+/g, '-')
  value = value.replace(/^[.-]+/, '')
  value = value.trim()
  if (!value) return 'document'
  if (value.length <= 180) return value
  const dot = value.lastIndexOf('.')
  const ext = dot > 0 ? value.slice(dot) : ''
  const safeExt = /^\.(pdf|jpe?g|png|txt)$/i.test(ext) ? ext : ''
  return `${value.slice(0, 180 - safeExt.length)}${safeExt}`
}

export function buildCloudBookingDocumentPath({ tripId, bookingId, documentId, mimeType }) {
  const ext = cloudDocumentExtension(mimeType)
  return `${tripId}/${bookingId}/${documentId}${ext}`
}

export function validateCloudDocumentFile(file) {
  if (!file) return 'Choose a file to upload.'
  const size = Number(file.size ?? 0)
  if (!Number.isFinite(size) || size <= 0) return 'Choose a file that is not empty.'
  if (size > CLOUD_BOOKING_DOCUMENT_MAX_BYTES) return 'Choose a file smaller than 10 MB.'
  if (!normalizeCloudDocumentMime(file.type)) return 'Use a PDF, JPEG, PNG, or text file.'
  return null
}

/** Presentation only. RLS remains the authorization boundary. */
export function cloudDocumentCapabilities(role) {
  const canRead = Boolean(role)
  const canWrite = role === 'owner' || role === 'editor'
  return { canRead, canUpload: canWrite, canDelete: canWrite }
}

export function mapCloudBookingDocument(row) {
  if (!row) return null
  return {
    id: row.id,
    bookingId: row.booking_id,
    tripId: row.trip_id,
    name: row.name,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'cloud',
  }
}

export function cloudBookingDocumentInsertPayload({
  id,
  bookingId,
  name,
  storagePath,
  mimeType,
  sizeBytes,
}) {
  return {
    id,
    booking_id: bookingId,
    name,
    storage_bucket: CLOUD_BOOKING_DOCS_BUCKET,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  }
}

export async function getCloudBookingDocuments(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId
  const bookingId = args.bookingId

  if (!client) return { documents: [], error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { documents: [], error: 'Sign in to see documents on this booking.' }
  if (!isCloudTripId(tripId) || !isCloudBookingId(bookingId)) {
    return { documents: [], error: 'That cloud booking could not be found.' }
  }

  const { data, error } = await client
    .from('booking_documents')
    .select(CLOUD_BOOKING_DOCUMENT_COLUMNS)
    .eq('trip_id', tripId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })

  if (error) {
    logCloudDocumentDetail(error)
    return { documents: [], error: formatCloudDocumentError(error) }
  }

  return {
    documents: (data ?? []).map(mapCloudBookingDocument).filter(Boolean),
    error: null,
  }
}

export async function uploadCloudBookingDocument(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const tripId = args.tripId
  const bookingId = args.bookingId
  const file = args.file
  const documentId = isCloudDocumentId(args.id) ? args.id : crypto.randomUUID()

  if (!client) return { document: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { document: null, error: 'Sign in to add a document.' }
  if (!isCloudTripId(tripId) || !isCloudBookingId(bookingId)) {
    return { document: null, error: 'That cloud booking could not be found.' }
  }

  const fileError = validateCloudDocumentFile(file)
  if (fileError) return { document: null, error: fileError }

  const mimeType = normalizeCloudDocumentMime(file.type)
  const name = sanitizeCloudDocumentName(file.name)
  const storagePath = buildCloudBookingDocumentPath({
    tripId,
    bookingId,
    documentId,
    mimeType,
  })
  const payload = cloudBookingDocumentInsertPayload({
    id: documentId,
    bookingId,
    name,
    storagePath,
    mimeType,
    sizeBytes: Number(file.size),
  })

  const uploaded = await client.storage.from(CLOUD_BOOKING_DOCS_BUCKET).upload(storagePath, file, {
    contentType: mimeType,
    upsert: false,
  })

  if (uploaded.error) {
    logCloudDocumentDetail(uploaded.error)
    return { document: null, error: formatCloudDocumentError(uploaded.error, 'create') }
  }

  const inserted = await client
    .from('booking_documents')
    .insert(payload)
    .select(CLOUD_BOOKING_DOCUMENT_COLUMNS)
    .single()

  if (inserted.error) {
    logCloudDocumentDetail(inserted.error)
    const cleanup = await client.storage.from(CLOUD_BOOKING_DOCS_BUCKET).remove([storagePath])
    if (cleanup.error) {
      logCloudDocumentDetail(cleanup.error)
      return { document: null, error: formatCloudDocumentError(cleanup.error, 'orphan') }
    }
    return { document: null, error: formatCloudDocumentError(inserted.error, 'create') }
  }

  return { document: mapCloudBookingDocument(inserted.data), error: null }
}

export async function getCloudBookingDocumentUrl(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const tripId = args.tripId
  const bookingId = args.bookingId

  if (!client) return { url: null, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { url: null, error: 'Sign in to open a document.' }
  if (!isCloudDocumentId(id)) return { url: null, error: 'That document could not be found.' }

  let query = client.from('booking_documents').select(CLOUD_BOOKING_DOCUMENT_COLUMNS).eq('id', id)
  if (isCloudTripId(tripId)) query = query.eq('trip_id', tripId)
  if (isCloudBookingId(bookingId)) query = query.eq('booking_id', bookingId)
  const { data, error } = await query.maybeSingle()

  if (error) {
    logCloudDocumentDetail(error)
    return { url: null, error: formatCloudDocumentError(error, 'open') }
  }
  if (!data) return { url: null, error: 'That document could not be found.' }

  const signed = await client.storage
    .from(data.storage_bucket || CLOUD_BOOKING_DOCS_BUCKET)
    .createSignedUrl(data.storage_path, CLOUD_BOOKING_DOCUMENT_SIGNED_URL_SECONDS)

  if (signed.error || !signed.data?.signedUrl) {
    logCloudDocumentDetail(signed.error)
    return { url: null, error: formatCloudDocumentError(signed.error, 'open') }
  }

  return { url: signed.data.signedUrl, error: null }
}

export async function deleteCloudBookingDocument(args = {}) {
  const client = args.client ?? null
  const session = args.session ?? null
  const id = args.id
  const tripId = args.tripId
  const bookingId = args.bookingId

  if (!client) return { ok: false, error: 'Cloud trips are not connected on this device.' }
  if (!session?.user) return { ok: false, error: 'Sign in to delete a document.' }
  if (!isCloudDocumentId(id)) return { ok: false, error: 'That document could not be found.' }

  let query = client.from('booking_documents').select(CLOUD_BOOKING_DOCUMENT_COLUMNS).eq('id', id)
  if (isCloudTripId(tripId)) query = query.eq('trip_id', tripId)
  if (isCloudBookingId(bookingId)) query = query.eq('booking_id', bookingId)
  const loaded = await query.maybeSingle()

  if (loaded.error) {
    logCloudDocumentDetail(loaded.error)
    return { ok: false, error: formatCloudDocumentError(loaded.error, 'delete') }
  }
  if (!loaded.data) return { ok: false, error: 'That document could not be found.' }

  const removed = await client.storage
    .from(loaded.data.storage_bucket || CLOUD_BOOKING_DOCS_BUCKET)
    .remove([loaded.data.storage_path])

  if (removed.error) {
    logCloudDocumentDetail(removed.error)
    return { ok: false, error: formatCloudDocumentError(removed.error, 'delete') }
  }

  const deleted = await client
    .from('booking_documents')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (deleted.error) {
    logCloudDocumentDetail(deleted.error)
    return { ok: false, error: formatCloudDocumentError(deleted.error, 'delete') }
  }
  if (!deleted.data) return { ok: false, error: 'This document could not be deleted.' }
  return { ok: true, error: null }
}
