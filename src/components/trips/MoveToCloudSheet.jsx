import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useCloudTrips } from '../../hooks/useCloudTrips.js'
import { getSupabaseClient } from '../../lib/supabase/client.js'
import { buildMigrationPlan } from '../../lib/migration/plan.js'
import { runMigration } from '../../lib/migration/execute.js'
import { createTripMigration } from '../../lib/migration/mappings.js'
import { formatMigrationReport } from '../../lib/migration/report.js'
import { SYNC_FIRST_MESSAGE } from '../../lib/migration/types.js'
import { getCloudTripMembers } from '../../lib/trips/members.js'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'

const STEPS = ['preview', 'destination', 'identity', 'confirm', 'progress', 'report']

export function MoveToCloudSheet({
  trip,
  places,
  bookings,
  expenses,
  itinerary,
  polls,
  invitations,
  activities,
  users,
  pendingOps,
  existingMigration,
  onPersist,
  onClose,
}) {
  const { session, user, configured } = useAuth()
  const cloud = useCloudTrips()
  const [step, setStep] = useState('preview')
  const [path, setPath] = useState(existingMigration?.path ?? '')
  const [selectedTripId, setSelectedTripId] = useState(existingMigration?.cloudTripId ?? '')
  const [identityMappings, setIdentityMappings] = useState(existingMigration?.identityMappings ?? {})
  const [inviteLocalUserIds, setInviteLocalUserIds] = useState([])
  const [members, setMembers] = useState([])
  const [membersError, setMembersError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const started = useRef(false)

  const targetTrip = useMemo(
    () => cloud.trips.find((item) => item.id === selectedTripId) ?? null,
    [cloud.trips, selectedTripId],
  )

  const context = useMemo(
    () => ({
      localTrip: trip,
      path: path || null,
      targetCloudTrip: path === 'associate' ? targetTrip : null,
      currentUser: user ? { id: user.id } : null,
      cloudMembers:
        path === 'create' && user
          ? [{ userId: user.id, role: 'owner', name: 'You' }]
          : members,
      pendingOps,
      localUsers: users,
      places,
      bookings,
      expenses,
      itinerary,
      polls,
      invitations,
      activities,
      identityMappings,
    }),
    [
      trip,
      path,
      targetTrip,
      user,
      members,
      pendingOps,
      users,
      places,
      bookings,
      expenses,
      itinerary,
      polls,
      invitations,
      activities,
      identityMappings,
    ],
  )

  const plan = useMemo(() => buildMigrationPlan(context), [context])
  const report = result?.report ?? formatMigrationReport(existingMigration ?? {}, plan)

  useEffect(() => {
    if (path !== 'associate' || !selectedTripId || !session) {
      if (path === 'create') setMembers(user ? [{ userId: user.id, role: 'owner', name: 'You' }] : [])
      return undefined
    }
    let cancelled = false
    getCloudTripMembers({ client: getSupabaseClient(), session, tripId: selectedTripId }).then((loaded) => {
      if (cancelled) return
      setMembers(loaded.members ?? [])
      setMembersError(loaded.error ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [path, selectedTripId, session, user])

  function setIdentity(localUserId, type, cloudUserId = null) {
    setIdentityMappings((current) => {
      const next = { ...current }
      if (type === 'skip') {
        delete next[localUserId]
        return next
      }
      next[localUserId] = { type, cloudUserId: cloudUserId || '' }
      return next
    })
  }

  async function startMigration() {
    if (!configured || !session || !user || busy || started.current) return
    started.current = true
    setBusy(true)
    setStep('progress')
    try {
      const state =
        existingMigration ??
        createTripMigration({
          localTripId: trip.id,
          cloudTripId: path === 'associate' ? selectedTripId : null,
          path,
          status: 'running',
          identityMappings,
        })
      const next = await runMigration({
        ...context,
        client: getSupabaseClient(),
        session,
        currentUser: { id: user.id },
        identityMappings,
        inviteLocalUserIds,
        state: {
          ...state,
          path,
          identityMappings,
          cloudTripId: path === 'associate' ? selectedTripId : state.cloudTripId,
        },
        persist: onPersist,
      })
      setResult(next)
      setStep('report')
    } catch {
      started.current = false
      setStep('confirm')
    } finally {
      setBusy(false)
    }
  }

  const lockedDestination = Boolean(existingMigration?.mappings?.trip)
  const hardBlocked = plan.status === 'blocked' && plan.blocked.some((item) =>
    ['trip', 'session', 'permissions', 'pendingOps'].includes(item.entity),
  )

  return (
    <Sheet
      kicker="Local → Cloud"
      title={step === 'report' ? report.headline : 'Move to Cloud'}
      onClose={onClose}
      wide
      footer={
        <Footer
          step={step}
          busy={busy}
          path={path}
          selectedTripId={selectedTripId}
          hardBlocked={hardBlocked}
          onBack={() => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)])}
          onNext={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)])}
          onConfirm={startMigration}
          onClose={onClose}
        />
      }
    >
      {step === 'preview' ? (
        <Preview plan={plan} trip={trip} />
      ) : null}
      {step === 'destination' ? (
        <Destination
          path={path}
          selectedTripId={selectedTripId}
          trips={cloud.trips}
          locked={lockedDestination}
          loading={cloud.loading}
          error={cloud.error || membersError}
          onPath={(nextPath) => {
            setPath(nextPath)
            if (nextPath === 'create') setSelectedTripId('')
          }}
          onSelect={setSelectedTripId}
        />
      ) : null}
      {step === 'identity' ? (
        <IdentityStep
          requirements={plan.identityRequirements}
          members={path === 'associate' ? members : []}
          currentUserId={user?.id}
          mappings={identityMappings}
          canInvite={plan.canInvite}
          inviteLocalUserIds={inviteLocalUserIds}
          users={users}
          onMap={setIdentity}
          onToggleInvite={(localUserId, checked) => {
            setInviteLocalUserIds((current) =>
              checked ? [...new Set([...current, localUserId])] : current.filter((id) => id !== localUserId),
            )
          }}
        />
      ) : null}
      {step === 'confirm' ? (
        <Confirm plan={plan} path={path} targetTrip={targetTrip} />
      ) : null}
      {step === 'progress' ? (
        <p className="text-sm leading-relaxed text-ink-muted">
          Moving {trip.city} into Cloud. You can close this and come back — progress is saved on this device.
        </p>
      ) : null}
      {step === 'report' ? <ReportView report={result?.report ?? report} state={result?.state} /> : null}
    </Sheet>
  )
}

