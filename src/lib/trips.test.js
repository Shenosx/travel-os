import { test } from 'node:test'
import assert from 'node:assert/strict'
import { durationDays, tripDates } from './dates.js'
import {
  describeTripCountdown,
  getCountdown,
  getTripDurationDays,
  getTripStatus,
} from './trips.js'

const vienna = {
  startDate: '2026-12-12',
  endDate: '2026-12-19',
}

test('12–19 Dec duration stays 7 while inclusive dates stay 8', () => {
  assert.equal(durationDays(vienna.startDate, vienna.endDate), 7)
  assert.equal(getTripDurationDays(vienna), 7)
  assert.equal(tripDates(vienna).length, 8)
  assert.equal(describeTripCountdown(vienna, '2026-12-19').label, 'Day 8 of 8')
})

test('trip status is unchanged: before, during, and after the dates', () => {
  assert.equal(getTripStatus(vienna, parseIsoAsDate('2026-12-01')), 'upcoming')
  assert.equal(getTripStatus(vienna, parseIsoAsDate('2026-12-12')), 'ongoing')
  assert.equal(getTripStatus(vienna, parseIsoAsDate('2026-12-14')), 'ongoing')
  assert.equal(getTripStatus(vienna, parseIsoAsDate('2026-12-19')), 'ongoing')
  assert.equal(getTripStatus(vienna, parseIsoAsDate('2026-12-20')), 'completed')
})

test('upcoming trip before the start date', () => {
  const result = describeTripCountdown(vienna, '2026-12-01')
  assert.equal(result.status, 'upcoming')
  assert.equal(result.value, 11)
  assert.equal(result.label, '11 days to go')
})

test('one day before the trip is 1 day to go', () => {
  const result = describeTripCountdown(vienna, '2026-12-11')
  assert.equal(result.status, 'upcoming')
  assert.equal(result.value, 1)
  assert.equal(result.label, '1 day to go')
})

test('start date is ongoing Day 1 of inclusive length', () => {
  const result = describeTripCountdown(vienna, '2026-12-12')
  assert.equal(result.status, 'ongoing')
  assert.equal(result.value, 1)
  assert.equal(result.label, 'Day 1 of 8')
})

test('middle of the trip is the correct Day N of M', () => {
  const result = describeTripCountdown(vienna, '2026-12-14')
  assert.equal(result.status, 'ongoing')
  assert.equal(result.value, 3)
  assert.equal(result.label, 'Day 3 of 8')
})

test('final trip date is Day M of M', () => {
  const result = describeTripCountdown(vienna, '2026-12-19')
  assert.equal(result.status, 'ongoing')
  assert.equal(result.value, 8)
  assert.equal(result.label, 'Day 8 of 8')
})

test('after the end date is Trip completed', () => {
  const result = describeTripCountdown(vienna, '2026-12-20')
  assert.equal(result.status, 'completed')
  assert.equal(result.value, null)
  assert.equal(result.label, 'Trip completed')
})

test('today argument is deterministic as an ISO date or Date', () => {
  const fromString = describeTripCountdown(vienna, '2026-09-17')
  const fromDate = describeTripCountdown(vienna, parseIsoAsDate('2026-09-17'))
  assert.deepEqual(fromString, fromDate)
  assert.equal(fromString.status, 'upcoming')
  assert.equal(fromString.label, '86 days to go')
  assert.equal(fromString.value, 86)
})

test('legacy getCountdown numeric helper is unchanged', () => {
  assert.equal(getCountdown(vienna, parseIsoAsDate('2026-09-17')), 86)
  assert.equal(getCountdown(vienna, parseIsoAsDate('2026-12-14')), 0)
  assert.equal(getCountdown(vienna, parseIsoAsDate('2026-12-20')), -1)
})

function parseIsoAsDate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}
