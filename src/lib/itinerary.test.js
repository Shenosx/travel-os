import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripDates } from './dates.js'
import {
  calendarItemSelection,
  clearItineraryRefs,
  flattenItineraryItems,
  indexItineraryItemsByDate,
  itineraryDaysForWeek,
  itinerarySearchParams,
  itinerarySliceForDate,
  moveItineraryItemRecord,
  resolveCalendarAddDate,
  switchItineraryView,
  updateItineraryItemRecord,
} from './itinerary.js'

const seed = [
  {
    tripId: 'trip-vienna',
    days: [
      {
        date: '2026-12-13',
        dayNumber: 2,
        title: 'Imperial Vienna',
        items: [{ id: 'vie-d2-1', title: 'Schönbrunn Palace', placeId: 'place-schoenbrunn' }],
      },
      {
        date: '2026-12-14',
        dayNumber: 3,
        title: 'Old town',
        items: [{ id: 'vie-d3-1', title: 'Cathedral' }],
      },
    ],
  },
]

test('moving an itinerary item keeps the place reference', () => {
  const result = moveItineraryItemRecord(seed, 'trip-vienna', 'vie-d2-1', '2026-12-14')
  const day2 = result.itineraries[0].days.find((day) => day.date === '2026-12-13')
  const day3 = result.itineraries[0].days.find((day) => day.date === '2026-12-14')
  assert.equal(day2.items.length, 0)
  assert.equal(day3.items.at(-1).placeId, 'place-schoenbrunn')
  assert.equal(day3.items.at(-1).title, 'Schönbrunn Palace')
})

test('deleting a place clears the itinerary reference without dropping the stop', () => {
  const next = clearItineraryRefs(seed, 'trip-vienna', { placeId: 'place-schoenbrunn' })
  const item = next[0].days[0].items[0]
  assert.equal(item.title, 'Schönbrunn Palace')
  assert.equal(item.placeId, undefined)
})

const calendarSeed = {
  tripId: 'trip-vienna',
  days: [
    {
      date: '2026-12-12',
      dayNumber: 1,
      title: 'Arrival',
      items: [
        { id: 'vie-d1-1', title: 'Arrival' },
        { id: 'vie-d1-2', title: 'Hotel check-in' },
        { id: 'vie-d1-3', title: 'Dinner' },
      ],
    },
    {
      date: '2026-12-13',
      dayNumber: 2,
      title: 'Imperial Vienna',
      items: [{ id: 'vie-d2-1', title: 'Schönbrunn Palace' }],
    },
    {
      date: '2026-12-14',
      dayNumber: 3,
      title: 'Old town',
      items: [],
    },
    {
      date: '2026-12-16',
      dayNumber: 5,
      title: 'Day trip',
      items: [{ id: 'vie-d5-1', title: 'Bratislava' }],
    },
  ],
}

test('indexItineraryItemsByDate groups items by YYYY-MM-DD', () => {
  const index = indexItineraryItemsByDate(calendarSeed)
  assert.deepEqual([...index.keys()], ['2026-12-12', '2026-12-13', '2026-12-16'])
  assert.deepEqual(
    index.get('2026-12-12').map((item) => item.id),
    ['vie-d1-1', 'vie-d1-2', 'vie-d1-3'],
  )
})

test('multiple items on one date preserve itinerary order', () => {
  const index = indexItineraryItemsByDate(calendarSeed)
  assert.deepEqual(
    index.get('2026-12-12').map((item) => item.title),
    ['Arrival', 'Hotel check-in', 'Dinner'],
  )
})

test('empty dates are not created in the calendar index', () => {
  const index = indexItineraryItemsByDate(calendarSeed)
  assert.equal(index.has('2026-12-14'), false)
  assert.equal(index.has('2026-12-15'), false)
  assert.equal(index.has('2026-12-19'), false)
})

test('calendar index does not duplicate itinerary items', () => {
  const index = indexItineraryItemsByDate(calendarSeed)
  const indexed = [...index.values()].flat()
  const ids = indexed.map((item) => item.id)
  assert.equal(ids.length, new Set(ids).size)
  assert.equal(indexed.length, flattenItineraryItems(calendarSeed).length)
  assert.equal(index.get('2026-12-12')[0], calendarSeed.days[0].items[0])
})

test('unrelated dates remain separate in the calendar index', () => {
  const index = indexItineraryItemsByDate(calendarSeed)
  assert.deepEqual(
    index.get('2026-12-13').map((item) => item.id),
    ['vie-d2-1'],
  )
  assert.deepEqual(
    index.get('2026-12-16').map((item) => item.id),
    ['vie-d5-1'],
  )
  assert.equal(index.get('2026-12-13')[0].id !== index.get('2026-12-16')[0].id, true)
})

