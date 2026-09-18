import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  addWeeks,
  durationDays,
  monthGrid,
  resolveSelectedCalendarDate,
  startOfWeek,
  tripDates,
  tripDayNumber,
  weekDates,
} from './dates.js'

test('trip dates are inclusive and destination-agnostic', () => {
  const trip = { startDate: '2026-12-12', endDate: '2026-12-19' }
  const dates = tripDates(trip)
  assert.equal(dates.length, 8)
  assert.equal(dates[0], '2026-12-12')
  assert.equal(dates.at(-1), '2026-12-19')
  assert.equal(tripDayNumber(trip, '2026-12-13'), 2)
  assert.equal(addDays('2026-12-12', 1), '2026-12-13')
})

test('12–19 Dec durationDays stays 7 while inclusive dates stay 8', () => {
  assert.equal(durationDays('2026-12-12', '2026-12-19'), 7)
  assert.equal(tripDates({ startDate: '2026-12-12', endDate: '2026-12-19' }).length, 8)
  assert.equal(tripDayNumber({ startDate: '2026-12-12', endDate: '2026-12-19' }, '2026-12-14'), 3)
  assert.equal(tripDayNumber({ startDate: '2026-12-12', endDate: '2026-12-19' }, '2026-12-19'), 8)
})

test('month grid includes correct leading and trailing days', () => {
  const cells = monthGrid(2026, 12)
  assert.equal(cells.length % 7, 0)
  assert.equal(cells[0].iso, '2026-11-30')
  assert.equal(cells[0].inMonth, false)
  assert.equal(cells[1].iso, '2026-12-01')
  assert.equal(cells[1].inMonth, true)
  const lastInMonth = cells.findLast((cell) => cell.inMonth)
  assert.equal(lastInMonth.iso, '2026-12-31')
  assert.deepEqual(
    cells.slice(-3).map((cell) => cell.iso),
    ['2027-01-01', '2027-01-02', '2027-01-03'],
  )
  assert.equal(cells.at(-1).inMonth, false)
  const inMonth = cells.filter((cell) => cell.inMonth)
  assert.equal(inMonth.length, 31)
})

test('month grid for a Sunday-start month still pads a Monday-start week', () => {
  const cells = monthGrid(2026, 2)
  assert.equal(cells[0].iso, '2026-01-26')
  assert.equal(cells[6].iso, '2026-02-01')
  assert.equal(cells[6].inMonth, true)
  assert.equal(cells.at(-1).iso, '2026-03-01')
})

test('selected calendar date is deterministic', () => {
  const trip = { startDate: '2026-12-12', endDate: '2026-12-19' }
  assert.equal(resolveSelectedCalendarDate(trip, '2026-12-14', '2026-09-17'), '2026-12-14')
  assert.equal(resolveSelectedCalendarDate(trip, null, '2026-12-15'), '2026-12-15')
  assert.equal(resolveSelectedCalendarDate(trip, 'not-a-date', '2026-12-15'), '2026-12-15')
  assert.equal(resolveSelectedCalendarDate(trip, '', '2026-09-17'), '2026-12-12')
  assert.equal(resolveSelectedCalendarDate(trip, '2026-11-30', '2026-12-15'), '2026-11-30')
})

test('weekDates returns seven Monday-first dates', () => {
  const week = weekDates('2026-12-14')
  assert.equal(week.length, 7)
  assert.equal(startOfWeek('2026-12-14'), '2026-12-14')
  assert.deepEqual(week, [
    '2026-12-14',
    '2026-12-15',
    '2026-12-16',
    '2026-12-17',
    '2026-12-18',
    '2026-12-19',
    '2026-12-20',
  ])
  assert.equal(startOfWeek('2026-12-12'), '2026-12-07')
  assert.equal(weekDates('2026-12-12')[0], '2026-12-07')
  assert.equal(weekDates('2026-12-12')[6], '2026-12-13')
})

test('previous and next week navigation stays Monday-aligned', () => {
  const selected = '2026-12-14'
  assert.equal(addWeeks(selected, 1), '2026-12-21')
  assert.equal(addWeeks(selected, -1), '2026-12-07')
  assert.deepEqual(weekDates(addWeeks(selected, -1)), [
    '2026-12-07',
    '2026-12-08',
    '2026-12-09',
    '2026-12-10',
    '2026-12-11',
    '2026-12-12',
    '2026-12-13',
  ])
  assert.equal(weekDates(addWeeks(selected, 1))[0], '2026-12-21')
  assert.equal(startOfWeek(addWeeks('2026-12-16', 1)), '2026-12-21')
})
