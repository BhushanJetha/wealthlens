// Money put into investments, month by month: the payments in
// lib/investEntries added up by month. One calculation for the Investments
// overview chart, its Growth tab and the Income Rule; the Invested tab lists
// the same payments, so they all show the same amounts.
import { investmentEntries, addMonth, FLOW_KEYS, type FlowKey, type FlowInput } from './investEntries'

export { FLOW_KEYS, addMonth, type FlowKey, type FlowInput }
export type FlowRow = Record<FlowKey, number> & { total: number }

const empty = (): FlowRow => { const r = { total: 0 } as FlowRow; FLOW_KEYS.forEach(k => { r[k] = 0 }); return r }

// month (YYYY-MM) → amount per kind, in display currency via `conv`
export function investmentFlows(h: FlowInput, conv: (amt: number, cur: string) => number, today = new Date()) {
  const map = new Map<string, FlowRow>()
  for (const e of investmentEntries(h, conv, today)) {
    let row = map.get(e.month)
    if (!row) { row = empty(); map.set(e.month, row) }
    row[e.key] += e.amount; row.total += e.amount
  }
  return map
}

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
