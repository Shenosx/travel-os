import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { displayName } from '../../data/mock.js'
import { liveInviteLink, openInvitationsForTrip } from '../../lib/collaboration.js'
import { canChangeMemberRole, canRemoveMember } from '../../lib/permissions.js'
import { ROLE_LABEL } from '../../lib/people.js'
import { CURRENT_USER_ID } from '../../data/mock.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { IconCopy } from '../icons.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Button } from '../ui/Button.jsx'
import { Card } from '../ui/Card.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { ActivityFeed } from './ActivityFeed.jsx'

const ROLE_NOTE = {
  owner: 'Looks after the trip, people, and budget.',
  editor: 'Can add to the days and the spending.',
  viewer: 'Along for the plan — view only.',
}

const INVITE_STATUS = {
  pending: 'Waiting to join',
  invited: 'Invite link ready',
}

export function PeoplePanel({ trip, members, currentUserId }) {
  const {
    users,
    invitations,
    activities,
    permissionsFor,
    inviteMember,
    withdrawInvitation,
    updateMemberRole,
    removeMember,
    deleteTrip,
    setSessionUserId,
    isPreviewing,
    homeUserId,
  } = useAppData()
  const navigate = useNavigate()
  const permissions = permissionsFor(trip)
  const pending = openInvitationsForTrip(invitations, trip.id)
  const tripActivities = activities
    .filter((activity) => activity.tripId === trip.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState(false)

  const previewPeople = previewCast(trip, members, pending, users)

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Travelling together</p>
              <p className="mt-2 text-sm text-ink-muted">
                {members.length} {members.length === 1 ? 'person' : 'people'} on this trip
              </p>
            </div>
            {permissions.canInvite ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                Invite people
              </Button>
            ) : null}
          </div>

          <ul className="mt-6 divide-y divide-line">
            {members.map((member) => {
              const isOwner = member.role === 'owner'
              const canEditRole = canChangeMemberRole(trip, currentUserId, member.userId, 'viewer')
              const canRemove = canRemoveMember(trip, currentUserId, member.userId)

              return (
                <li
                  key={member.userId}
                  className={`py-4 first:pt-0 last:pb-0 ${isOwner ? '-mx-1 rounded-lg bg-accent-soft/45 px-3 sm:-mx-3' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar initials={member.user.initials} emphasis={isOwner} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-ink">
                          {displayName(member.user, currentUserId)}
                        </p>
                        <span
                          className={`text-[12px] tracking-[0.08em] uppercase ${
                            isOwner ? 'text-accent' : 'text-ink-subtle'
                          }`}
                        >
                          {ROLE_LABEL[member.role]}
                        </span>
                      </div>
                      {member.user.email ? (
                        <p className="mt-0.5 truncate text-[13px] text-ink-subtle">{member.user.email}</p>
                      ) : null}
                      <p className="mt-1.5 text-[13px] text-ink-muted">{ROLE_NOTE[member.role]}</p>

                      {canEditRole || canRemove ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {canEditRole ? (
                            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                              <span className="sr-only">Role for {member.user.name}</span>
                              <select
                                className="h-8 rounded-md border border-line bg-canvas px-2 text-[13px] text-ink"
                                value={member.role}
                                onChange={(event) =>
                                  updateMemberRole(trip.id, member.userId, event.target.value)
                                }
                              >
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                              </select>
                            </label>
                          ) : null}
                          {canRemove ? (
                            removingId === member.userId ? (
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  className="text-[13px] text-accent"
                                  onClick={() => {
                                    removeMember(trip.id, member.userId)
                                    setRemovingId(null)
                                  }}
                                >
                                  Remove from this trip?
                                </button>
                                <button
                                  type="button"
                                  className="text-[13px] text-ink-subtle"
                                  onClick={() => setRemovingId(null)}
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="text-[13px] text-ink-subtle hover:text-ink"
                                onClick={() => setRemovingId(member.userId)}
                              >
                                Remove
                              </button>
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {members.length === 1 && !pending.length ? (
            <div className="mt-6 border-t border-line pt-6 text-center">
              <p className="text-sm text-ink-muted">No one else on this trip yet</p>
              <p className="mt-1 text-[13px] text-ink-subtle">
                Invite someone to share the days, places, and spending.
              </p>
              {permissions.canInvite ? (
                <button type="button" className="mt-4 text-sm text-accent" onClick={() => setInviteOpen(true)}>
                  Invite people
                </button>
              ) : null}
            </div>
          ) : null}
        </Card>

        {pending.length ? (
          <Card className="p-6">
            <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Waiting to join</p>
            <ul className="mt-5 divide-y divide-line">
              {pending.map((invitation) => (
                <PendingInviteRow
                  key={invitation.id}
                  invitation={invitation}
                  trip={trip}
                  canManage={permissions.canInvite}
                  onWithdraw={() => withdrawInvitation(invitation.id)}
                />
              ))}
            </ul>
          </Card>
        ) : null}

        <ActivityFeed activities={tripActivities} users={users} currentUserId={currentUserId} />

        {permissions.canDeleteTrip ? (
          <div className="px-1">
            {confirmDeleteTrip ? (
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  className="text-[13px] text-accent"
                  onClick={() => {
                    if (deleteTrip(trip.id)) navigate('/trips')
                  }}
                >
                  Remove {trip.city} from your trips?
                </button>
                <button
                  type="button"
                  className="text-[13px] text-ink-subtle"
                  onClick={() => setConfirmDeleteTrip(false)}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-[13px] text-ink-subtle hover:text-ink"
                onClick={() => setConfirmDeleteTrip(true)}
              >
                Delete this trip
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">How sharing works</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            One owner, a few editors, and anyone else along for the view. Expenses stay with the people who
            were there, even if someone later leaves the trip.
          </p>
        </Card>

        <Card className="p-6">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Preview</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            See this trip as someone else. Nothing is sent; it only changes what you can do on this device.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {previewPeople.map((person) => {
              const selected = person.id === currentUserId
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSessionUserId(person.id)}
                  className={`rounded-md px-2.5 py-1.5 text-[13px] ${
                    selected ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas-muted'
                  }`}
                >
                  {person.id === homeUserId ? 'You' : person.shortName}
                </button>
              )
            })}
          </div>
          {isPreviewing ? (
            <button
              type="button"
              className="mt-4 text-[13px] text-accent"
              onClick={() => setSessionUserId(CURRENT_USER_ID)}
            >
              Back to you
            </button>
          ) : null}
        </Card>
      </div>

      {inviteOpen ? (
        <InviteSheet trip={trip} onClose={() => setInviteOpen(false)} onInvite={inviteMember} />
      ) : null}
    </div>
  )
}

function PendingInviteRow({ invitation, trip, canManage, onWithdraw }) {
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const link = liveInviteLink(trip, invitation)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm text-ink">{invitation.name || invitation.email}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-subtle">{invitation.email}</p>
        <p className="mt-1 text-[12px] text-ink-subtle">
          {ROLE_LABEL[invitation.role]} · {INVITE_STATUS[invitation.status] ?? invitation.status}
        </p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-3">
          <button type="button" className="text-[13px] text-ink-muted hover:text-ink" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {confirm ? (
            <button type="button" className="text-[13px] text-accent" onClick={onWithdraw}>
              Withdraw invite?
            </button>
          ) : (
            <button type="button" className="text-[13px] text-ink-subtle" onClick={() => setConfirm(true)}>
              Withdraw
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}

function InviteSheet({ trip, onClose, onInvite }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)
  const [copied, setCopied] = useState(false)

  function send(status) {
    const result = onInvite(trip.id, { email, role, status })
    if (!result?.ok) {
      setError(result?.reason || 'Could not create the invite.')
      setSent(null)
      return null
    }
    setError('')
    setSent(result)
    return result
  }

  async function copyLink() {
    const result = sent ?? send('invited')
    if (!result?.link) return
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Sheet kicker="People" title="Invite someone" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          They’ll be able to open the trip with this link. Nothing is emailed yet.
        </p>
        <Field label="Email">
          <input
            className={fieldClass}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setError('')
              setSent(null)
            }}
            placeholder="alex@email.com"
            autoFocus
          />
        </Field>
        <div>
          <p className="mb-2 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Role</p>
          <div className="grid grid-cols-2 gap-2">
            {['editor', 'viewer'].map((id) => {
              const selected = role === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setRole(id)
                    setSent(null)
                  }}
                  className={`rounded-md border px-3 py-3 text-left ${
                    selected ? 'border-transparent bg-accent-soft text-accent' : 'border-line text-ink-muted'
                  }`}
                >
                  <span className="block text-sm font-medium">{ROLE_LABEL[id]}</span>
                  <span className="mt-1 block text-[12px] text-ink-subtle">{ROLE_NOTE[id]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {error ? <p className="text-sm text-accent">{error}</p> : null}
        {sent ? (
          <div className="rounded-md bg-canvas-muted px-3 py-3">
            <p className="text-sm text-ink">Invite ready for {sent.invitation.name}.</p>
            <p className="mt-1 truncate text-[12px] text-ink-subtle">{sent.link}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button type="button" className="text-sm text-ink-muted" onClick={copyLink}>
            <span className="inline-flex items-center gap-1.5">
              <IconCopy className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy invite link'}
            </span>
          </button>
          <Button
            onClick={() => {
              send('pending')
            }}
          >
            Send invitation
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function previewCast(trip, members, pending, users) {
  const seen = new Set()
  const list = []
  for (const member of members) {
    if (seen.has(member.userId)) continue
    seen.add(member.userId)
    list.push(member.user)
  }
  for (const invitation of pending) {
    const user = users.find((item) => item.email.toLowerCase() === invitation.email)
    if (!user || seen.has(user.id)) continue
    seen.add(user.id)
    list.push(user)
  }
  if (!seen.has(CURRENT_USER_ID)) {
    const home = users.find((user) => user.id === CURRENT_USER_ID)
    if (home) list.unshift(home)
  }
  return list
}
