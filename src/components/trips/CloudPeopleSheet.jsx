import { useState } from 'react'
import { ROLE_LABEL } from '../../lib/people.js'
import { isCloudTripOwner } from '../../lib/trips/cloud.js'
import { useCloudTripPeople } from '../../hooks/useCloudTripPeople.js'
import { Avatar } from '../ui/Avatar.jsx'
import { Button } from '../ui/Button.jsx'
import { Sheet } from '../ui/Sheet.jsx'
import { CloudLiveStatus } from './CloudLiveStatus.jsx'
import { CloudInviteSheet } from './CloudInviteSheet.jsx'

const ROLE_NOTE = {
  owner: 'Looks after the trip, people, and budget.',
  editor: 'Can add to the days and the spending.',
  viewer: 'Along for the plan — view only.',
}

const INVITE_STATUS = {
  pending: 'Waiting to join',
  invited: 'Invite link ready',
}

export function CloudPeopleSheet({ trip, currentUserId, onClose }) {
  const people = useCloudTripPeople(trip)
  const [inviteOpen, setInviteOpen] = useState(false)
  const canInvite = isCloudTripOwner(trip, currentUserId)

  return (
    <>
      <Sheet kicker="Cloud" title="People" onClose={onClose} wide>
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {people.loading
                ? 'Loading people…'
                : `${people.members.length} ${people.members.length === 1 ? 'person' : 'people'} on this cloud trip`}
            </p>
            {canInvite ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                Invite people
              </Button>
            ) : null}
          </div>

          {people.error ? <p className="text-sm text-ink-muted">{people.error}</p> : null}
          <CloudLiveStatus error={people.liveError} />

          <ul className="divide-y divide-line">
            {people.members.map((member) => {
              const isOwner = member.role === 'owner'
              const label = member.userId === currentUserId ? 'You' : member.name || member.email
              return (
                <li
                  key={member.userId}
                  className={`py-4 first:pt-0 last:pb-0 ${isOwner ? '-mx-1 rounded-lg bg-accent-soft/45 px-3 sm:-mx-3' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar initials={member.initials || '?'} emphasis={isOwner} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-ink">{label}</p>
                        <span
                          className={`text-[12px] tracking-[0.08em] uppercase ${
                            isOwner ? 'text-accent' : 'text-ink-subtle'
                          }`}
                        >
                          {ROLE_LABEL[member.role] ?? member.role}
                        </span>
                      </div>
                      {member.email ? (
                        <p className="mt-0.5 truncate text-[13px] text-ink-subtle">{member.email}</p>
                      ) : null}
                      <p className="mt-1.5 text-[13px] text-ink-muted">{ROLE_NOTE[member.role]}</p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {people.pending.length ? (
            <div>
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Waiting to join</p>
              <ul className="mt-4 divide-y divide-line">
                {people.pending.map((invitation) => (
                  <PendingCloudInvite
                    key={invitation.id}
                    invitation={invitation}
                    canManage={canInvite}
                    onRevoke={() => people.revoke(invitation.id)}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Sheet>
      {inviteOpen ? (
        <CloudInviteSheet
          onClose={() => setInviteOpen(false)}
          onInvite={people.invite}
        />
      ) : null}
    </>
  )
}

function PendingCloudInvite({ invitation, canManage, onRevoke }) {
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')

  async function withdraw() {
    const result = await onRevoke()
    if (result?.error) {
      setError(result.error)
      setConfirm(false)
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm text-ink">{invitation.invitedName || invitation.email}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-subtle">{invitation.email}</p>
        <p className="mt-1 text-[12px] text-ink-subtle">
          {ROLE_LABEL[invitation.role] ?? invitation.role} · {INVITE_STATUS[invitation.status] ?? invitation.status}
        </p>
        {error ? <p className="mt-1 text-[12px] text-ink-muted">{error}</p> : null}
      </div>
      {canManage ? (
        confirm ? (
          <button type="button" className="text-[13px] text-accent" onClick={withdraw}>
            Withdraw invite?
          </button>
        ) : (
          <button type="button" className="text-[13px] text-ink-subtle" onClick={() => setConfirm(true)}>
            Withdraw
          </button>
        )
      ) : null}
    </li>
  )
}
