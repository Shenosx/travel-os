import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOUD_BOOKING_DOCS_BUCKET,
  CLOUD_BOOKING_DOCUMENT_FORBIDDEN_WRITE_COLUMNS,
  CLOUD_BOOKING_DOCUMENT_INSERT_COLUMNS,
  CLOUD_BOOKING_DOCUMENT_MAX_BYTES,
  CLOUD_BOOKING_DOCUMENT_SIGNED_URL_SECONDS,
  buildCloudBookingDocumentPath,
  cloudBookingDocumentInsertPayload,
  cloudDocumentCapabilities,
  deleteCloudBookingDocument,
  formatCloudDocumentError,
  getCloudBookingDocumentUrl,
  getCloudBookingDocuments,
  mapCloudBookingDocument,
  sanitizeCloudDocumentName,
  uploadCloudBookingDocument,
  validateCloudDocumentFile,
} from './documents.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const session = { user: { id: '00000000-0000-0000-0000-000000000001' } }
const tripId = '11111111-1111-1111-1111-111111111111'
const otherTripId = '22222222-2222-2222-2222-222222222222'
const bookingId = '55555555-5555-5555-5555-555555555555'
const documentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const you = session.user.id

function fakeFile(name, type, size = 1200) {
  return { name, type, size }
}

const row = {
  id: documentId,
  booking_id: bookingId,
  trip_id: tripId,
  name: 'invoice.pdf',
  storage_bucket: CLOUD_BOOKING_DOCS_BUCKET,
  storage_path: `${tripId}/${bookingId}/${documentId}.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 1200,
  created_by: you,
  created_at: '2026-09-17T12:00:00Z',
  updated_at: '2026-09-17T12:00:00Z',
}

function thenable(result) {
  const promise = Promise.resolve(result)
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

function chain(result, calls) {
  const api = {
    select(columns) {
      calls.push(['select', columns])
      return api
    },
    eq(column, value) {
      calls.push(['eq', column, value])
      return api
    },
    order(column, options) {
      calls.push(['order', column, options])
      return thenable(result)
    },
    insert(payload) {
      calls.push(['insert', payload])
      return api
    },
    delete() {
      calls.push(['delete'])
      return api
    },
    single() {
      calls.push(['single'])
      return Promise.resolve(result)
    },
    maybeSingle() {
      calls.push(['maybeSingle'])
      return Promise.resolve(result)
    },
  }
  return api
}

function mockReadClient({ data = [], error = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return chain({ data, error }, calls)
    },
    storage: {
      from() {
        throw new Error('read must not use Storage')
      },
    },
  }
}

function mockDocumentClient({
  loaded = { data: row, error: null },
  insert = { data: row, error: null },
  remove = { data: { id: documentId }, error: null },
  upload = { data: { path: row.storage_path }, error: null },
  signed = { data: { signedUrl: 'https://signed.example/doc' }, error: null },
  storageRemove = { data: [], error: null },
} = {}) {
  const calls = []
  let selects = 0
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          selects += 1
          const result = selects === 1 && loaded ? loaded : remove
          return chain(result, calls)
        },
        insert(payload) {
          calls.push(['insert', payload])
          return chain(insert, calls)
        },
        delete() {
          calls.push(['delete'])
          return chain(remove, calls)
        },
      }
    },
    storage: {
      from(bucket) {
        calls.push(['storage.from', bucket])
        return {
          upload(path, file, options) {
            calls.push(['upload', path, file, options])
            return Promise.resolve(upload)
          },
          remove(paths) {
            calls.push(['storage.remove', paths])
            return Promise.resolve(storageRemove)
          },
          createSignedUrl(path, expires) {
            calls.push(['createSignedUrl', path, expires])
            return Promise.resolve(signed)
          },
          getPublicUrl() {
            throw new Error('must not create a public URL')
          },
        }
      },
    },
  }
}

function installStorage() {
  const writes = []
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      writes.push([key, String(value)])
      map.set(key, String(value))
    },
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  }
  return { writes }
}

test('document read returns an error when supabase is not configured', async () => {
  const result = await getCloudBookingDocuments({ client: null, session, tripId, bookingId })
  assert.deepEqual(result.documents, [])
  assert.match(result.error, /not connected/)
})

test('document read requires an authenticated session', async () => {
  const client = mockReadClient()
  const result = await getCloudBookingDocuments({ client, session: null, tripId, bookingId })
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('document read maps one booking without a user-id filter', async () => {
  const client = mockReadClient({ data: [row] })
  const result = await getCloudBookingDocuments({ client, session, tripId, bookingId })
  assert.equal(result.error, null)
  assert.equal(result.documents[0].source, 'cloud')
  assert.equal(result.documents[0].name, 'invoice.pdf')
  assert.equal(result.documents[0].storagePath, row.storage_path)
  assert.deepEqual(client.calls[0], ['from', 'booking_documents'])
  assert.equal(client.calls.some((call) => call[0] === 'eq' && call[1] === 'trip_id' && call[2] === tripId), true)
  assert.equal(client.calls.some((call) => call[0] === 'eq' && call[1] === 'booking_id' && call[2] === bookingId), true)
  assert.equal(client.calls.some((call) => call[0] === 'eq' && call[1] === 'created_by'), false)
  assert.equal(client.calls.some((call) => call[0] === 'eq' && call[1] === 'user_id'), false)
})

test('empty document result stays empty', async () => {
  const result = await getCloudBookingDocuments({ client: mockReadClient({ data: [] }), session, tripId, bookingId })
  assert.deepEqual(result.documents, [])
  assert.equal(result.error, null)
})

test('invalid trip or booking ids are rejected before querying', async () => {
  const client = mockReadClient()
  const result = await getCloudBookingDocuments({
    client,
    session,
    tripId: 'trip-vienna',
    bookingId,
  })
  assert.match(result.error, /could not be found/)
  assert.equal(client.calls.length, 0)
})

test('upload requires authentication', async () => {
  const client = mockDocumentClient()
  const result = await uploadCloudBookingDocument({
    client,
    session: null,
    tripId,
    bookingId,
    file: fakeFile('invoice.pdf', 'application/pdf'),
  })
  assert.match(result.error, /sign in/i)
  assert.equal(client.calls.length, 0)
})

test('upload payload only sends allowed columns and a deterministic path', async () => {
  const client = mockDocumentClient()
  const file = fakeFile('invoice.pdf', 'application/pdf', 2048)
  const result = await uploadCloudBookingDocument({
    client,
    session,
    tripId,
    bookingId,
    file,
    id: documentId,
  })
  assert.equal(result.error, null)
  assert.equal(result.document.id, documentId)
  const payload = client.calls.find((call) => call[0] === 'insert')[1]
  assert.deepEqual(Object.keys(payload), [...CLOUD_BOOKING_DOCUMENT_INSERT_COLUMNS])
  for (const column of CLOUD_BOOKING_DOCUMENT_FORBIDDEN_WRITE_COLUMNS) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, column), false, column)
  }
  assert.equal(payload.storage_bucket, CLOUD_BOOKING_DOCS_BUCKET)
  assert.equal(payload.storage_path, `${tripId}/${bookingId}/${documentId}.pdf`)
  assert.equal(payload.created_by, undefined)
  assert.equal(payload.trip_id, undefined)
  const upload = client.calls.find((call) => call[0] === 'upload')
  assert.equal(upload[1], payload.storage_path)
  assert.equal(upload[3].upsert, false)
  assert.equal(upload[3].contentType, 'application/pdf')
  assert.equal(client.calls[0][0], 'storage.from')
  assert.equal(client.calls[0][1], CLOUD_BOOKING_DOCS_BUCKET)
})

test('upload cannot use another trip id in the object path', async () => {
  const path = buildCloudBookingDocumentPath({
    tripId,
    bookingId,
    documentId,
    mimeType: 'application/pdf',
  })
  const other = buildCloudBookingDocumentPath({
    tripId: otherTripId,
    bookingId,
    documentId,
    mimeType: 'application/pdf',
  })
  assert.equal(path.startsWith(`${tripId}/`), true)
  assert.equal(path.includes(otherTripId), false)
  assert.equal(other.startsWith(`${otherTripId}/`), true)
  assert.notEqual(path, other)
})

test('client file checks reject empty, huge, and disallowed types', () => {
  assert.match(validateCloudDocumentFile(fakeFile('empty.pdf', 'application/pdf', 0)), /empty/)
  assert.match(
    validateCloudDocumentFile(fakeFile('big.pdf', 'application/pdf', CLOUD_BOOKING_DOCUMENT_MAX_BYTES + 1)),
    /10 MB/,
  )
  assert.match(validateCloudDocumentFile(fakeFile('app.exe', 'application/x-msdownload', 12)), /PDF/)
})

test('display filenames are sanitized without becoming the object identity', () => {
  assert.equal(sanitizeCloudDocumentName('receipt-vienna.pdf'), 'receipt-vienna.pdf')
  assert.equal(sanitizeCloudDocumentName('../etc/passwd'), 'etc-passwd')
  assert.equal(sanitizeCloudDocumentName('a/b\\c.pdf'), 'a-b-c.pdf')
  const path = buildCloudBookingDocumentPath({
    tripId,
    bookingId,
    documentId,
    mimeType: 'application/pdf',
  })
  assert.equal(path.includes('receipt'), false)
  assert.equal(path, `${tripId}/${bookingId}/${documentId}.pdf`)
})

test('failed metadata insert removes the uploaded object', async () => {
  const client = mockDocumentClient({
    insert: { data: null, error: { message: 'row-level security' } },
  })
  const result = await uploadCloudBookingDocument({
    client,
    session,
    tripId,
    bookingId,
    file: fakeFile('invoice.pdf', 'application/pdf'),
    id: documentId,
  })
  assert.match(result.error, /could not be saved/)
  assert.equal(result.document, null)
  const cleanup = client.calls.find((call) => call[0] === 'storage.remove')
  assert.deepEqual(cleanup[1], [`${tripId}/${bookingId}/${documentId}.pdf`])
})

test('failed metadata insert reports a short error if object cleanup also fails', async () => {
  const client = mockDocumentClient({
    insert: { data: null, error: { message: 'row-level security' } },
    storageRemove: { data: null, error: { message: 'storage.objects constraint sqlstate 42501' } },
  })
  const result = await uploadCloudBookingDocument({
    client,
    session,
    tripId,
    bookingId,
    file: fakeFile('invoice.pdf', 'application/pdf'),
    id: documentId,
  })
  assert.equal(result.error, 'The file was uploaded but could not be saved. Try again.')
  assert.equal(result.error.includes('42501'), false)
  assert.equal(result.error.includes('storage.objects'), false)
})

test('delete removes the storage object then the metadata row', async () => {
  const client = mockDocumentClient()
  const result = await deleteCloudBookingDocument({ client, session, id: documentId, tripId, bookingId })
  assert.equal(result.ok, true)
  const storageIndex = client.calls.findIndex((call) => call[0] === 'storage.remove')
  const deleteIndex = client.calls.findIndex((call) => call[0] === 'delete')
  assert.equal(storageIndex > -1, true)
  assert.equal(deleteIndex > storageIndex, true)
  assert.deepEqual(client.calls[storageIndex][1], [row.storage_path])
})

test('delete does not claim success if storage removal fails', async () => {
  const client = mockDocumentClient({
    storageRemove: { data: null, error: { message: 'row-level security' } },
  })
  const result = await deleteCloudBookingDocument({ client, session, id: documentId, tripId, bookingId })
  assert.equal(result.ok, false)
  assert.match(result.error, /could not be deleted/)
  assert.equal(client.calls.some((call) => call[0] === 'delete'), false)
})

test('signed urls are short-lived and never public', async () => {
  const client = mockDocumentClient()
  const result = await getCloudBookingDocumentUrl({ client, session, id: documentId, tripId, bookingId })
  assert.equal(result.url, 'https://signed.example/doc')
  assert.deepEqual(client.calls.find((call) => call[0] === 'createSignedUrl'), [
    'createSignedUrl',
    row.storage_path,
    CLOUD_BOOKING_DOCUMENT_SIGNED_URL_SECONDS,
  ])
  assert.equal(CLOUD_BOOKING_DOCUMENT_SIGNED_URL_SECONDS, 120)
  assert.equal(client.calls.some((call) => call[0] === 'getPublicUrl'), false)
})

test('errors stay short and do not leak postgres or storage internals', () => {
  const error = formatCloudDocumentError(
    {
      code: '23503',
      message: 'insert or update on table "booking_documents" violates foreign key constraint "booking_documents_booking_trip_fkey"',
    },
    'create',
  )
  assert.equal(error, 'That document does not belong to this booking.')
  assert.equal(error.includes('booking_trip_fkey'), false)
  assert.equal(formatCloudDocumentError({ code: '42501', message: 'permission denied for table booking_documents' }).includes('42501'), false)
})

test('viewer can read while only owner and editor can upload or delete', () => {
  assert.deepEqual(cloudDocumentCapabilities('viewer'), {
    canRead: true,
    canUpload: false,
    canDelete: false,
  })
  assert.equal(cloudDocumentCapabilities('editor').canUpload, true)
  assert.equal(cloudDocumentCapabilities('owner').canDelete, true)
})

test('mapped documents keep storage identity separate from the display name', () => {
  const mapped = mapCloudBookingDocument(row)
  assert.equal(mapped.name, 'invoice.pdf')
  assert.equal(mapped.storagePath, row.storage_path)
  assert.equal(Object.prototype.hasOwnProperty.call(mapped, 'file'), false)
  assert.equal(
    cloudBookingDocumentInsertPayload({
      id: documentId,
      bookingId,
      name: 'invoice.pdf',
      storagePath: row.storage_path,
      mimeType: 'application/pdf',
      sizeBytes: 1200,
    }).created_by,
    undefined,
  )
})

test('cloud document writes do not touch local storage', async () => {
  const { writes } = installStorage()
  const client = mockDocumentClient()
  await uploadCloudBookingDocument({
    client,
    session,
    tripId,
    bookingId,
    file: fakeFile('invoice.pdf', 'application/pdf'),
    id: documentId,
  })
  await deleteCloudBookingDocument({ client, session, id: documentId, tripId, bookingId })
  assert.equal(writes.length, 0)
})

test('cloud document code stays off the local store and service role', () => {
  const files = [
    'src/lib/trips/documents.js',
    'src/hooks/useCloudBookingDocuments.js',
    'src/components/trips/CloudBookingDocumentsSheet.jsx',
    'src/components/trips/CloudBookingDocumentForm.jsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')
    assert.equal(src.includes('saveSnapshot'), false, file)
    assert.equal(src.includes('pendingOps'), false, file)
    assert.equal(src.includes('travel-os:data:v1'), false, file)
    assert.equal(src.includes('useAppData'), false, file)
    assert.equal(src.includes('service_role'), false, file)
    assert.equal(src.includes('getPublicUrl'), false, file)
  }
  const layer = readFileSync(join(root, 'src/lib/trips/documents.js'), 'utf8')
  assert.match(layer, /from\('booking_documents'\)/)
  assert.match(layer, /storage\.from/)
  assert.equal(layer.includes('createBucket'), false)
})
