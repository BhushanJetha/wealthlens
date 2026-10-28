// Net worth — one calculation shared by the Net Worth tab, the Home dashboard
// and the daily snapshot, so every screen shows the same number.
import { otherAssetValue, otherKind, gratuityValue, type Gratuity } from './otherAssets'

export type View = 'uae' | 'india' | 'consolidated'

// Bump when a valuation rule changes. Daily snapshots store it, and history
// skips snapshots made under older rules so the line never jumps because the
// maths changed. (2: RDs count instalments since the start date.) New kinds of
// holding (property, other assets, gratuity — 032) aren't a rule change: they
// show up like any holding you add.
export const NW_RULES = 2

export interface Holdings {
  accounts: any[]; stocks: any[]; mutualFunds: any[]; etf: any[]; nps: any[]
  fixedDeposits: any[]; recurringDeposits: any[]; ppfEpf: any[]; gold: any[]
  bonds: any[]; lic: any[]; loans: any[]
  // Migration 032: property, vehicles, jewellery, other investments; UAE gratuity
  otherAssets?: any[]; gratuity?: Gratuity | null; today?: string
}

// Home groups asset classes into ≤7 buckets for its composition bar. Each group
// owns a fixed colour (validated categorical order — never re-ordered by value).
export type AssetGroup = 'mf' | 'equity' | 'cash' | 'gold' | 'retirement' | 'deposits' | 'other' | 'property'
export const ASSET_GROUPS: { key: AssetGroup; label: string; color: string }[] = [
  { key: 'mf',         label: 'Mutual funds',     color: '#2a78d6' },
  { key: 'equity',     label: 'Stocks & ETF',     color: '#eb6834' },
  { key: 'cash',       label: 'Bank & cash',      color: '#1baf7a' },
  { key: 'gold',       label: 'Gold',             color: '#eda100' },
  { key: 'retirement', label: 'Retirement',       color: '#e87ba4' },
  { key: 'deposits',   label: 'FDs & RDs',        color: '#008300' },
  { key: 'other',      label: 'Bonds, LIC & other', color: '#6250d6' },
  { key: 'property',   label: 'Property',         color: '#a0522d' },
]

export interface AssetRow { key: string; label: string; value: number; invested: number; color: string; group: AssetGroup }
export interface LiabRow  { key: string; label: string; value: number; color: string }

export interface NetWorth {
  assetRows: AssetRow[]; liabRows: LiabRow[]
  totalAssets: number; totalInvested: number; totalLiab: number; netWorth: number
  cash: number            // bank & cash only — the emergency-fund base
  investments: { value: number; cost: number }   // what's invested: not cash, property, jewellery, vehicles or gratuity
}
// Rows that are owned but not investments (no "invested" or "gain" on them)
export const NOT_INVESTED = new Set(['bank', 'property', 'jewellery', 'otherAssets', 'gratuity'])

// View / FX aware value of one amount in a given currency
export function viewAmount(amt: number, cur: string, view: View, fx: number) {
  const a = Number(amt) || 0
  const c = cur || 'INR'
  if (view === 'consolidated') return c === 'AED' ? a * fx : a
  if (view === 'uae') return c === 'AED' ? a : 0
  return c === 'INR' ? a : 0    // india
}

// Instalments an RD has taken so far. Uses the recorded count when there is
// one; otherwise counts months from the start date (the first instalment is
// on the start date), capped at the tenure.
export function rdInstalments(r: any, today = new Date()): number {
  const tenure = Number(r.tenure_months) || Infinity
  const monthly = Number(r.monthly_amount) || 0
  if (Number(r.current_amount) > 0 && monthly > 0) return Math.min(Math.round(Number(r.current_amount) / monthly), tenure)
  if (Number(r.months_paid) > 0) return Math.min(Number(r.months_paid), tenure)
  const start = String(r.start_date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(start)) return 0
  const [y, m, d] = start.slice(0, 10).split('-').map(Number)
  const n = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m) + (today.getDate() >= d ? 1 : 0)
  return Math.max(0, Math.min(n, tenure))
}
export function rdPaidIn(r: any, today = new Date()): number {
  if (Number(r.current_amount) > 0) return Number(r.current_amount)
  return (Number(r.monthly_amount) || 0) * rdInstalments(r, today)
}

