// Home's trends, month by month and per currency: what came in, what was
// spent (and on what), EMIs, saved (income − spent − EMIs, as on every other
// screen, lib/budgets monthMoney), what went into investments (the Invested
// tab's payments, lib/investEntries), the loans still owed at each month's
// end (lib/loans), and what you owned and owed from the daily net-worth
// snapshots. The phone turns these into the view on screen (viewTrends).
import { isIncome, spendGroup, catOf } from './money'
import { groupKeyOf, type Category } from './categories'
import { investmentFlows, type FlowInput } from './investFlows'
import { loanOwedOn } from './loans'
import { NW_RULES } from './netWorth'

type Cur = 'AED' | 'INR'
type View = 'uae' | 'india' | 'consolidated'
export interface CurSeries {
  income: number[]      // earned income (India: with what landed from the UAE, in remitIn)
  remitIn: number[]     // money from the UAE landing in India — income in the India view only
  spent: number[]; emi: number[]; invested: number[]
  loans: number[]       // owed at the month's end (today for this month)
  groups: Record<string, number>[]   // spending by category group
}
export interface SnapPoint { date: string; fx: number; uaeA: number; uaeL: number; indA: number; indL: number; inv: number | null; grp?: Record<string, number> | null }
export interface Trends { months: string[]; fx: number; cur: Record<Cur, CurSeries>; snaps: (SnapPoint | null)[]; first: string | null }

// Asset groups that are investments (the rest is cash and property), lib/netWorth ASSET_GROUPS
const INVEST_GROUPS = ['mf', 'equity', 'gold', 'retirement', 'deposits', 'other']
const ALL_GROUPS = [...INVEST_GROUPS, 'cash', 'property']

export const monthsUpTo = (ym: string, n: number) => Array.from({ length: n }, (_, i) => {
  const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) - (n - 1 - i)
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
})
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }

export function buildTrends(inp: {
  months: string[]; prepared: any[]; rows?: Category[]; holdings: FlowInput; loans: any[]; loanTxns: any[]; snapshots: any[]; today: string; fx: number
}): Trends {
  const { months, prepared, rows = [], today, fx } = inp
  const at = new Map(months.map((m, i) => [m, i]))
  const blank = (): CurSeries => ({ income: months.map(() => 0), remitIn: months.map(() => 0), spent: months.map(() => 0), emi: months.map(() => 0),
    invested: months.map(() => 0), loans: months.map(() => 0), groups: months.map(() => ({})) })
  const cur: Record<Cur, CurSeries> = { AED: blank(), INR: blank() }
  let first: string | null = null

  for (const t of prepared) {
    const i = at.get(String(t.txn_date).slice(0, 7)), c: Cur = t.currency === 'AED' ? 'AED' : 'INR'
    if (i == null) continue
    const s = cur[c], v = Number(t.amount) || 0
    if (first == null || t.txn_date < first) first = String(t.txn_date)
    if (t._remit) { s.remitIn[i] += v; continue }
    if (isIncome(t, c === 'AED' ? 'uae' : 'india')) { s.income[i] += v; continue }
    const g = spendGroup(t)
    if (!g) continue
    if (g === 'loans') s.emi[i] += v
    else if (g !== 'invest') { s.spent[i] += v; const k = groupKeyOf(catOf(t), rows) ?? 'other'; s.groups[i][k] = (s.groups[i][k] ?? 0) + v }
  }

  // Put into investments: the same payments as Investments › Invested and Growth
  for (const c of ['AED', 'INR'] as Cur[]) {
    const flows = investmentFlows(inp.holdings, (amt, cc) => ((cc === 'AED' ? 'AED' : 'INR') === c ? amt : 0), new Date(`${today}T12:00:00`))
    months.forEach((m, i) => { cur[c].invested[i] = flows.get(m)?.total ?? 0 })
  }

  // Owed on each active loan at each month's end (as the Loans page counts them); nothing before it started
  const thisMonth = today.slice(0, 7)
  for (const l of inp.loans.filter(x => x.is_active !== false)) {
    const c: Cur = l.currency === 'AED' ? 'AED' : 'INR', start = String(l.loan_start_date ?? '').slice(0, 10)
    months.forEach((m, i) => {
      const d = m === thisMonth ? today : monthEnd(m)
      if (d > today || (start && start > d)) return
      cur[c].loans[i] += loanOwedOn(l, inp.loanTxns, d)
    })
  }

  // The last snapshot of each month (worked out with today's rules)
  const snaps: (SnapPoint | null)[] = months.map(() => null)
  for (const s of [...inp.snapshots].sort((a, b) => String(a.snap_date).localeCompare(String(b.snap_date)))) {
    if ((s.breakdown?.rules ?? 1) < NW_RULES) continue
    const i = at.get(String(s.snap_date).slice(0, 7))
    if (i == null) continue
    const b = s.breakdown ?? {}, inv = INVEST_GROUPS.some(k => b[k] != null) ? INVEST_GROUPS.reduce((a, k) => a + (Number(b[k]) || 0), 0) : null
    const grp = ALL_GROUPS.some(k => b[k] != null) ? Object.fromEntries(ALL_GROUPS.map(k => [k, Number(b[k]) || 0])) : null
    snaps[i] = { date: String(s.snap_date), fx: Number(s.fx) || fx, uaeA: Number(s.uae_assets) || 0, uaeL: Number(s.uae_liab) || 0, indA: Number(s.india_assets) || 0, indL: Number(s.india_liab) || 0, inv, grp }
  }
  return { months, fx, cur, snaps, first }
}