test('indexing itinerary items does not change the source itinerary', () => {
  const snapshot = structuredClone(calendarSeed)
  const index = indexItineraryItemsByDate(calendarSeed)
  index.get('2026-12-12').reverse()
  assert.deepEqual(calendarSeed, snapshot)
  assert.deepEqual(
    calendarSeed.days[0].items.map((item) => item.id),
    ['vie-d1-1', 'vie-d1-2', 'vie-d1-3'],
  )
})

test('12–19 Dec trip still exposes 8 calendar dates via tripDates', () => {
  const trip = { startDate: '2026-12-12', endDate: '2026-12-19' }
  const dates = tripDates(trip)
  const index = indexItineraryItemsByDate(calendarSeed)
  assert.equal(dates.length, 8)
  assert.deepEqual(dates, [
    '2026-12-12',
    '2026-12-13',
    '2026-12-14',
    '2026-12-15',
    '2026-12-16',
    '2026-12-17',
    '2026-12-18',
    '2026-12-19',
  ])
  const emptyTripDates = dates.filter((date) => !index.has(date))
  assert.deepEqual(emptyTripDates, ['2026-12-14', '2026-12-15', '2026-12-17', '2026-12-18', '2026-12-19'])
})

test('itinerary slice for a date reuses the existing day without copying items', () => {
  const slice = itinerarySliceForDate(calendarSeed, '2026-12-13')
  assert.equal(slice.days[0], calendarSeed.days[1])
  assert.equal(slice.days[0].items[0], calendarSeed.days[1].items[0])
  assert.deepEqual(itinerarySliceForDate(calendarSeed, '2026-12-15').days, [])
})

test('existing itinerary mutations still keep place refs and source days', () => {
  const result = moveItineraryItemRecord(seed, 'trip-vienna', 'vie-d2-1', '2026-12-14')
  assert.equal(result.itineraries[0].days.find((day) => day.date === '2026-12-13').items.length, 0)
  assert.equal(result.itineraries[0].days.find((day) => day.date === '2026-12-14').items.at(-1).placeId, 'place-schoenbrunn')
  const cleared = clearItineraryRefs(seed, 'trip-vienna', { placeId: 'place-schoenbrunn' })
  assert.equal(cleared[0].days[0].items[0].title, 'Schönbrunn Palace')
  assert.equal(seed[0].days[0].items[0].placeId, 'place-schoenbrunn')
})

test('week view groups existing items under the correct Monday–Sunday dates', () => {
  const week = itineraryDaysForWeek(calendarSeed, '2026-12-14')
  assert.equal(week.length, 7)
  assert.equal(week[0].date, '2026-12-14')
  assert.deepEqual(
    week.map((day) => day.date),
    [
      '2026-12-14',
      '2026-12-15',
      '2026-12-16',
      '2026-12-17',
      '2026-12-18',
      '2026-12-19',
      '2026-12-20',
    ],
  )
  assert.deepEqual(
    week.find((day) => day.date === '2026-12-16').items.map((item) => item.id),
    ['vie-d5-1'],
  )
  assert.equal(week.find((day) => day.date === '2026-12-16').items[0], calendarSeed.days[3].items[0])
})

test('week view empty days stay empty without creating itinerary records', () => {
  const snapshot = structuredClone(calendarSeed)
  const week = itineraryDaysForWeek(calendarSeed, '2026-12-14')
  const empty = week.filter((day) => day.items.length === 0).map((day) => day.date)
  assert.deepEqual(empty, ['2026-12-14', '2026-12-15', '2026-12-17', '2026-12-18', '2026-12-19', '2026-12-20'])
  assert.deepEqual(calendarSeed, snapshot)
  assert.equal(calendarSeed.days.some((day) => day.date === '2026-12-15'), false)
})

test('week view does not duplicate itinerary records', () => {
  const week = itineraryDaysForWeek(calendarSeed, '2026-12-12')
  const items = week.flatMap((day) => day.items)
  const ids = items.map((item) => item.id)
  assert.equal(ids.length, new Set(ids).size)
  assert.deepEqual(
    week.find((day) => day.date === '2026-12-12').items.map((item) => item.id),
    ['vie-d1-1', 'vie-d1-2', 'vie-d1-3'],
  )
  assert.equal(items.filter((item) => item.id === 'vie-d2-1').length, 1)
})

