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
