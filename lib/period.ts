// The period chips Home and every section overview share: which months a
// period covers, and the months before it to compare with. "Last N months"
// counts this one; last quarter is the last full calendar quarter.
export type PeriodKey = 'this' | 'last' | 'q' | 'm6' | 'm12' | 'y2'
export const PERIODS: [PeriodKey, string][] = [['this', 'This month'], ['last', 'Last month'], ['q', 'Last quarter'], ['m6', 'Last 6 months'], ['m12', 'Last 12 months'], ['y2', 'Last 2 years']]
export const PERIOD_KEY = 'wl-home-period'          // saved on this device (kept from when only Home had it)
export const isPeriod = (p: any): p is PeriodKey => PERIODS.some(x => x[0] === p)
export const periodName = (p: PeriodKey) => PERIODS.find(x => x[0] === p)![1]

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const addM = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }
export const mLabel = (ym: string) => `${MON[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`
export const monthName = (ym: string) => `${MONTH[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`
export const monthsUpTo = (ym: string, n: number) => Array.from({ length: n }, (_, i) => addM(ym, i - (n - 1)))

// First and last month (YYYY-MM) of a period, as of month `now`
export function rangeOf(p: PeriodKey, now: string): [string, string] {
  if (p === 'this') return [now, now]
  if (p === 'last') return [addM(now, -1), addM(now, -1)]
  if (p === 'q') { const qs = addM(now, -((Number(now.slice(5)) - 1) % 3)); return [addM(qs, -3), addM(qs, -1)] }
  return [addM(now, -({ m6: 5, m12: 11, y2: 23 }[p])), now]
}

// Where a period sits in a list of months: its first and last index, its
// length, and the same length just before it (to compare with), when held
export interface Window { a: number; b: number; len: number; pa: number; pb: number; hasPrev: boolean; isNow: boolean; chart: number[] }
export function windowOf(months: string[], p: PeriodKey, now: string): Window {
  const [from, to] = rangeOf(p, now), at = (m: string) => months.indexOf(m)
  const a = Math.max(0, at(from)), b = at(to) < 0 ? months.length - 1 : at(to), len = b - a + 1
  const pa = a - len, pb = b - len
  // Charts show the period, or the six months to its end when it's shorter than a quarter
  const lo = len >= 3 ? a : Math.max(0, b - 5)
  return { a, b, len, pa, pb, hasPrev: p !== 'this' && pa >= 0, isNow: months[b] === now, chart: Array.from({ length: b - lo + 1 }, (_, i) => lo + i) }
}
export const sumOf = (arr: number[], a: number, b: number) => { let s = 0; for (let i = Math.max(0, a); i <= b; i++) s += arr[i] ?? 0; return s }
export const pctChange = (c: number, p: number) => (p ? (c - p) / Math.abs(p) * 100 : 0)
// "in this period" / "this month" / "in October"
export const periodWord = (p: PeriodKey, to: string) => (p === 'this' ? 'this month' : p === 'last' ? `in ${MONTH[Number(to.slice(5)) - 1]}` : 'in this period')
