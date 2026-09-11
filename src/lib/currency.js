export const HOME_CURRENCY = 'MYR'

export const CURRENCIES = [
  { code: 'MYR', label: 'RM', name: 'Malaysian ringgit' },
  { code: 'EUR', label: '€', name: 'Euro' },
  { code: 'USD', label: 'US$', name: 'US dollar' },
  { code: 'JPY', label: '¥', name: 'Japanese yen' },
  { code: 'THB', label: '฿', name: 'Thai baht' },
  { code: 'GBP', label: '£', name: 'Pound sterling' },
]

/**
 * Mock rates as MYR per 1 unit of currency.
 * Replace this map (or convert()) with a live FX API later.
 */
export const RATES_TO_MYR = {
  MYR: 1,
  EUR: 4.668571428571429,
  USD: 4.21,
  JPY: 0.0284,
  THB: 0.129,
  GBP: 5.52,
}

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

/**
 * @param {number} amount
 * @param {string} from
 * @param {string} [to]
 */
export function convert(amount, from, to = HOME_CURRENCY) {
  if (!amount) return 0
  if (from === to) return roundMoney(amount)
  const fromRate = RATES_TO_MYR[from]
  const toRate = RATES_TO_MYR[to]
  if (!fromRate || !toRate) return roundMoney(amount)
  return roundMoney((amount * fromRate) / toRate)
}

/**
 * Home-currency value for totals and settlement.
 * Original amount/currency are never overwritten.
 *
 * @param {import('../types').Expense} expense
 * @param {string} [to]
 */
export function getExpenseValue(expense, to = expense.convertedCurrency ?? HOME_CURRENCY) {
  if (
    expense.convertedAmount != null &&
    (expense.convertedCurrency ?? HOME_CURRENCY) === to
  ) {
    return expense.convertedAmount
  }
  return convert(expense.amount, expense.currency, to)
}

/**
 * Convert a share in original currency into the expense's converted currency,
 * preserving the total by assigning leftover cents to the last share.
 *
 * @param {import('../types').Expense} expense
 * @param {string} [to]
 */
export function getConvertedShares(expense, to) {
  const total = getExpenseValue(expense, to)
  if (!expense.shares.length) return []
  if (!expense.amount) {
    return expense.shares.map((share) => ({ ...share, convertedAmount: 0 }))
  }

  const converted = expense.shares.map((share, index) => {
    const isLast = index === expense.shares.length - 1
    return {
      ...share,
      convertedAmount: isLast ? 0 : roundMoney(total * (share.amount / expense.amount)),
    }
  })
  const assigned = converted.slice(0, -1).reduce((sum, share) => sum + share.convertedAmount, 0)
  converted[converted.length - 1].convertedAmount = roundMoney(total - assigned)
  return converted
}

/** @param {import('../types').Expense} expense @param {string} userId */
export function getConvertedShareAmount(expense, userId) {
  const match = getConvertedShares(expense).find((share) => share.userId === userId)
  return match?.convertedAmount ?? 0
}

export function withConvertedAmount(expense, to = HOME_CURRENCY) {
  return {
    ...expense,
    convertedAmount: convert(expense.amount, expense.currency, to),
    convertedCurrency: to,
  }
}
