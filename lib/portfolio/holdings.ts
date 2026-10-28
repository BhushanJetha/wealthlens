// Every holding in one shape, for the portfolio manager: what it's worth, what
// went in, how it splits across equity / debt / gold / cash, how quickly it
// can become money (and when it unlocks), its currency, and the goals it's
// linked to. Values use lib/netWorth's holdingValue / holdingCost, so the
// totals match Net worth and Investments.
import { holdingValue as V, holdingCost as C, type Holdings } from '../netWorth'
import { otherAssetValue, otherKind, gratuityValue } from '../otherAssets'

export type Cur = 'AED' | 'INR'
export type Cls = 'equity' | 'debt' | 'gold' | 'cash'
// now: in a day or two · week: sell and it settles in days · penalty: can be
// had but costs something · locked: not until a date (or not at all)
export type Access = 'now' | 'week' | 'penalty' | 'locked'
export const ACCESS: Record<Access, { label: string; sub: string; color: string }> = {
  now:     { label: 'Today',          sub: 'bank, liquid funds, maturing FDs', color: '#1baf7a' },
  week:    { label: 'Within a week',  sub: 'sell funds, shares, ETFs, gold',  color: '#2a78d6' },
  penalty: { label: 'At a cost',      sub: 'break an FD or RD, surrender LIC', color: '#eda100' },
  locked:  { label: 'Locked',         sub: 'PPF, EPF, NPS, ELSS, property, gratuity', color: '#6250d6' },
}

export interface PHolding {
  key: string                    // table:id
  type: string                   // bank, stock, mf, etf, fd, rd, ppf, nps, gold, bond, lic, other, gratuity
  id: string; name: string; sub: string
  currency: Cur; value: number; cost: number
  mix: Record<Cls, number>       // shares that add up to 1 (0 for property / vehicles / gratuity)
  investable: boolean            // counts in the investment mix (not property, vehicles, gratuity, emergency cash)
  access: Access; unlock?: string | null; accessNote?: string
  goalIds: string[]
  raw: any
}

const mixOf = (equity: number, debt = 0, gold = 0, cash = 0): Record<Cls, number> => ({ equity, debt, gold, cash })
const NONE = mixOf(0)
const cur = (c: any): Cur => (c === 'AED' || c === 'USD' ? 'AED' : 'INR')
const within = (d: string | null | undefined, today: string, days: number) => !!d && (Date.parse(d) - Date.parse(today)) / 864e5 <= days

// What a mutual fund holds, from its type and name
export function fundMix(m: any): Record<Cls, number> {
  const t = String(m.fund_type ?? '').toLowerCase(), n = String(m.fund_name ?? '').toLowerCase()
  if (/gold|silver/.test(n)) return mixOf(0, 0, 1)
  if (t === 'liquid' || /liquid|overnight|money market/.test(n)) return mixOf(0, 0, 0, 1)
  if (t === 'debt' || /gilt|bond|debt|duration|corporate|banking & psu|credit risk|dynamic bond/.test(n)) return mixOf(0, 1)
  if (t === 'hybrid' || /hybrid|balanced|advantage|multi asset|equity savings|arbitrage/.test(n)) return /arbitrage/.test(n) ? mixOf(0, 0, 0, 1) : /aggressive/.test(n) ? mixOf(0.7, 0.3) : /multi asset/.test(n) ? mixOf(0.5, 0.3, 0.2) : mixOf(0.5, 0.5)
  return mixOf(1)
}
const etfMix = (e: any) => { const s = `${e.etf_type ?? ''} ${e.etf_name ?? ''}`.toLowerCase(); return /gold|silver/.test(s) ? mixOf(0, 0, 1) : /liquid/.test(s) ? mixOf(0, 0, 0, 1) : /debt|bond|gilt|bharat bond/.test(s) ? mixOf(0, 1) : mixOf(1) }

