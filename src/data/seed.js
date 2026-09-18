import {
  activities,
  bookings,
  expenses,
  invitations,
  itineraries,
  places,
  polls,
  trips,
  users,
} from './mock.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createSeedSnapshot() {
  return {
    users: clone(users),
    trips: clone(trips),
    expenses: clone(expenses),
    itineraries: clone(itineraries),
    places: clone(places),
    bookings: clone(bookings),
    invitations: clone(invitations),
    activities: clone(activities),
    polls: clone(polls),
    pendingOps: [],
    tripMigrations: [],
    packingCategories: [],
    packingItems: [],
    checklistCategories: [],
    checklistItems: [],
    notes: [],
    memories: [],
  }
}
