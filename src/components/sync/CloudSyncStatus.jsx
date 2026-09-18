import { useState } from 'react'
import { useCloudSync } from '../../hooks/useCloudSync.jsx'

export function CloudSyncStatus() {
  const { status, syncing, online, session, counts, failedOps, syncNow, lastSummary } = useCloudSync()
  const [open, setOpen] = useState(false)
  const showManual = online && Boolean(session?.user) && !syncing && counts.waiting > 0

  return (
    <div className="relative">
      <button
        type="button"
        className="text-left text-[12px] text-ink-subtle hover:text-ink"
        onClick={() => setOpen((current) => !current)}
      >
        {status}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[240px] rounded-md border border-line bg-canvas p-3 shadow-sm">
          <p className="text-[12px] text-ink-muted">{status}</p>
          {lastSummary?.message ? <p className="mt-1 text-[12px] text-ink-subtle">{lastSummary.message}</p> : null}
          {failedOps.length ? (
            <ul className="mt-2 space-y-1">
              {failedOps.map((item, index) => (
                <li key={`${item.entity}-${item.createdAt}-${index}`} className="text-[12px] text-ink-muted">
                  {item.entity} {item.action}
                  {item.error ? ` — ${item.error}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        {showManual ? (
            <button
              type="button"
              className="mt-2 text-[12px] text-accent disabled:text-ink-subtle"
              disabled={syncing || !online}
              onClick={() => {
                if (!online || syncing) return
                syncNow('manual')
              }}
            >
              Sync now
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