export function portfolioHoldings(h: Holdings, links: { goal_id: string; investment_type: string; investment_id: string }[] = [], today = h.today ?? new Date().toISOString().slice(0, 10)): PHolding[] {
  const goalsOf = (table: string, id: string) => links.filter(l => l.investment_type === table && l.investment_id === id).map(l => l.goal_id)
  const out: PHolding[] = []
  const add = (table: string, type: string, r: any, p: Omit<PHolding, 'key' | 'type' | 'id' | 'goalIds' | 'raw' | 'currency'> & { currency?: Cur }) =>
    out.push({ key: `${table}:${r.id}`, type, id: r.id, goalIds: goalsOf(table, r.id), raw: r, currency: p.currency ?? cur(r.currency), ...p })

  for (const a of h.accounts ?? []) if (a.account_type !== 'credit_card' && a.is_active !== false) {
    const v = Math.max(0, Number(a.current_balance) || 0)
    add('accounts', 'bank', a, { name: a.name, sub: a.bank_name ?? 'Bank & cash', value: v, cost: v, mix: mixOf(0, 0, 0, 1), investable: true, access: 'now' })
  }
  for (const s of h.stocks ?? []) add('stocks', 'stock', s, { name: s.name || s.symbol, sub: s.sector || 'Shares', value: V.stock(s), cost: C.stock(s), mix: mixOf(1), investable: true, access: 'week', accessNote: 'Sell, and it settles the next working day' })
  for (const m of h.mutualFunds ?? []) {
    const mix = fundMix(m), elss = String(m.fund_type).toLowerCase() === 'elss' || /elss|tax saver/i.test(m.fund_name ?? '')
    add('mutual_funds', 'mf', m, { name: m.fund_name, sub: elss ? 'ELSS (tax saver)' : String(m.fund_type ?? 'fund'), value: V.mf(m), cost: C.mf(m), mix, investable: true,
      access: elss ? 'locked' : mix.cash === 1 ? 'now' : 'week', accessNote: elss ? 'Each purchase is locked for 3 years' : mix.cash === 1 ? 'Liquid fund — money in a day' : 'Redeem — money in 2–3 working days' })
  }
  for (const e of h.etf ?? []) add('etf_investments', 'etf', e, { name: e.etf_name || e.symbol, sub: e.etf_type || 'ETF', value: V.etf(e), cost: C.etf(e), mix: etfMix(e), investable: true, access: 'week' })
  for (const f of h.fixedDeposits ?? []) {
    const soon = within(f.maturity_date, today, 7)
    add('fixed_deposits', 'fd', f, { name: f.name || f.bank_name || 'Fixed deposit', sub: `${f.bank_name ?? 'FD'}${f.interest_rate ? ` · ${f.interest_rate}%` : ''}`, value: V.fd(f), cost: V.fd(f), mix: mixOf(0, 1), investable: true,
      access: soon ? 'now' : 'penalty', unlock: f.maturity_date, accessNote: soon ? 'Matures this week' : 'Breaking it early usually costs about 1% of interest' })
  }
  for (const r of h.recurringDeposits ?? []) add('recurring_deposits', 'rd', r, { name: r.name || r.bank_name || 'Recurring deposit', sub: 'RD', value: V.rd(r), cost: V.rd(r), mix: mixOf(0, 1), investable: true, access: 'penalty', unlock: r.maturity_date, accessNote: 'Closing early lowers the interest' })
  for (const p of h.ppfEpf ?? []) add('ppf_epf_accounts', 'ppf', p, { name: p.name || String(p.kind ?? 'PPF').toUpperCase(), sub: String(p.kind ?? 'ppf').toUpperCase(), value: V.ppf(p), cost: V.ppf(p), mix: mixOf(0, 1), investable: true, access: 'locked', unlock: p.maturity_date,
    accessNote: p.kind === 'epf' ? 'Paid out when you leave the job or retire' : 'Locked for 15 years; part can come out from year 7' })
  for (const n of h.nps ?? []) { const eq = Math.min(1, Math.max(0, (Number(n.equity_allocation) || 50) / 100)); add('nps_accounts', 'nps', n, { name: n.name || 'NPS', sub: `NPS ${n.tier ?? ''}`.trim(), value: V.nps(n), cost: C.nps(n), mix: mixOf(eq, 1 - eq), investable: true, access: 'locked', accessNote: 'Mostly locked until 60' }) }
  for (const g of h.gold ?? []) {
    const sgb = /sgb|sovereign/i.test(`${g.gold_type ?? ''} ${g.name ?? ''}`), physical = /physical|coin|bar|jewel/i.test(`${g.gold_type ?? ''}`)
    add('gold_investments', 'gold', g, { name: g.name || 'Gold', sub: g.gold_type || 'Gold', value: V.gold(g), cost: C.gold(g), mix: mixOf(0, 0, 1), investable: true,
      access: sgb ? 'penalty' : 'week', accessNote: sgb ? 'Sell on the exchange (thin trading) or redeem from year 5' : physical ? 'Sell to a jeweller or bank' : undefined })
  }
  for (const b of h.bonds ?? []) { const sgb = /sgb|sovereign gold/i.test(`${b.bond_type ?? ''} ${b.name ?? ''}`); add('bond_investments', 'bond', b, { name: b.name || 'Bond', sub: b.bond_type || 'Bond', value: V.bond(b), cost: C.bond(b), mix: sgb ? mixOf(0, 0, 1) : mixOf(0, 1), investable: true, access: 'penalty', unlock: b.maturity_date, accessNote: 'Sell on the exchange (may be below face value) or wait for maturity' }) }
  for (const l of h.lic ?? []) add('lic_policies', 'lic', l, { name: l.name || l.plan_name || 'LIC policy', sub: 'LIC', value: V.lic(l), cost: V.lic(l), mix: mixOf(0, 1), investable: true, access: 'locked', unlock: l.maturity_date, accessNote: 'Surrendering early returns less than you paid in' })
  for (const a of (h.otherAssets ?? []).filter(a => a.is_active !== false)) {
    const k = otherKind(a.kind), v = otherAssetValue(a, today)
    const mix = k.group === 'equity' ? mixOf(1) : k.key === 'jewellery' ? mixOf(0, 0, 1) : k.key === 'crypto' ? mixOf(1) : NONE
    add('other_assets', 'other', a, { name: a.name, sub: k.label, value: v.value, cost: v.cost, currency: v.currency, mix,
      investable: k.group === 'equity' || k.key === 'crypto', access: k.group === 'equity' || k.key === 'crypto' ? 'week' : k.key === 'jewellery' ? 'week' : 'locked',
      accessNote: k.group === 'property' ? 'Selling takes months' : k.key === 'vehicle' ? 'Sell the car' : undefined })
  }
  const grat = h.gratuity?.include === false ? 0 : gratuityValue(h.gratuity, today)
  if (grat > 0) out.push({ key: 'gratuity', type: 'gratuity', id: 'gratuity', name: 'UAE gratuity', sub: 'End of service', currency: 'AED', value: grat, cost: grat, mix: NONE, investable: false, access: 'locked', accessNote: 'Paid when you leave your job', goalIds: [], raw: h.gratuity })
  return out.filter(x => x.value > 0)
}

