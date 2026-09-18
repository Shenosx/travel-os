import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button.jsx'
import { Card } from '../components/ui/Card.jsx'
import { useAppData } from '../hooks/useAppData.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { findJoinTarget, isOpenInvitation } from '../lib/collaboration.js'
import { formatDateRange } from '../lib/dates.js'
import { ROLE_LABEL } from '../lib/people.js'
import { getSupabaseClient } from '../lib/supabase/client.js'
import {
  acceptCloudInvitation,
  accountPathForJoin,
  getCloudTripIdentity,
} from '../lib/trips/invitations.js'

export function JoinTripPage() {
  const { inviteCode, inviteToken } = useParams()
  const { allTrips, allInvitations, currentUser, joinByToken } = useAppData()
  const found = findJoinTarget(allTrips, allInvitations, inviteCode, inviteToken)

  if (found.ok) {
    return (
      <LocalJoinCard
        trip={found.trip}
        invitation={found.invitation}
        currentUser={currentUser}
        inviteCode={inviteCode}
        inviteToken={inviteToken}
        joinByToken={joinByToken}
      />
    )
  }

  return <CloudJoinCard />
}

function LocalJoinCard({ trip, invitation, currentUser, inviteCode, inviteToken, joinByToken }) {
  const navigate = useNavigate()
  const alreadyMember = trip.members.some((member) => member.userId === currentUser.id)

  if (invitation.status === 'joined' && alreadyMember) {
    return <Navigate to={`/trips/${trip.id}`} replace />
  }

  if (!isOpenInvitation(invitation)) {
    return (
      <div className="mx-auto max-w-[420px] py-10">
        <Link to="/trips" className="text-[13px] text-ink-subtle hover:text-ink">
          ← Trips
        </Link>
        <Card className="mt-6 p-6 sm:p-8">
          <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Invite</p>
          <h1 className="font-display mt-3 text-[32px] leading-tight tracking-[-0.04em]">
            This invite was already used
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {trip.city} is already on someone’s list.
          </p>
        </Card>
      </div>
    )
  }

  const joiningAsSelf = currentUser.email.toLowerCase() === invitation.email
  const guestName = invitation.name || invitation.email

  function join() {
    const result = joinByToken(inviteCode, inviteToken)
    if (result?.ok) navigate(`/trips/${trip.id}`, { replace: true })
  }

  return (
    <div className="mx-auto max-w-[420px] py-10">
      <Link to="/trips" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trips
      </Link>
      <Card className="mt-6 p-6 sm:p-8">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">You’re invited</p>
        <h1 className="font-display mt-3 text-[36px] leading-tight tracking-[-0.04em]">{trip.city}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {joiningAsSelf
            ? `Join this trip as ${invitation.role === 'editor' ? 'an editor' : 'a viewer'}.`
            : `Continue as ${guestName} to join this trip as ${ROLE_LABEL[invitation.role]}.`}
        </p>
        <p className="mt-4 text-[13px] text-ink-subtle">
          {trip.country} · {formatDateRange(trip.startDate, trip.endDate)}
        </p>
        <Button className="mt-6 w-full" onClick={join}>
          {joiningAsSelf ? 'Join the trip' : `Join as ${guestName.split(' ')[0]}`}
        </Button>
      </Card>
    </div>
  )
}

function CloudJoinCard() {
  const { inviteToken } = useParams()
  const location = useLocation()
  const { configured, loading, session } = useAuth()
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [trip, setTrip] = useState(null)
  const attempted = useRef('')

  useEffect(() => {
    if (!configured || loading || !session || !inviteToken) return undefined
    if (attempted.current === inviteToken) return undefined
    attempted.current = inviteToken

    let cancelled = false
    setStatus('working')

    const client = getSupabaseClient()
    acceptCloudInvitation({ client, session, rawToken: inviteToken }).then(async (result) => {
      if (cancelled) return
      if (result.error) {
        setStatus('error')
        setMessage(result.error)
        return
      }
      const identity = await getCloudTripIdentity({ client, session, tripId: result.tripId })
      if (cancelled) return
      setTrip(identity.trip)
      setStatus('joined')
    })

    return () => {
      cancelled = true
    }
  }, [configured, inviteToken, loading, session])

  if (!configured) {
    return (
      <JoinFrame
        title="This link has expired"
        body="Ask whoever is organising the trip to send a new one."
      />
    )
  }

  if (loading) {
    return <JoinFrame title="Checking this invite" body="One moment." />
  }

  if (!session) {
    return (
      <JoinFrame
        kicker="Cloud invite"
        title="Sign in to join"
        body="This invitation is for a cloud trip. Sign in with the invited email, then you’ll come back here to join."
        action={
          <Link
            to={accountPathForJoin(location.pathname)}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border border-transparent bg-accent text-sm font-medium text-white hover:bg-accent-hover"
          >
            Continue to account
          </Link>
        }
      />
    )
  }

  if (status === 'working' || status === 'idle') {
    return <JoinFrame title="Joining this trip" body="Accepting the invitation." />
  }

  if (status === 'joined') {
    return (
      <JoinFrame
        kicker="Cloud"
        title={trip?.city || "You're on this trip"}
        body={
          trip
            ? `${trip.country} · ${formatDateRange(trip.startDate, trip.endDate)}. It’s a cloud trip, so it stays off this device’s local list.`
            : 'This cloud trip is now on your account. Local trips on this device are unchanged.'
        }
        action={
          <Link
            to="/trips"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border border-transparent bg-accent text-sm font-medium text-white hover:bg-accent-hover"
          >
            See trips
          </Link>
        }
      />
    )
  }

  return <JoinFrame title="This invite could not be used" body={message} />
}

function JoinFrame({ kicker = 'Invite', title, body, action }) {
  return (
    <div className="mx-auto max-w-[420px] py-10">
      <Link to="/trips" className="text-[13px] text-ink-subtle hover:text-ink">
        ← Trips
      </Link>
      <Card className="mt-6 p-6 sm:p-8">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">{kicker}</p>
        <h1 className="font-display mt-3 text-[32px] leading-tight tracking-[-0.04em]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">{body}</p>
        {action}
      </Card>
    </div>
  )
}
