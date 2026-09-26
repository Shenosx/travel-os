import { useEffect, useState } from 'react'
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
  acceptSharedCloudInvite,
  accountPathForJoin,
  cloudTripWorkspacePath,
  getVisibleCloudTripByInviteCode,
  looksLikeCloudInviteToken,
  prefersCloudJoin,
} from '../lib/trips/invitations.js'

export function JoinTripPage() {
  const { inviteCode, inviteToken } = useParams()
  const { configured, loading, session } = useAuth()
  const { allTrips, allInvitations, currentUser, joinByToken } = useAppData()
  const local = findJoinTarget(allTrips, allInvitations, inviteCode, inviteToken)
  const cloudToken = looksLikeCloudInviteToken(inviteToken)

  if (loading) {
    return <JoinFrame title="Checking this invite" body="One moment." />
  }

  if (configured && !session) {
    return <CloudSignInCard />
  }

  if (prefersCloudJoin({ configured, session }) && (cloudToken || !local.ok)) {
    return (
      <CloudJoinCard
        inviteCode={inviteCode}
        inviteToken={inviteToken}
        localFallback={local.ok && !cloudToken ? local : null}
        currentUser={currentUser}
        joinByToken={joinByToken}
      />
    )
  }

  if (local.ok) {
    return (
      <LocalJoinCard
        trip={local.trip}
        invitation={local.invitation}
        currentUser={currentUser}
        inviteCode={inviteCode}
        inviteToken={inviteToken}
        joinByToken={joinByToken}
      />
    )
  }

  return (
    <JoinFrame
      title="This link has expired"
      body="Ask whoever is organising the trip to send a new one."
    />
  )
}

function LocalJoinCard({ trip, invitation, currentUser, inviteCode, inviteToken, joinByToken }) {
  const navigate = useNavigate()
  const alreadyMember = trip.members.some((member) => member.userId === currentUser.id)

  if (invitation.status === 'joined' && alreadyMember) {
    return <Navigate to={`/trips/${trip.id}`} replace />
  }

  if (!isOpenInvitation(invitation)) {
    return (
      <JoinFrame
        title="This invite was already used"
        body={`${trip.city} is already on someone’s list.`}
      />
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

function CloudSignInCard() {
  const location = useLocation()
  return (
    <JoinFrame
      kicker="Cloud invite"
      title="Sign in to join"
      body="This invitation is for a shared trip. Sign in with the invited email, then you’ll come back here to join."
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

function CloudJoinCard({ inviteCode, inviteToken, localFallback, currentUser, joinByToken }) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [status, setStatus] = useState('ready')
  const [message, setMessage] = useState('')
  const [trip, setTrip] = useState(null)
  const [useLocal, setUseLocal] = useState(false)

  useEffect(() => {
    if (!session || !inviteCode) return undefined

    let cancelled = false
    const client = getSupabaseClient()
    getVisibleCloudTripByInviteCode({ client, session, inviteCode }).then((result) => {
      if (cancelled || !result.trip) return
      navigate(cloudTripWorkspacePath(result.trip.id), { replace: true })
    })

    return () => {
      cancelled = true
    }
  }, [inviteCode, navigate, session])

  if (useLocal && localFallback) {
    return (
      <LocalJoinCard
        trip={localFallback.trip}
        invitation={localFallback.invitation}
        currentUser={currentUser}
        inviteCode={inviteCode}
        inviteToken={inviteToken}
        joinByToken={joinByToken}
      />
    )
  }

  async function accept() {
    setStatus('working')
    setMessage('')
    const result = await acceptSharedCloudInvite({
      client: getSupabaseClient(),
      session,
      rawToken: inviteToken,
      inviteCode,
    })
    if (result.diagnostic) {
      console.info('[join accept]', result.diagnostic)
    }
    if (result.error) {
      if (localFallback) {
        setUseLocal(true)
        return
      }
      setStatus('error')
      setMessage(result.error)
      return
    }
    setTrip(result.trip)
    setStatus('joined')
    navigate(result.path || '/trips', { replace: true })
  }

  if (status === 'working') {
    return <JoinFrame title="Joining this trip" body="Accepting the invitation." />
  }

  if (status === 'joined') {
    return (
      <JoinFrame
        kicker="Cloud"
        title={trip?.city || "You're on this trip"}
        body={
          trip
            ? `${trip.country} · ${formatDateRange(trip.startDate, trip.endDate)}. This shared trip stays on your account.`
            : 'This shared trip is now on your account. Local trips on this device are unchanged.'
        }
      />
    )
  }

  if (status === 'error') {
    return <JoinFrame title="This invite could not be used" body={message} />
  }

  return (
    <JoinFrame
      kicker="Cloud invite"
      title="You’re invited"
      body="Accept to join this shared trip with the account you just signed in. It will appear in your Cloud trips — not as a copy of someone else’s local list."
      action={
        <Button className="mt-6 w-full" onClick={accept}>
          Join the trip
        </Button>
      }
    />
  )
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
