const CURRENCY_PREFIX = {
  MYR: 'RM',
  EUR: '€',
  USD: 'US$',
  JPY: '¥',
  THB: '฿',
  GBP: '£',
}

const TIGHT_CURRENCIES = new Set(['EUR', 'USD', 'JPY', 'THB', 'GBP'])

/**
 * @param {number} amount
 * @param {string} [currency]
 */
export function formatMoney(amount, currency = 'MYR') {
  const prefix = CURRENCY_PREFIX[currency] ?? `${currency} `
  const absolute = Math.abs(amount)
  const formatted = absolute.toLocaleString('en-MY', {
    minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  const signed = amount < 0 ? '-' : ''
  const spacer = TIGHT_CURRENCIES.has(currency) ? '' : ' '
  return `${signed}${prefix}${spacer}${formatted}`
}

/**
 * Original amount, with a home-currency approximation when they differ.
 * @param {import('../types').Expense} expense
 */
export function formatExpenseAmount(expense) {
  const original = formatMoney(expense.amount, expense.currency)
  if (!expense.currency || expense.currency === (expense.convertedCurrency ?? 'MYR')) {
    return original
  }
  return `${original} ${expense.currency}`
}

/**
 * @param {import('../types').Expense} expense
 */
export function formatConvertedApprox(expense) {
  const home = expense.convertedCurrency ?? 'MYR'
  if (expense.currency === home) return null
  return `≈ ${formatMoney(expense.convertedAmount ?? expense.amount, home)}`
}

/** @param {number} value */
export function formatNumber(value) {
  return value.toLocaleString('en-MY')
}

/** @param {number} spent @param {number} budget */
export function spendingRatio(spent, budget) {
  if (!budget) return 0
  return Math.min(spent / budget, 1)
}

/** @param {number} spent @param {number} budget */
export function spendingPercent(spent, budget) {
  if (!budget) return 0
  return Math.round((spent / budget) * 100)
}

/** @param {string} hhmm */
export function formatTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const date = new Date()
  date.setHours(h, m, 0, 0)
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}
