import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatActivity } from './activity.js'
import {
  acceptInvitation,
  acceptInvitationAsInvitee,
  changeMemberRole,
  ensureUserForInvite,
  findJoinTarget,
  inviteLink,
  removeMember,
  upsertInvitation,
  voteOnPoll,
} from './collaboration.js'
import { getExpenseActorIds } from './expenses.js'
import { itineraryAttribution, updateItineraryItemRecord } from './itinerary.js'
import { peopleForTrip } from './people.js'
import { users } from '../data/mock.js'

const vienna = {
  id: 'trip-vienna',
  ownerId: 'user-jamie',
  inviteCode: 'vienna-k7m2',
  visibility: 'shared',
  members: [
    { userId: 'user-jamie', role: 'owner' },
    { userId: 'user-alex', role: 'editor' },
    { userId: 'user-jason', role: 'viewer' },
  ],
}

test('invite creates a pending invitation with a realistic link', () => {
  const result = upsertInvitation({
    trip: vienna,
    users,
    invitations: [],
    actorId: 'user-jamie',
    email: 'maya@example.com',
    role: 'editor',
    status: 'pending',
    token: 'm4y4-vienna-k7n2qp',
  })
  assert.equal(result.ok, true)
  assert.equal(result.invitation.status, 'pending')
  assert.equal(result.invitation.role, 'editor')
  assert.equal(
    inviteLink(vienna, result.invitation),
    'https://travelos.app/join/vienna-k7m2/m4y4-vienna-k7n2qp',
  )
})

test('editors cannot invite people', () => {
  const result = upsertInvitation({
    trip: vienna,
    users,
    invitations: [],
    actorId: 'user-alex',
    email: 'new@example.com',
    role: 'viewer',
  })
  assert.equal(result.ok, false)
})

test('cannot invite someone already on the trip', () => {
  const result = upsertInvitation({
    trip: vienna,
    users,
    invitations: [],
    actorId: 'user-jamie',
    email: 'alex@example.com',
    role: 'viewer',
  })
  assert.equal(result.ok, false)
})

test('accepting a pending invitation adds the member without touching expenses', () => {
  const invitation = {
    id: 'inv-maya',
    tripId: 'trip-vienna',
    email: 'maya@example.com',
    name: 'Maya Chen',
    role: 'editor',
    status: 'pending',
    inviteToken: 'token',
    createdAt: '2026-09-05T09:30:00.000Z',
    invitedBy: 'user-jamie',
  }
  const expenses = [{ id: 'exp-1', tripId: 'trip-vienna', shares: [{ userId: 'user-jason', amount: 10 }] }]
  const result = acceptInvitation({
    trip: vienna,
    invitation,
    users,
    actorId: 'user-maya',
  })
  assert.equal(result.ok, true)
  assert.equal(result.invitation.status, 'joined')
  assert.ok(result.trip.members.some((member) => member.userId === 'user-maya' && member.role === 'editor'))
  assert.equal(expenses.length, 1)
})

test('removing a member keeps historical expense actors in settlement ids', () => {
  const after = removeMember(vienna, 'user-jamie', 'user-jason')
  assert.equal(after.ok, true)
  assert.equal(after.trip.members.some((member) => member.userId === 'user-jason'), false)
  assert.equal(after.trip.members.some((member) => member.userId === 'user-jamie' && member.role === 'owner'), true)

  const expenses = [
    {
      payerId: 'user-jason',
      shares: [
        { userId: 'user-jamie', amount: 40 },
        { userId: 'user-jason', amount: 50 },
      ],
    },
  ]
  const ids = getExpenseActorIds(expenses, after.trip.members.map((member) => member.userId))
  assert.ok(ids.includes('user-jason'))
  assert.ok(ids.includes('user-jamie'))
})

test('cannot remove the owner or leave the trip without an owner', () => {
  assert.equal(removeMember(vienna, 'user-jamie', 'user-jamie').ok, false)
  assert.equal(changeMemberRole(vienna, 'user-jamie', 'user-jamie', 'viewer').ok, false)
})

test('poll voting is one selection per person', () => {
  const poll = {
    id: 'poll-1',
    tripId: 'trip-vienna',
    question: 'Where should we go on Day 4?',
    options: [
      { id: 'a', label: 'Salzburg', voterIds: ['user-alex'] },
      { id: 'b', label: 'Bratislava', voterIds: [] },
      { id: 'c', label: 'Stay in Vienna', voterIds: ['user-jamie'] },
    ],
  }
  const next = voteOnPoll(poll, 'user-jamie', 'a')
  assert.equal(next.ok, true)
  assert.deepEqual(next.poll.options.find((option) => option.id === 'a').voterIds.sort(), ['user-alex', 'user-jamie'])
  assert.deepEqual(next.poll.options.find((option) => option.id === 'c').voterIds, [])
})