function Footer({ step, busy, path, selectedTripId, hardBlocked, onBack, onNext, onConfirm, onClose }) {
  if (step === 'progress') return null
  if (step === 'report') {
    return (
      <div className="flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    )
  }
  const nextDisabled =
    (step === 'destination' && !path) ||
    (step === 'destination' && path === 'associate' && !selectedTripId) ||
    (step === 'confirm' && hardBlocked)
  return (
    <div className="flex items-center justify-between gap-3">
      {step === 'preview' ? (
        <button type="button" className="text-sm text-ink-muted" onClick={onClose}>
          Cancel
        </button>
      ) : (
        <button type="button" className="text-sm text-ink-muted" onClick={onBack}>
          Back
        </button>
      )}
      {step === 'confirm' ? (
        <Button onClick={onConfirm} disabled={busy || nextDisabled}>
          Move to Cloud
        </Button>
      ) : (
        <Button onClick={onNext} disabled={nextDisabled}>
          Continue
        </Button>
      )}
    </div>
  )
}

function Preview({ plan, trip }) {
  const counts = plan.counts
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        Copy {trip.city} into Cloud. The local trip stays on this device. Nothing is matched by name or
        dates — you choose the destination next.
      </p>
      <ul className="space-y-2 text-sm text-ink">
        <Count label="Places" value={counts.places} />
        <Count label="Bookings" value={counts.bookings} />
        <Count label="Days" value={counts.itineraryDays} />
        <Count label="Stops" value={counts.itineraryItems} />
        <Count label="Expenses" value={counts.expenses} />
        <Count label="Polls" value={counts.polls} />
      </ul>
      {plan.skipped.length ? (
        <p className="text-[13px] leading-relaxed text-ink-subtle">
          Booking files and historical activity stay local. They are not uploaded.
        </p>
      ) : null}
    </div>
  )
}

function Count({ label, value }) {
  return (
    <li className="flex justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </li>
  )
}