// Value today and amount put in for ONE holding, in its own currency. Net
// worth, Home, the Investments overview and the category pages all use these,
// so every screen shows the same totals. Cash-like holdings sit at cost.
export const holdingValue = {
  stock: (x: any) => Number(x.quantity || 0) * Number(x.current_price ?? x.avg_buy_price ?? 0),
  mf:    (m: any) => Number(m.units || 0) * Number(m.current_nav ?? m.avg_nav ?? 0),
  etf:   (e: any) => Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0),
  nps:   (n: any) => Number(n.corpus_amount) || Number(n.invested_amount) || Number(n.current_value) || 0,
  fd:    (f: any) => Number(f.principal ?? f.principal_amount ?? 0),
  rd:    (r: any) => rdPaidIn(r),
  ppf:   (x: any) => Number(x.current_balance ?? x.balance ?? 0),
  gold:  (g: any) => (g.current_price_per_gram && g.quantity_grams) ? Number(g.current_price_per_gram) * Number(g.quantity_grams) : Number(g.invested_amount ?? 0),
  bond:  (b: any) => Number(b.current_value || b.invested_amount || 0),
  lic:   (l: any) => Number(l.total_paid ?? 0),
}
export const holdingCost: typeof holdingValue = {
  stock: (x: any) => Number(x.quantity || 0) * Number(x.avg_buy_price ?? 0),
  mf:    (m: any) => Number(m.invested_amount) || Number(m.units || 0) * Number(m.avg_nav ?? 0),
  etf:   (e: any) => Number(e.invested_amount) || Number(e.units || 0) * Number(e.avg_buy_price ?? 0),
  nps:   (n: any) => Number(n.invested_amount) || Number(n.corpus_amount ?? 0),
  fd:    holdingValue.fd,
  rd:    holdingValue.rd,
  ppf:   holdingValue.ppf,
  gold:  (g: any) => Number(g.invested_amount ?? 0),
  bond:  (b: any) => Number(b.invested_amount || b.current_value || 0),
  lic:   holdingValue.lic,
}