test('itinerary attribution stays quiet for the author', () => {
  const item = {
    createdBy: 'user-alex',
    createdAt: '2026-09-02T09:12:00.000Z',
    updatedBy: 'user-jamie',
    updatedAt: '2026-09-04T11:00:00.000Z',
  }
  assert.equal(itineraryAttribution(item, users, 'user-alex'), 'Updated by Jamie')
  assert.equal(itineraryAttribution(item, users, 'user-jamie'), 'Added by Alex')
  assert.equal(itineraryAttribution({ createdBy: 'user-jamie' }, users, 'user-jamie'), null)
  assert.equal(itineraryAttribution({ title: 'Flights' }, users, 'user-jamie'), null)
})

test('joining by token creates a user when needed and adds them as a member', () => {
  const invitation = {
    id: 'inv-new',
    tripId: 'trip-vienna',
    email: 'nina@example.com',
    name: 'Nina Park',
    role: 'viewer',
    status: 'invited',
    inviteToken: 'nina-vienna-token',
    createdAt: '2026-09-07T10:00:00.000Z',
    invitedBy: 'user-jamie',
  }
  const result = acceptInvitationAsInvitee({
    trip: vienna,
    invitation,
    users,
  })
  assert.equal(result.ok, true)
  assert.equal(result.joinedUser.email, 'nina@example.com')
  assert.ok(result.users.some((user) => user.email === 'nina@example.com'))
  assert.ok(result.trip.members.some((member) => member.userId === result.joinedUser.id && member.role === 'viewer'))
})

test('invite link can target the current origin', () => {
  assert.equal(
    inviteLink(vienna, { inviteToken: 'abc' }, 'http://localhost:5173'),
    'http://localhost:5173/join/vienna-k7m2/abc',
  )
})

test('findJoinTarget resolves an open invitation', () => {
  const invitations = [
    {
      id: 'inv-1',
      tripId: 'trip-vienna',
      email: 'maya@example.com',
      inviteToken: 'm4y4-vienna-k7n2qp',
      status: 'pending',
    },
  ]
  const found = findJoinTarget([vienna], invitations, 'vienna-k7m2', 'm4y4-vienna-k7n2qp')
  assert.equal(found.ok, true)
  assert.equal(found.invitation.email, 'maya@example.com')
})

test('new members become expense people; removed members stay on history', () => {
  const expenses = [
    {
      tripId: 'trip-vienna',
      payerId: 'user-jason',
      shares: [
        { userId: 'user-jamie', amount: 40 },
        { userId: 'user-jason', amount: 50 },
      ],
    },
  ]
  const withMaya = {
    ...vienna,
    members: [...vienna.members, { userId: 'user-maya', role: 'editor' }],
  }
  const available = peopleForTrip(withMaya, expenses, users)
  assert.ok(available.some((person) => person.userId === 'user-maya' && !person.former))

  const afterRemove = removeMember(vienna, 'user-jamie', 'user-jason').trip
  const remaining = peopleForTrip(afterRemove, expenses, users)
  const jason = remaining.find((person) => person.userId === 'user-jason')
  assert.equal(jason.former, true)
  assert.ok(remaining.some((person) => person.userId === 'user-jamie' && !person.former))
})

test('updating an itinerary item stores updatedBy without dropping createdBy', () => {
  const itineraries = [
    {
      tripId: 'trip-vienna',
      days: [
        {
          date: '2026-12-12',
          dayNumber: 1,
          title: 'Arrival',
          items: [
            {
              id: 'vie-d1-2',
              title: 'Hotel check-in',
              createdBy: 'user-jamie',
              createdAt: '2026-08-20T10:00:00.000Z',
            },
          ],
        },
      ],
    },
  ]
  const result = updateItineraryItemRecord(
    itineraries,
    'trip-vienna',
    'vie-d1-2',
    { title: 'Hotel Sacher check-in' },
    'user-alex',
    '2026-09-04T11:00:00.000Z',
  )
  assert.equal(result.item.createdBy, 'user-jamie')
  assert.equal(result.item.updatedBy, 'user-alex')
  assert.equal(result.item.title, 'Hotel Sacher check-in')
})

test('activity sentences stay conversational', () => {
  assert.equal(
    formatActivity(
      { actorId: 'user-alex', type: 'itinerary.add', meta: { title: 'Belvedere Palace' } },
      users,
      'user-jamie',
    ),
    'Alex added “Belvedere Palace”',
  )
  assert.equal(
    formatActivity(
      { actorId: 'user-jamie', type: 'expense.add', meta: { title: 'Dinner at Café Central' } },
      users,
      'user-jamie',
    ),
    'You added “Dinner at Café Central”',
  )
  assert.equal(
    formatActivity({ actorId: 'user-jason', type: 'member.join', meta: { name: 'Jason' } }, users, 'user-jamie'),
    'Jason joined the trip',
  )
  assert.equal(
    formatActivity({ actorId: 'user-jason', type: 'member.join', meta: { name: 'Jason' } }, users, 'user-jason'),
    'You joined the trip',
  )
})

test('ensureUserForInvite reuses an existing person', () => {
  const first = ensureUserForInvite(users, 'maya@example.com')
  assert.equal(first.created, false)
  assert.equal(first.user.id, 'user-maya')
  const second = ensureUserForInvite(users, 'guest@example.com', 'Guest Friend')
  assert.equal(second.created, true)
  assert.equal(second.user.name, 'Guest Friend')
})