// ── Mix, money by access, currency ───────────────────────────────────────────
export const toInr = (v: number, c: Cur, fx: number) => (c === 'AED' ? v * fx : v)

// What the investable money holds, in ₹ (AED at today's rate). Bank cash
// beyond `keepCash` (the emergency fund) counts as cash in the mix.
export function mixNow(hs: PHolding[], fx: number, keepCash = 0): { total: number; by: Record<Cls, number>; pct: Record<Cls, number> } {
  const by: Record<Cls, number> = { equity: 0, debt: 0, gold: 0, cash: 0 }
  for (const x of hs.filter(x => x.investable)) for (const c of Object.keys(by) as Cls[]) by[c] += toInr(x.value, x.currency, fx) * x.mix[c]
  by.cash = Math.max(0, by.cash - keepCash)
  const total = Object.values(by).reduce((a, b) => a + b, 0)
  const pct = Object.fromEntries((Object.keys(by) as Cls[]).map(c => [c, total > 0 ? by[c] / total * 100 : 0])) as Record<Cls, number>
  return { total, by, pct }
}
export function byAccess(hs: PHolding[], fx: number): Record<Access, { value: number; items: PHolding[] }> {
  const out = Object.fromEntries((Object.keys(ACCESS) as Access[]).map(a => [a, { value: 0, items: [] as PHolding[] }])) as Record<Access, { value: number; items: PHolding[] }>
  for (const x of hs) { out[x.access].value += toInr(x.value, x.currency, fx); out[x.access].items.push(x) }
  return out
}
export function byCurrency(hs: PHolding[], fx: number) {
  const aed = hs.filter(x => x.currency === 'AED').reduce((s, x) => s + x.value, 0), inr = hs.filter(x => x.currency === 'INR').reduce((s, x) => s + x.value, 0)
  const total = aed * fx + inr
  return { aed, inr, total, aedPct: total > 0 ? aed * fx / total * 100 : 0, inrPct: total > 0 ? inr / total * 100 : 0 }
}
