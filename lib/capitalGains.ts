// Capital gains for your Indian tax return: every sale or redemption in a
// financial year (April to March), matched first in, first out against what
// was bought (lib/holding), split long / short term, with the tax it likely
// means under today's rules. Estimates, not tax advice.
import { holdingModel, holdingName, fyLabel, type HType, type GainKind } from './holding'

const ASSET: Record<string, HType> = { mutual_fund: 'mutual_funds', stock: 'stocks', etf: 'etf_investments' }
export const LTCG_FREE = 125000           // equity long-term gains free each year
export interface GainRow { id: string | null; date: string; name: string; type: HType | null; assetId: string | null; kind: GainKind | null; units: number; proceeds: number; cost: number | null; longGain: number; shortGain: number; gain: number | null }
export interface FyGains {
  fy: string; rows: GainRow[]
  equity: { long: number; short: number; tax: number }
  gold: { long: number; short: number; tax: number }
  debt: { gain: number }
  unknown: number                        // sales with no cost we can work out
}

// fy of a date (Indian financial year starts 1 April)
export const fyStart = (fy: string) => `${fy.slice(3, 7)}-04-01`

export function capitalGains(holdings: Partial<Record<HType, any[]>>, txns: any[], today: string): Record<string, FyGains> {
  const rows: GainRow[] = []
  const byAsset = new Map<string, any[]>()
  for (const t of txns) if (t.asset_id) (byAsset.get(t.asset_id) ?? byAsset.set(t.asset_id, []).get(t.asset_id)!).push(t)
  const seen = new Set<string>()
  for (const [type, list] of Object.entries(holdings) as [HType, any[]][]) for (const r of list ?? []) {
    const mine = byAsset.get(r.id) ?? []
    if (!mine.some(t => ['redemption', 'switch_out'].includes(t.txn_type))) continue
    seen.add(r.id)
    const m = holdingModel(type, r, mine, today)
    for (const s of m.sales) rows.push({ id: s.id, date: s.date, name: holdingName(type, r), type, assetId: r.id, kind: m.gainKind, units: s.units, proceeds: s.proceeds, cost: s.cost, longGain: s.longGain, shortGain: s.shortGain, gain: s.gain })
  }
  // A sale whose holding was deleted: its own kept cost, else nothing to go on
  for (const t of txns) if (['redemption', 'switch_out'].includes(t.txn_type) && !(t.asset_id && seen.has(t.asset_id))) {
    const cost = t.cost_amount != null ? Number(t.cost_amount) : null, proceeds = Number(t.amount) || 0
    rows.push({ id: t.id ?? null, date: String(t.txn_date).slice(0, 10), name: t.asset_name ?? 'Investment', type: ASSET[t.asset_type] ?? null, assetId: t.asset_id ?? null, kind: null,
      units: Number(t.units) || 0, proceeds, cost, longGain: 0, shortGain: cost != null ? proceeds - cost : 0, gain: cost != null ? proceeds - cost : null })
  }
  const out: Record<string, FyGains> = {}
  for (const g of rows.sort((a, b) => b.date.localeCompare(a.date))) {
    const fy = fyLabel(g.date)
    const f = out[fy] ?? (out[fy] = { fy, rows: [], equity: { long: 0, short: 0, tax: 0 }, gold: { long: 0, short: 0, tax: 0 }, debt: { gain: 0 }, unknown: 0 })
    f.rows.push(g)
    if (g.gain == null) { f.unknown += g.proceeds; continue }
    if (g.kind === 'debt') f.debt.gain += g.gain
    else if (g.kind === 'gold') { f.gold.long += g.longGain; f.gold.short += g.shortGain }
    else { f.equity.long += g.longGain; f.equity.short += g.shortGain }   // a deleted holding's sale counts as equity, short-term
  }
  // Losses set off gains of the same kind first (short-term losses can also set off long-term)
  for (const f of Object.values(out)) {
    let { long, short } = f.equity
    if (short < 0) { long += short; short = 0 }
    f.equity.tax = Math.round(Math.max(0, long - LTCG_FREE) * 0.125 + Math.max(0, short) * 0.2)
    f.gold.tax = Math.round(Math.max(0, f.gold.long) * 0.125)
  }
  return out
}