export function computeNetWorth(h: Holdings, view: View, fx: number): NetWorth {
  const disp = (amt: number, cur: string) => viewAmount(amt, cur, view, fx)
  const sumBy = (rows: any[], val: (r: any) => number) =>
    (rows ?? []).reduce((s, r) => s + disp(val(r), r.currency || 'INR'), 0)

  // Bank & cash = all non-credit-card accounts
  const bankCash = (h.accounts ?? []).filter(a => a.account_type !== 'credit_card')
  const cards    = (h.accounts ?? []).filter(a => a.account_type === 'credit_card')

  // Current value and cost of each kind — see holdingValue / holdingCost.
  // Bank/cash balance lives in current_balance (outstanding_bal is 0 for these
  // and holds the DEBT on credit cards). Use || so a 0 falls through, not ??.
  const V = holdingValue, C = holdingCost
  const bankVal  = sumBy(bankCash, a => Number(a.current_balance) || Number(a.outstanding_bal) || 0)
  const stockVal = sumBy(h.stocks, V.stock),            stockInv = sumBy(h.stocks, C.stock)
  const mfVal    = sumBy(h.mutualFunds, V.mf),          mfInv    = sumBy(h.mutualFunds, C.mf)
  const etfVal   = sumBy(h.etf, V.etf),                 etfInv   = sumBy(h.etf, C.etf)
  const npsVal   = sumBy(h.nps, V.nps),                 npsInv   = sumBy(h.nps, C.nps)
  const fdVal    = sumBy(h.fixedDeposits, V.fd)
  const rdVal    = sumBy(h.recurringDeposits, V.rd)
  const ppfVal   = sumBy(h.ppfEpf, V.ppf)
  const goldVal  = sumBy(h.gold, V.gold),               goldInv  = sumBy(h.gold, C.gold)
  const bondVal  = sumBy(h.bonds, V.bond),              bondInv  = sumBy(h.bonds, C.bond)
  const licVal   = sumBy(h.lic, V.lic)

  // Property & other assets: estimates count at their value (no "gain" is
  // claimed on them); priced investments at units × price against what was paid
  const today = h.today ?? new Date().toISOString().slice(0, 10)
  const other = (h.otherAssets ?? []).filter(a => a.is_active !== false).map(a => ({ a, ...otherAssetValue(a, today), group: otherKind(a.kind).group }))
  const sumOther = (want: (x: typeof other[number]) => boolean, f: (x: typeof other[number]) => number) => other.filter(want).reduce((s, x) => s + disp(f(x), x.currency), 0)
  const propVal = sumOther(x => x.group === 'property', x => x.value)
  const jewVal = sumOther(x => x.group === 'gold', x => x.value)
  const globVal = sumOther(x => x.group === 'equity', x => x.value), globInv = sumOther(x => x.group === 'equity', x => x.cost)
  const restVal = sumOther(x => x.group === 'other', x => x.value), restInv = sumOther(x => x.group === 'other', x => x.estimated ? x.value : x.cost)
  const gratVal = h.gratuity?.include === false ? 0 : disp(gratuityValue(h.gratuity, today), 'AED')

  const assetRows: AssetRow[] = ([
    { key: 'bank',  label: 'Bank & Cash',        value: bankVal,  invested: bankVal,  color: '#16A34A', group: 'cash' },
    { key: 'stock', label: 'Stocks',             value: stockVal, invested: stockInv, color: '#E11D48', group: 'equity' },
    { key: 'mf',    label: 'Mutual Funds',       value: mfVal,    invested: mfInv,    color: '#2563EB', group: 'mf' },
    { key: 'etf',   label: 'ETF',                value: etfVal,   invested: etfInv,   color: '#0EA5E9', group: 'equity' },
    { key: 'nps',   label: 'NPS',                value: npsVal,   invested: npsInv,   color: '#7C3AED', group: 'retirement' },
    { key: 'fd',    label: 'Fixed Deposits',     value: fdVal,    invested: fdVal,    color: '#0284C7', group: 'deposits' },
    { key: 'rd',    label: 'Recurring Deposits', value: rdVal,    invested: rdVal,    color: '#0891B2', group: 'deposits' },
    { key: 'ppf',   label: 'PPF / EPF',          value: ppfVal,   invested: ppfVal,   color: '#059669', group: 'retirement' },
    { key: 'gold',  label: 'Gold',               value: goldVal,  invested: goldInv,  color: '#D97706', group: 'gold' },
    { key: 'bond',  label: 'Bonds / SGB',        value: bondVal,  invested: bondInv,  color: '#9333EA', group: 'other' },
    { key: 'lic',   label: 'LIC',                value: licVal,   invested: licVal,   color: '#DB2777', group: 'other' },
    { key: 'property',  label: 'Property & land',        value: propVal, invested: propVal, color: '#A0522D', group: 'property' },
    { key: 'global',    label: 'Global & UAE investments', value: globVal, invested: globInv, color: '#F97316', group: 'equity' },
    { key: 'jewellery', label: 'Gold jewellery',         value: jewVal,  invested: jewVal,  color: '#CA8A04', group: 'gold' },
    { key: 'otherAssets', label: 'Vehicles & other',     value: restVal, invested: restInv, color: '#64748B', group: 'other' },
    { key: 'gratuity',  label: 'UAE gratuity',           value: gratVal, invested: gratVal, color: '#BE185D', group: 'retirement' },
  ] as AssetRow[]).filter(r => r.value > 0).sort((a, b) => b.value - a.value)

  const liabRows: LiabRow[] = [
    { key: 'loans', label: 'Loans',        value: sumBy(h.loans, l => Number(l.outstanding_amt) || 0), color: '#DC2626' },
    { key: 'cards', label: 'Credit Cards', value: sumBy(cards,   c => Number(c.outstanding_bal) || 0), color: '#F97316' },
  ].filter(r => r.value > 0).sort((a, b) => b.value - a.value)

  const totalAssets   = assetRows.reduce((s, r) => s + r.value, 0)
  const totalInvested = assetRows.reduce((s, r) => s + r.invested, 0)
  const totalLiab     = liabRows.reduce((s, r) => s + r.value, 0)
  const inv = assetRows.filter(r => !NOT_INVESTED.has(r.key))
  return { assetRows, liabRows, totalAssets, totalInvested, totalLiab, netWorth: totalAssets - totalLiab, cash: bankVal,
    investments: { value: inv.reduce((s, r) => s + r.value, 0), cost: inv.reduce((s, r) => s + r.invested, 0) } }
}

// Asset rows rolled up into the fixed Home groups (fixed order, empty dropped)
export function groupAssets(rows: AssetRow[]) {
  return ASSET_GROUPS
    .map(g => ({ ...g, value: rows.filter(r => r.group === g.key).reduce((s, r) => s + r.value, 0) }))
    .filter(g => g.value > 0)
}
