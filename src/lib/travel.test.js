import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mockTravelLabel, mockTravelMinutes, schematicPositions, travelBetweenItems } from './travel.js'

const schoenbrunn = { latitude: 48.1849, longitude: 16.3122 }
const belvedere = { latitude: 48.1914, longitude: 16.3807 }

test('mock travel time is approximate and labelled as such', () => {
  const minutes = mockTravelMinutes(schoenbrunn, belvedere)
  assert.equal(typeof minutes, 'number')
  assert.equal(minutes % 5, 0)
  assert.ok(minutes >= 8)
  assert.equal(mockTravelLabel(minutes), `about ${minutes} min`)
  assert.equal(mockTravelMinutes(schoenbrunn, { name: 'no coords' }), null)
})

test('schematic positions work for any destination from lat/lng bounds', () => {
  const places = [
    { id: 'a', latitude: 35.68, longitude: 139.69, status: 'saved' },
    { id: 'b', latitude: 35.67, longitude: 139.7, status: 'planned' },
  ]
  const positions = schematicPositions(places)
  assert.ok(positions.a.mapX >= 10 && positions.a.mapX <= 90)
  assert.ok(positions.b.mapY >= 10 && positions.b.mapY <= 90)
  assert.notEqual(positions.a.mapX, positions.b.mapX)
})

test('travel between itinerary items requires both place locations', () => {
  const places = [
    { id: 'place-a', latitude: 48.1849, longitude: 16.3122 },
    { id: 'place-b', latitude: 48.1914, longitude: 16.3807 },
    { id: 'place-c', name: 'Lunch' },
  ]
  const withPlaces = travelBetweenItems(
    { id: '1', placeId: 'place-a' },
    { id: '2', placeId: 'place-b' },
    places,
  )
  assert.ok(withPlaces.label.startsWith('about '))
  assert.equal(
    travelBetweenItems({ id: '1', placeId: 'place-a' }, { id: '2', placeId: 'place-c' }, places),
    null,
  )
})
