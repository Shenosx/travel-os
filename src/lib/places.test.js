import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trips } from '../data/mock.js'
import {
  filterPlaces,
  itineraryItemForPlace,
  markPlaceVisited,
  placeSchedule,
} from './places.js'

const vienna = trips.find((trip) => trip.id === 'trip-vienna')

const schoenbrunn = {
  id: 'place-schoenbrunn',
  tripId: 'trip-vienna',
  name: 'Schönbrunn Palace',
  category: 'Sight',
  status: 'planned',
  plannedDay: '2026-12-13',
  createdBy: 'user-alex',
}

const figlmueller = {
  id: 'place-figlmueller',
  tripId: 'trip-vienna',
  name: 'Figlmüller',
  category: 'Food',
  status: 'saved',
}

const itinerary = {
  tripId: 'trip-vienna',
  days: [
    {
      date: '2026-12-13',
      dayNumber: 2,
      title: 'Imperial Vienna',
      items: [{ id: 'vie-d2-1', time: '09:30', title: 'Schönbrunn Palace', placeId: 'place-schoenbrunn' }],
    },
  ],
}

test('filters places by status without assuming a destination', () => {
  const places = [schoenbrunn, figlmueller]
  assert.equal(filterPlaces(places, 'all').length, 2)
  assert.deepEqual(
    filterPlaces(places, 'saved').map((place) => place.id),
    ['place-figlmueller'],
  )
  assert.deepEqual(
    filterPlaces(places, 'planned').map((place) => place.id),
    ['place-schoenbrunn'],
  )
})

test('place schedule reads planned day and time from the itinerary reference', () => {
  const schedule = placeSchedule(schoenbrunn, itinerary, vienna)
  assert.equal(schedule.dayNumber, 2)
  assert.equal(schedule.time, '09:30')
  assert.equal(schedule.item.id, 'vie-d2-1')
  assert.equal(itineraryItemForPlace(itinerary, 'place-schoenbrunn').item.placeId, 'place-schoenbrunn')
})

test('marking a place visited preserves its planned day', () => {
  const visited = markPlaceVisited(schoenbrunn)
  assert.equal(visited.status, 'visited')
  assert.equal(visited.plannedDay, '2026-12-13')
})