function Destination({ path, selectedTripId, trips, locked, loading, error, onPath, onSelect }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-muted">
        Choose where these records go. Cloud trips with the same name are not selected for you.
      </p>
      <fieldset className="space-y-3" disabled={locked}>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="radio"
            name="migration-path"
            checked={path === 'create'}
            onChange={() => onPath('create')}
            className="mt-1"
          />
          <span>
            Create new Cloud Trip
            <span className="mt-1 block text-[13px] text-ink-subtle">
              You become the Cloud owner. Local ownership is not transferred.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="radio"
            name="migration-path"
            checked={path === 'associate'}
            onChange={() => onPath('associate')}
            className="mt-1"
          />
          <span>
            Add to an existing Cloud Trip
            <span className="mt-1 block text-[13px] text-ink-subtle">
              The Cloud trip header stays as it is.
            </span>
          </span>
        </label>
      </fieldset>
      {path === 'associate' ? (
        <Field label="Cloud Trip">
          <select
            className={fieldClass}
            value={selectedTripId}
            disabled={locked}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">{loading ? 'Loading…' : 'Select a Cloud Trip'}</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.destination}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {error ? <p className="text-sm text-ink-muted">{error}</p> : null}
    </div>
  )
}

function IdentityStep({
  requirements,
  members,
  currentUserId,
  mappings,
  canInvite,
  inviteLocalUserIds,
  users,
  onMap,
  onToggleInvite,
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ink-muted">
        Say who each local person is. Names and emails are hints only — nothing is selected automatically.
      </p>
      {requirements.map((person) => {
        const mapping = mappings[person.localUserId]
        const choice = mapping?.type === 'self' ? 'self' : mapping?.type === 'member' ? 'member' : 'skip'
        return (
          <div key={person.localUserId} className="border-b border-line pb-4 last:border-0">
            <p className="text-sm text-ink">{person.name}</p>
            {person.email ? <p className="text-[12px] text-ink-subtle">{person.email}</p> : null}
            <fieldset className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={`identity-${person.localUserId}`}
                  checked={choice === 'self'}
                  onChange={() => onMap(person.localUserId, 'self', currentUserId)}
                />
                This is me
              </label>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="radio"
                  className="mt-1"
                  name={`identity-${person.localUserId}`}
                  checked={choice === 'member'}
                  disabled={!members.length}
                  onChange={() => onMap(person.localUserId, 'member', '')}
                />
                <span className="flex-1">
                  Select existing Cloud member
                  {choice === 'member' ? (
                    <select
                      className={`${fieldClass} mt-2`}
                      value={mapping?.cloudUserId ?? ''}
                      onChange={(event) => onMap(person.localUserId, 'member', event.target.value)}
                    >
                      <option value="">Select a member</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name || member.email || member.userId}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={`identity-${person.localUserId}`}
                  checked={choice === 'skip'}
                  onChange={() => onMap(person.localUserId, 'skip')}
                />
                Skip / leave unmapped
              </label>
            </fieldset>
            {canInvite && choice === 'skip' && users.find((item) => item.id === person.localUserId)?.email ? (
              <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={inviteLocalUserIds.includes(person.localUserId)}
                  onChange={(event) => onToggleInvite(person.localUserId, event.target.checked)}
                />
                Invite {person.name} by email. This does not add them to expenses.
              </label>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Confirm({ plan, path, targetTrip }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        {path === 'create'
          ? 'A new Cloud Trip will be created. Local records stay on this device.'
          : `Records will be added to ${targetTrip?.destination || 'the selected Cloud Trip'}. The Cloud header is not overwritten.`}
      </p>
      {plan.blocked.filter((item) => item.entity === 'pendingOps').length ? (
        <p className="text-sm text-ink">{SYNC_FIRST_MESSAGE}</p>
      ) : null}
      {plan.blocked.filter((item) => item.entity === 'expense').length ? (
        <ul className="space-y-2 text-sm text-ink-muted">
          {plan.blocked
            .filter((item) => item.entity === 'expense')
            .map((item) => (
              <li key={item.localId}>{item.reason}</li>
            ))}
        </ul>
      ) : null}
      {plan.warnings.map((warning) => (
        <p key={warning} className="text-[13px] text-ink-subtle">
          {warning}
        </p>
      ))}
    </div>
  )
}

function ReportView({ report }) {
  return (
    <div className="space-y-5">
      {report.createdLines.length ? (
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Created</p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {report.createdLines.map((line) => (
              <li key={line}>✓ {line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.skipped.length ? (
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Skipped</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {report.skipped.map((item) => (
              <li key={`${item.entity}-${item.localId}-${item.reason}`}>• {item.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.blocked.length ? (
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Blocked</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {report.blocked.map((item) => (
              <li key={`${item.entity}-${item.localId}-${item.reason}`}>• {item.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.errors.length ? (
        <div>
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Errors</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {report.errors.map((item) => (
              <li key={item.reason}>{item.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
