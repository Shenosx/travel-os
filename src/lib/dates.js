const DAY_MS = 24 * 60 * 60 * 1000

/** @param {string} iso */
export function parseISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** @param {Date} date */
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Inclusive calendar-day difference (end - start).
 * 12 Dec → 19 Dec returns 7.
 * @param {string} startIso
 * @param {string} endIso
 */
export function durationDays(startIso, endIso) {
  const start = parseISODate(startIso)
  const end = parseISODate(endIso)
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

/**
 * @param {string} iso
 * @param {Date} [today]
 */
export function daysUntil(iso, today = new Date()) {
  const target = parseISODate(iso)
  const now = startOfDay(today)
  return Math.round((target.getTime() - now.getTime()) / DAY_MS)
}

/** @param {string} iso */
export function formatLongDate(iso) {
  return parseISODate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** @param {string} iso */
export function formatWeekday(iso) {
  return parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long' })
}

/** @param {string} iso */
export function formatShortWeekday(iso) {
  return parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short' })
}

/**
 * @param {string} startIso
 * @param {string} endIso
 */
export function formatDateRange(startIso, endIso) {
  const start = parseISODate(startIso)
  const end = parseISODate(endIso)
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const sameYear = start.getFullYear() === end.getFullYear()

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    })}`
  }

  if (sameYear) {
    const startLabel = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    const endLabel = end.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    return `${startLabel} – ${endLabel}`
  }

  return `${formatLongDate(startIso)} – ${formatLongDate(endIso)}`
}

/** @param {Date} [now] */
export function greetingForTime(now = new Date()) {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** @param {string} iso */
export function formatQuietDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function nowIso() {
  return new Date().toISOString()
}

/** @param {Date} date */
export function formatISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** @param {string} iso @param {number} n */
export function addDays(iso, n) {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + n)
  return formatISODate(date)
}

/** Inclusive list of calendar dates from trip start to end. */
export function tripDates(trip) {
  if (!trip?.startDate || !trip?.endDate) return []
  const span = durationDays(trip.startDate, trip.endDate)
  return Array.from({ length: span + 1 }, (_, index) => addDays(trip.startDate, index))
}

/** @param {import('../types').Trip} trip @param {string} iso */
export function tripDayNumber(trip, iso) {
  if (!iso) return null
  const index = tripDates(trip).indexOf(iso)
  return index >= 0 ? index + 1 : null
}

/** @param {Date} [today] */
export function todayIso(today = new Date()) {
  return formatISODate(startOfDay(today))
}

/** @param {unknown} value */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return formatISODate(parseISODate(value)) === value
}

/**
 * Long month + year for a YYYY-MM or YYYY-MM-DD value.
 * @param {string} iso
 */
export function formatMonthYear(iso) {
  const date = parseISODate(iso.length === 7 ? `${iso}-01` : iso)
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/**
 * Monday-start month cells, including leading/trailing days from adjacent months.
 * @param {number} year
 * @param {number} month 1–12
 * @returns {{ iso: string, inMonth: boolean }[]}
 */
export function monthGrid(year, month) {
  const firstIso = `${year}-${String(month).padStart(2, '0')}-01`
  const first = parseISODate(firstIso)
  const leading = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []

  for (let offset = leading; offset > 0; offset -= 1) {
    cells.push({ iso: addDays(firstIso, -offset), inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      inMonth: true,
    })
  }
  const remainder = cells.length % 7
  if (remainder) {
    const lastIso = cells.at(-1).iso
    for (let offset = 1; offset <= 7 - remainder; offset += 1) {
      cells.push({ iso: addDays(lastIso, offset), inMonth: false })
    }
  }
  return cells
}

/**
 * Deterministic selected date for the itinerary month view.
 * Honours a valid YYYY-MM-DD request; otherwise today when it falls in the trip,
 * otherwise the trip start date.
 * @param {{ startDate?: string, endDate?: string } | null | undefined} trip
 * @param {unknown} requestedDate
 * @param {Date | string} [today]
 */
export function resolveSelectedCalendarDate(trip, requestedDate, today = new Date()) {
  if (isIsoDate(requestedDate)) return requestedDate
  const todayStr = typeof today === 'string' && isIsoDate(today) ? today : todayIso(today)
  const dates = tripDates(trip)
  if (dates.includes(todayStr)) return todayStr
  return trip?.startDate && isIsoDate(trip.startDate) ? trip.startDate : todayStr
}

/**
 * Monday of the week containing `iso`, using the same Monday-start convention as monthGrid.
 * @param {string} iso
 */
export function startOfWeek(iso) {
  const offset = (parseISODate(iso).getDay() + 6) % 7
  return addDays(iso, -offset)
}

/**
 * Seven dates Monday → Sunday for the week containing `iso`.
 * @param {string} iso
 * @returns {string[]}
 */
export function weekDates(iso) {
  const start = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** @param {string} iso @param {number} n */
export function addWeeks(iso, n) {
  return addDays(iso, n * 7)
}
