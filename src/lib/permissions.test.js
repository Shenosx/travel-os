import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  can,
  canChangeMemberRole,
  canDeleteBooking,
  canDeleteExpense,
  canDeletePlace,
  canEditBooking,
  canEditExpense,
  canEditPlace,
  canOnTrip,
  canRemoveMember,
  getMemberRole,
  getTripPermissions,
} from './permissions.js'

const vienna = {
  id: 'trip-vienna',
  ownerId: 'user-jamie',
  members: [
    { userId: 'user-jamie', role: 'owner' },
    { userId: 'user-alex', role: 'editor' },
    { userId: 'user-jason', role: 'viewer' },
  ],
}

const alexHotel = { id: 'exp-hotel', createdBy: 'user-alex', payerId: 'user-alex' }
const jamieFlights = { id: 'exp-flights', createdBy: 'user-jamie', payerId: 'user-jamie' }
const alexPlace = { id: 'place-belvedere', createdBy: 'user-alex' }
const jamiePlace = { id: 'place-sacher', createdBy: 'user-jamie' }
const alexBooking = { id: 'book-ticket', createdBy: 'user-alex' }
const jamieBooking = { id: 'book-flight', createdBy: 'user-jamie' }

test('owner has full trip and member permissions', () => {
  const permissions = getTripPermissions(vienna, 'user-jamie')
  assert.equal(permissions.role, 'owner')
  assert.equal(canOnTrip(vienna, 'user-jamie', 'deleteTrip'), true)
  assert.equal(canOnTrip(vienna, 'user-jamie', 'inviteMembers'), true)
  assert.equal(canOnTrip(vienna, 'user-jamie', 'manageMembers'), true)
  assert.equal(canEditExpense(vienna, 'user-jamie', alexHotel), true)
  assert.equal(canDeleteExpense(vienna, 'user-jamie', alexHotel), true)
})

test('editor can edit itinerary and own expenses, not members', () => {
  assert.equal(canOnTrip(vienna, 'user-alex', 'editItinerary'), true)
  assert.equal(canOnTrip(vienna, 'user-alex', 'addExpense'), true)
  assert.equal(canOnTrip(vienna, 'user-alex', 'inviteMembers'), false)
  assert.equal(canOnTrip(vienna, 'user-alex', 'manageMembers'), false)
  assert.equal(canEditExpense(vienna, 'user-alex', alexHotel), true)
  assert.equal(canEditExpense(vienna, 'user-alex', jamieFlights), false)
  assert.equal(canDeleteExpense(vienna, 'user-alex', jamieFlights), false)
})

test('viewer is read-only', () => {
  assert.equal(canOnTrip(vienna, 'user-jason', 'viewTrip'), true)
  assert.equal(canOnTrip(vienna, 'user-jason', 'viewMembers'), true)
  assert.equal(canOnTrip(vienna, 'user-jason', 'editItinerary'), false)
  assert.equal(canOnTrip(vienna, 'user-jason', 'addExpense'), false)
  assert.equal(canOnTrip(vienna, 'user-jason', 'addPlace'), false)
  assert.equal(canOnTrip(vienna, 'user-jason', 'addBooking'), false)
  assert.equal(canEditPlace(vienna, 'user-jason', alexPlace), false)
  assert.equal(canEditBooking(vienna, 'user-jason', alexBooking), false)
  assert.equal(canEditExpense(vienna, 'user-jason', alexHotel), false)
  assert.equal(can(getMemberRole(vienna, 'user-jason'), 'deleteTrip'), false)
})

test('editor can edit places and bookings, and delete only their own', () => {
  assert.equal(canOnTrip(vienna, 'user-alex', 'addPlace'), true)
  assert.equal(canOnTrip(vienna, 'user-alex', 'addBooking'), true)
  assert.equal(canEditPlace(vienna, 'user-alex', jamiePlace), true)
  assert.equal(canEditBooking(vienna, 'user-alex', jamieBooking), true)
  assert.equal(canDeletePlace(vienna, 'user-alex', alexPlace), true)
  assert.equal(canDeletePlace(vienna, 'user-alex', jamiePlace), false)
  assert.equal(canDeleteBooking(vienna, 'user-alex', alexBooking), true)
  assert.equal(canDeleteBooking(vienna, 'user-alex', jamieBooking), false)
  assert.equal(canDeletePlace(vienna, 'user-jamie', alexPlace), true)
  assert.equal(canDeleteBooking(vienna, 'user-jamie', alexBooking), true)
})

test('owner cannot be removed or demoted', () => {
  assert.equal(canRemoveMember(vienna, 'user-jamie', 'user-jamie'), false)
  assert.equal(canChangeMemberRole(vienna, 'user-jamie', 'user-jamie', 'viewer'), false)
  assert.equal(canChangeMemberRole(vienna, 'user-jamie', 'user-alex', 'owner'), false)
  assert.equal(canChangeMemberRole(vienna, 'user-jamie', 'user-alex', 'viewer'), true)
  assert.equal(canRemoveMember(vienna, 'user-jamie', 'user-jason'), true)
  assert.equal(canRemoveMember(vienna, 'user-alex', 'user-jason'), false)
})