// ── On screen ────────────────────────────────────────────────────────────────
export interface ViewSeries {
  income: number[]; spent: number[]; emi: number[]; saved: number[]; invested: number[]; loans: number[]; groups: Record<string, number>[]
  own: (number | null)[]; owe: (number | null)[]; nw: (number | null)[]; inv: (number | null)[]   // from snapshots; null before tracking began
  grp: (Record<string, number> | null)[]   // what you own by asset group (both countries together only)
}
// One view's numbers: a country in its own currency, or both in rupees at today's rate
// (snapshots at the rate of their day). The India view counts money landing from the UAE
// as income; All doesn't, or it would count twice.
export function viewTrends(t: Trends, view: View, fx = t.fx): ViewSeries {
  const n = t.months.length, A = t.cur.AED, I = t.cur.INR
  const pick = (f: (c: Cur, i: number) => number) => Array.from({ length: n }, (_, i) =>
    view === 'uae' ? f('AED', i) : view === 'india' ? f('INR', i) : f('INR', i) + f('AED', i) * fx)
  const income = pick((c, i) => t.cur[c].income[i] + (view === 'india' && c === 'INR' ? I.remitIn[i] : 0))
  const spent = pick((c, i) => t.cur[c].spent[i]), emi = pick((c, i) => t.cur[c].emi[i])
  const groups = Array.from({ length: n }, (_, i) => {
    const out: Record<string, number> = {}
    for (const c of (view === 'uae' ? ['AED'] : view === 'india' ? ['INR'] : ['INR', 'AED']) as Cur[])
      for (const [k, v] of Object.entries(t.cur[c].groups[i])) out[k] = (out[k] ?? 0) + v * (view === 'consolidated' && c === 'AED' ? fx : 1)
    return out
  })
  const snap = (f: (s: SnapPoint) => number) => t.snaps.map(s => (s ? f(s) : null))
  const own = snap(s => (view === 'uae' ? s.uaeA : view === 'india' ? s.indA : s.indA + s.uaeA * s.fx))
  const owe = snap(s => (view === 'uae' ? s.uaeL : view === 'india' ? s.indL : s.indL + s.uaeL * s.fx))
  return {
    income, spent, emi, saved: income.map((x, i) => x - spent[i] - emi[i]), groups,
    invested: pick((c, i) => t.cur[c].invested[i]), loans: pick((c, i) => t.cur[c].loans[i]),
    own, owe, nw: own.map((x, i) => (x == null ? null : x - (owe[i] ?? 0))),
    // The split into investments is kept for both countries together only
    inv: view === 'consolidated' ? t.snaps.map(s => s?.inv ?? null) : t.snaps.map(() => null),
    grp: view === 'consolidated' ? t.snaps.map(s => s?.grp ?? null) : t.snaps.map(() => null),
  }
}

// A smooth line through points that never overshoots them (monotone cubic), as an SVG path
export function smoothPath(P: { x: number; y: number }[]): string {
  const n = P.length
  if (n === 0) return ''
  if (n === 1) return `M${(P[0].x - 1).toFixed(1)} ${P[0].y.toFixed(1)} L${(P[0].x + 1).toFixed(1)} ${P[0].y.toFixed(1)}`
  const d: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1].y - P[i].y) / (P[i + 1].x - P[i].x))
  m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); m.push(d[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i] }
  }
  let out = `M${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (P[i + 1].x - P[i].x) / 3
    out += ` C${(P[i].x + dx).toFixed(1)} ${(P[i].y + m[i] * dx).toFixed(1)} ${(P[i + 1].x - dx).toFixed(1)} ${(P[i + 1].y - m[i + 1] * dx).toFixed(1)} ${P[i + 1].x.toFixed(1)} ${P[i + 1].y.toFixed(1)}`
  }
  return out
}
// The same curve drawn backwards, to close an area between two curves
export const smoothBack = (P: { x: number; y: number }[]) => smoothPath([...P].reverse()).replace(/^M/, 'L')
// A round step for chart ticks (1, 2, 2.5 or 5 × a power of ten)
export function niceStep(x: number) {
  if (!(x > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}