test('day view slice returns only the selected date in existing order', () => {
  const slice = itinerarySliceForDate(calendarSeed, '2026-12-12')
  assert.deepEqual(
    slice.days.map((day) => day.date),
    ['2026-12-12'],
  )
  assert.deepEqual(
    slice.days[0].items.map((item) => item.id),
    ['vie-d1-1', 'vie-d1-2', 'vie-d1-3'],
  )
  assert.equal(slice.days[0].items[0], calendarSeed.days[0].items[0])
  assert.equal(
    slice.days.some((day) => day.date === '2026-12-13' || day.date === '2026-12-16'),
    false,
  )
})

test('day view empty date has no itinerary days', () => {
  const empty = itinerarySliceForDate(calendarSeed, '2026-12-15')
  assert.deepEqual(empty.days, [])
  const openDay = itinerarySliceForDate(calendarSeed, '2026-12-14')
  assert.equal(openDay.days.length, 1)
  assert.deepEqual(openDay.days[0].items, [])
})

test('month week and day item selection reuse the existing itinerary item id', () => {
  const item = calendarSeed.days[0].items[0]
  for (const view of ['month', 'week', 'day']) {
    const params = calendarItemSelection(item, { view, date: '2026-12-12' })
    assert.equal(params.tab, 'itinerary')
    assert.equal(params.view, view)
    assert.equal(params.date, '2026-12-12')
    assert.equal(params.item, 'vie-d1-1')
    assert.equal(params.item, item.id)
  }
})

test('selected date survives itinerary view switching including list', () => {
  const current = { date: '2026-12-14', itemId: 'vie-d3-1' }
  assert.equal(switchItineraryView(current, 'week').date, '2026-12-14')
  assert.equal(switchItineraryView(current, 'day').date, '2026-12-14')
  assert.equal(switchItineraryView(current, 'month').date, '2026-12-14')
  const list = switchItineraryView(current, 'list')
  assert.equal(list.date, '2026-12-14')
  assert.equal(list.view, undefined)
  assert.equal(list.item, 'vie-d3-1')
  assert.equal(itinerarySearchParams({ view: 'list', date: '2026-12-14' }).view, undefined)
})

test('calendar add uses the selected itinerary date on the existing creation path', () => {
  const trip = { startDate: '2026-12-12', endDate: '2026-12-19' }
  assert.equal(resolveCalendarAddDate('2026-12-15', trip), '2026-12-15')
  assert.equal(resolveCalendarAddDate('', trip), '2026-12-12')
  assert.equal(resolveCalendarAddDate('not-a-date', trip), '2026-12-12')
  const date = resolveCalendarAddDate('2026-12-15', trip)
  const before = structuredClone(calendarSeed)
  assert.equal(indexItineraryItemsByDate(calendarSeed).has(date), false)
  assert.deepEqual(calendarSeed, before)
})

test('calendar views do not create a second itinerary record for an existing stop', () => {
  const item = calendarSeed.days[1].items[0]
  const month = calendarItemSelection(item, { view: 'month', date: '2026-12-13' })
  const week = calendarItemSelection(item, { view: 'week', date: '2026-12-13' })
  const day = calendarItemSelection(item, { view: 'day', date: '2026-12-13' })
  assert.equal(month.item, week.item)
  assert.equal(week.item, day.item)
  assert.equal(month.item, 'vie-d2-1')
  const weekDays = itineraryDaysForWeek(calendarSeed, '2026-12-12')
  const matches = weekDays.flatMap((entry) => entry.items).filter((entry) => entry.id === item.id)
  assert.equal(matches.length, 1)
  assert.equal(matches[0], item)
})

test('existing itinerary update and move APIs remain unchanged from calendar views', () => {
  const updated = updateItineraryItemRecord(seed, 'trip-vienna', 'vie-d2-1', { title: 'Palace visit' }, 'user-jamie', '2026-09-18T00:00:00.000Z')
  assert.equal(updated.item.id, 'vie-d2-1')
  assert.equal(updated.item.title, 'Palace visit')
  assert.equal(updated.item.placeId, 'place-schoenbrunn')
  assert.equal(seed[0].days[0].items[0].title, 'Schönbrunn Palace')
  const moved = moveItineraryItemRecord(seed, 'trip-vienna', 'vie-d2-1', '2026-12-14')
  assert.equal(moved.item.id, 'vie-d2-1')
  assert.equal(moved.itineraries[0].days.find((day) => day.date === '2026-12-14').items.at(-1).id, 'vie-d2-1')
})
