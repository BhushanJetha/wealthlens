// Money put into investments, month by month. One calculation for the
// Investments overview chart, its Trends tab and the Income Rule, so they all
// show the same amounts.
//
// Sources, best first:
//   Mutual funds / stocks: dated purchases and SIPs (investment_transactions,
//     from CAS imports and Buy actions). Any cost not covered by those sits on
//     the month the holding was added.
//   ETF, gold, bonds, FDs: the amount put in, on the purchase / start date.
//   RDs: each instalment taken so far.
//   LIC: each premium on its schedule since the start date.
//   PPF / EPF: the yearly contribution spread over the months since opening.
//   NPS: the amount put in spread evenly since the start date.
// The last three follow a schedule, not records, so they're estimates.
import { holdingCost, rdInstalments } from './netWorth'

export const FLOW_KEYS = ['mf', 'stocks', 'etf', 'fd', 'rd', 'gold', 'bonds', 'nps', 'ppf', 'lic'] as const
export type FlowKey = (typeof FLOW_KEYS)[number]
export type FlowRow = Record<FlowKey, number> & { total: number }

export interface FlowInput {
  stocks: any[]; mutualFunds: any[]; etf: any[]; fixedDeposits: any[]; recurringDeposits: any[]
  nps: any[]; lic: any[]; ppfEpf: any[]; gold: any[]; bonds: any[]
  invTxns: { asset_type: string; asset_id: string | null; txn_date: string; txn_type: string; amount: number }[]
}

const INFLOW = new Set(['purchase', 'sip', 'switch_in'])
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, 'half-yearly': 2, 'half yearly': 2, halfyearly: 2, annually: 1, yearly: 1, annual: 1 }

const ym = (d: string | null | undefined) => (d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null)
export function addMonth(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const t = y * 12 + (mo - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const monthsBetween = (a: string, b: string) => {
  const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

// month (YYYY-MM) → amount per kind, in display currency via `conv`
export function investmentFlows(h: FlowInput, conv: (amt: number, cur: string) => number, today = new Date()) {
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const map = new Map<string, FlowRow>()
  const add = (month: string | null, key: FlowKey, amt: number, cur: string) => {
    if (!month || !(amt > 0) || month > now) return
    let row = map.get(month)
    if (!row) { row = { total: 0 } as FlowRow; FLOW_KEYS.forEach(k => { row![k] = 0 }); map.set(month, row) }
    const v = conv(amt, cur || 'INR')
    row[key] += v; row.total += v
  }

  // Funds and stocks: dated records first, the rest on the month it was added
  const byAsset = new Map<string, FlowInput['invTxns']>()
  for (const t of h.invTxns ?? []) {
    if (!t.asset_id || !INFLOW.has(t.txn_type)) continue
    const list = byAsset.get(t.asset_id) ?? []
    list.push(t); byAsset.set(t.asset_id, list)
  }
  const recorded = (rows: any[], key: FlowKey, cost: (x: any) => number) => rows.forEach(x => {
    const txns = byAsset.get(x.id) ?? []
    let covered = 0
    for (const t of txns) { add(ym(t.txn_date), key, Number(t.amount) || 0, x.currency); covered += Number(t.amount) || 0 }
    const rest = cost(x) - covered
    if (rest > Math.max(1, cost(x) * 0.01)) add(ym(x.created_at), key, rest, x.currency)
  })
  recorded(h.mutualFunds ?? [], 'mf', holdingCost.mf)
  recorded(h.stocks ?? [], 'stocks', holdingCost.stock)

  for (const e of h.etf ?? [])           add(ym(e.purchase_date ?? e.created_at), 'etf', holdingCost.etf(e), e.currency)
  for (const g of h.gold ?? [])          add(ym(g.purchase_date ?? g.created_at), 'gold', holdingCost.gold(g), g.currency)
  for (const b of h.bonds ?? [])         add(ym(b.purchase_date ?? b.created_at), 'bonds', holdingCost.bond(b), b.currency)
  for (const f of h.fixedDeposits ?? []) add(ym(f.start_date ?? f.created_at), 'fd', holdingCost.fd(f), f.currency)

  for (const r of h.recurringDeposits ?? []) {
    const start = ym(r.start_date ?? r.created_at), n = rdInstalments(r, today)
    if (start) for (let i = 0; i < n; i++) add(addMonth(start, i), 'rd', Number(r.monthly_amount) || 0, r.currency)
  }

  for (const l of h.lic ?? []) {
    const start = ym(l.start_date), per = PER_YEAR[String(l.premium_frequency ?? 'annually').toLowerCase()] ?? 1
    if (!start) continue
    const end = ym(l.maturity_date) ?? now, step = 12 / per, amt = (Number(l.annual_premium) || 0) / per
    for (let m = start; m <= end && m <= now; m = addMonth(m, step)) add(m, 'lic', amt, l.currency)
  }

  for (const x of h.ppfEpf ?? []) {
    const start = ym(x.start_date ?? x.created_at), monthly = (Number(x.annual_contribution) || 0) / 12
    if (!start || !(monthly > 0)) continue
    const end = ym(x.maturity_date) ?? now
    for (let m = start; m <= end && m <= now; m = addMonth(m, 1)) add(m, 'ppf', monthly, x.currency)
  }

  for (const n of h.nps ?? []) {
    const start = ym(n.start_date), cost = holdingCost.nps(n)
    if (!start) { add(ym(n.created_at), 'nps', cost, n.currency); continue }
    const months = Math.max(1, monthsBetween(start, now) + 1)
    for (let i = 0; i < months; i++) add(addMonth(start, i), 'nps', cost / months, n.currency)
  }

  return map
}

const empty = (): FlowRow => { const r = { total: 0 } as FlowRow; FLOW_KEYS.forEach(k => { r[k] = 0 }); return r }

// The last `n` months up to this one (empty months included)
export function flowMonths(map: Map<string, FlowRow>, n: number, today = new Date()) {
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  return Array.from({ length: n }, (_, i) => {
    const key = addMonth(now, i - n + 1)
    return { key, ...(map.get(key) ?? empty()) }
  })
}

// Calendar years, from the first year with money in (at most `n` years back)
export function flowYears(map: Map<string, FlowRow>, n: number, today = new Date()) {
  const yNow = today.getFullYear()
  const first = Math.min(...Array.from(map.keys()).map(k => Number(k.slice(0, 4))), yNow)
  const from = Math.max(first, yNow - n + 1)
  return Array.from({ length: yNow - from + 1 }, (_, i) => {
    const y = String(from + i), row = empty()
    map.forEach((v, k) => { if (k.startsWith(y)) { FLOW_KEYS.forEach(f => { row[f] += v[f] }); row.total += v.total } })
    return { key: y, ...row }
  })
}
