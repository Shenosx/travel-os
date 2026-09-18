import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase/client.js'
import {
  createCloudSyncCoordinator,
  formatSyncSummary,
  readOnline,
  runOrQueueCloudMutation,
} from '../lib/sync/cloudSync.js'
import { inspectableFailedOps, isSyncableOp, pendingOpsForUser, summarizePendingOps } from '../lib/sync/pendingOps.js'
import { useAppData } from './useAppData.jsx'
import { useAuth } from './useAuth.jsx'

const CloudSyncContext = createContext(null)

function newCloudEntityId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`
}

function isDueSyncOp(op, nowIso) {
  if (!isSyncableOp(op)) return false
  if (op.status !== 'pending' && op.status !== 'retryable') return false
  if (!op.nextAttemptAt) return true
  return op.nextAttemptAt <= nowIso
}

export function CloudSyncProvider({ children }) {
  const { pendingOps, enqueuePendingOp, replacePendingOps } = useAppData()
  const { session, loading } = useAuth()
  const [online, setOnline] = useState(() => readOnline())
  const [syncing, setSyncing] = useState(false)
  const [lastSummary, setLastSummary] = useState(null)
  const opsRef = useRef(pendingOps)
  const sessionRef = useRef(session)
  const onlineRef = useRef(online)
  const replaceRef = useRef(replacePendingOps)

  opsRef.current = pendingOps
  sessionRef.current = session
  onlineRef.current = online
  replaceRef.current = replacePendingOps

  const coordinator = useMemo(
    () =>
      createCloudSyncCoordinator({
        getOps: () => opsRef.current,
        patchOps: (updater) => replaceRef.current(updater),
        getSession: () => sessionRef.current,
        getOnline: () => onlineRef.current,
        getClient: () => getSupabaseClient(),
      }),
    [],
  )

  const syncNow = useCallback(
    async (reason = 'manual') => {
      setSyncing(true)
      try {
        const result = await coordinator.syncNow(reason)
        setLastSummary(result)
        return result
      } finally {
        setSyncing(false)
      }
    },
    [coordinator],
  )

  const syncNowRef = useRef(syncNow)
  syncNowRef.current = syncNow

  useEffect(() => {
    function handleOnline() {
      onlineRef.current = true
      setOnline(true)
    }
    function handleOffline() {
      onlineRef.current = false
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (loading) return undefined
    if (!online || !session?.user) return undefined
    const nowIso = new Date().toISOString()
    if (!pendingOpsForUser(pendingOps, session?.user?.id).some((op) => isDueSyncOp(op, nowIso))) return undefined
    syncNowRef.current('auto')
    return undefined
  }, [loading, online, pendingOps, session])

  const scopedOps = pendingOpsForUser(pendingOps, session?.user?.id)
  const nextAttempt = scopedOps
    .filter((op) => op.status === 'retryable' && op.nextAttemptAt)
    .map((op) => op.nextAttemptAt)
    .sort()[0]

  useEffect(() => {
    if (!nextAttempt || !online || !session?.user) return undefined
    const delay = Math.max(0, new Date(nextAttempt).getTime() - Date.now())
    const timer = window.setTimeout(() => {
      syncNowRef.current('backoff')
    }, delay)
    return () => window.clearTimeout(timer)
  }, [nextAttempt, online, session])

  const runCloudWrite = useCallback(
    async ({ op, mutate }) => {
      const nextOp = {
        cloudEntityId: op.cloudEntityId || (op.action === 'create' ? newCloudEntityId() : op.payload?.id),
        ...op,
        authUserId: sessionRef.current?.user?.id ?? null,
      }
      if (!nextOp.cloudEntityId) {
        nextOp.cloudEntityId = op.action === 'create' ? newCloudEntityId() : op.payload?.id
      }
      if (nextOp.entity === 'trip' && nextOp.action === 'create' && !nextOp.cloudTripId) {
        nextOp.cloudTripId = nextOp.cloudEntityId
      }
      return runOrQueueCloudMutation({
        op: nextOp,
        mutate,
        enqueue: enqueuePendingOp,
        online: onlineRef.current,
        session: sessionRef.current,
      })
    },
    [enqueuePendingOp],
  )

  const counts = summarizePendingOps(scopedOps)
  const failedOps = inspectableFailedOps(scopedOps)
  let status = 'Synced'
  if (!online) status = 'Offline'
  else if (syncing) status = 'Syncing…'
  else if (counts.failed) status = 'Sync needs attention'
  else if (!session?.user && counts.waiting) status = 'Sign in to sync'
  else if (counts.waiting) status = `${counts.waiting} ${counts.waiting === 1 ? 'change' : 'changes'} waiting`

  const value = {
    online,
    syncing,
    status,
    counts,
    failedOps,
    lastSummary,
    session,
    syncNow,
    runCloudWrite,
    summaryLabel:
      lastSummary?.message ||
      formatSyncSummary({
        reason: !online ? 'offline' : !session?.user ? 'auth' : 'auto',
        synced: 0,
        waiting: counts.waiting,
        failed: counts.failed,
      }),
  }

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>
}

export function useCloudSync() {
  return (
    useContext(CloudSyncContext) ?? {
      online: readOnline(),
      syncing: false,
      status: 'Synced',
      counts: { waiting: 0, failed: 0 },
      failedOps: [],
      lastSummary: null,
      session: null,
      syncNow: async () => ({ synced: 0, waiting: 0, failed: 0 }),
      runCloudWrite: async ({ mutate, op }) => mutate(op),
      summaryLabel: 'Synced',
    }
  )
}
