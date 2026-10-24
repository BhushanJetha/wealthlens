// Net worth — one calculation shared by the Net Worth tab, the Home dashboard
// and the daily snapshot, so every screen shows the same number.

export type View = 'uae' | 'india' | 'consolidated'

export interface Holdings {
  accounts: any[]; stocks: any[]; mutualFunds: any[]; etf: any[]; nps: any[]
  fixedDeposits: any[]; recurringDeposits: any[]; ppfEpf: any[]; gold: any[]
  bonds: any[]; lic: any[]; loans: any[]
}

// Home groups asset classes into ≤7 buckets for its composition bar. Each group
// owns a fixed colour (validated categorical order — never re-ordered by value).
export type AssetGroup = 'mf' | 'equity' | 'cash' | 'gold' | 'retirement' | 'deposits' | 'other'
export const ASSET_GROUPS: { key: AssetGroup; label: string; color: string }[] = [
  { key: 'mf',         label: 'Mutual funds',     color: '#2a78d6' },
  { key: 'equity',     label: 'Stocks & ETF',     color: '#eb6834' },
  { key: 'cash',       label: 'Bank & cash',      color: '#1baf7a' },
  { key: 'gold',       label: 'Gold',             color: '#eda100' },
  { key: 'retirement', label: 'PPF, EPF & NPS',   color: '#e87ba4' },
  { key: 'deposits',   label: 'FDs & RDs',        color: '#008300' },
  { key: 'other',      label: 'Bonds & LIC',      color: '#6250d6' },
]

export interface AssetRow { key: string; label: string; value: number; invested: number; color: string; group: AssetGroup }
export interface LiabRow  { key: string; label: string; value: number; color: string }

export interface NetWorth {
  assetRows: AssetRow[]; liabRows: LiabRow[]
  totalAssets: number; totalInvested: number; totalLiab: number; netWorth: number
  cash: number            // bank & cash only — the emergency-fund base
}

// View / FX aware value of one amount in a given currency
export function viewAmount(amt: number, cur: string, view: View, fx: number) {
  const a = Number(amt) || 0
  const c = cur || 'INR'
  if (view === 'consolidated') return c === 'AED' ? a * fx : a
  if (view === 'uae') return c === 'AED' ? a : 0
  return c === 'INR' ? a : 0    // india
}

export function computeNetWorth(h: Holdings, view: View, fx: number): NetWorth {
  const disp = (amt: number, cur: string) => viewAmount(amt, cur, view, fx)
  const sumBy = (rows: any[], val: (r: any) => number) =>
    (rows ?? []).reduce((s, r) => s + disp(val(r), r.currency || 'INR'), 0)

  // Bank & cash = all non-credit-card accounts
  const bankCash = (h.accounts ?? []).filter(a => a.account_type !== 'credit_card')
  const cards    = (h.accounts ?? []).filter(a => a.account_type === 'credit_card')

  // Current value of each holding — computed exactly as each category page does
  // (these tables have no single "current_value" column; it's units × live price
  // etc.), so we never fall back to 0 the way column-name reads did.
  // Bank/cash balance lives in current_balance (outstanding_bal is 0 for these
  // and holds the DEBT on credit cards). Use || so a 0 falls through, not ??.
  const bankVal  = sumBy(bankCash,            a => Number(a.current_balance) || Number(a.outstanding_bal) || 0)
  const stockVal = sumBy(h.stocks,            x => Number(x.quantity || 0) * Number(x.current_price ?? x.avg_buy_price ?? 0))
  const mfVal    = sumBy(h.mutualFunds,       m => Number(m.units || 0) * Number(m.current_nav ?? m.avg_nav ?? 0))
  const etfVal   = sumBy(h.etf,               e => Number(e.units || 0) * Number(e.current_price ?? e.avg_buy_price ?? 0))
  const npsVal   = sumBy(h.nps,               n => Number(n.corpus_amount) || Number(n.invested_amount) || Number(n.current_value) || 0)
  const fdVal    = sumBy(h.fixedDeposits,     f => Number(f.principal ?? f.principal_amount ?? 0))
  const rdVal    = sumBy(h.recurringDeposits, r => r.current_amount != null ? Number(r.current_amount) : Number(r.monthly_amount || 0) * Number(r.months_paid || 0))
  const ppfVal   = sumBy(h.ppfEpf,            x => Number(x.current_balance ?? x.balance ?? 0))
  const goldVal  = sumBy(h.gold,              g => (g.current_price_per_gram && g.quantity_grams) ? Number(g.current_price_per_gram) * Number(g.quantity_grams) : Number(g.invested_amount ?? 0))
  const bondVal  = sumBy(h.bonds,             b => Number(b.current_value ?? b.invested_amount ?? 0))
  const licVal   = sumBy(h.lic,               l => Number(l.total_paid ?? 0))

  // Invested (cost basis) per segment — for the invested-vs-current view
  const stockInv = sumBy(h.stocks,            x => Number(x.quantity || 0) * Number(x.avg_buy_price ?? 0))
  const mfInv    = sumBy(h.mutualFunds,       m => Number(m.invested_amount) || Number(m.units || 0) * Number(m.avg_nav ?? 0))
  const etfInv   = sumBy(h.etf,               e => Number(e.invested_amount) || Number(e.units || 0) * Number(e.avg_buy_price ?? 0))
  const npsInv   = sumBy(h.nps,               n => Number(n.invested_amount) || Number(n.corpus_amount ?? 0))
  const goldInv  = sumBy(h.gold,              g => Number(g.invested_amount ?? 0))
  const bondInv  = sumBy(h.bonds,             b => Number(b.invested_amount ?? b.current_value ?? 0))

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
  ] as AssetRow[]).filter(r => r.value > 0).sort((a, b) => b.value - a.value)

  const liabRows: LiabRow[] = [
    { key: 'loans', label: 'Loans',        value: sumBy(h.loans, l => Number(l.outstanding_amt) || 0), color: '#DC2626' },
    { key: 'cards', label: 'Credit Cards', value: sumBy(cards,   c => Number(c.outstanding_bal) || 0), color: '#F97316' },
  ].filter(r => r.value > 0).sort((a, b) => b.value - a.value)

  const totalAssets   = assetRows.reduce((s, r) => s + r.value, 0)
  const totalInvested = assetRows.reduce((s, r) => s + r.invested, 0)
  const totalLiab     = liabRows.reduce((s, r) => s + r.value, 0)
  return { assetRows, liabRows, totalAssets, totalInvested, totalLiab, netWorth: totalAssets - totalLiab, cash: bankVal }
}

// Asset rows rolled up into the fixed Home groups (fixed order, empty dropped)
export function groupAssets(rows: AssetRow[]) {
  return ASSET_GROUPS
    .map(g => ({ ...g, value: rows.filter(r => r.group === g.key).reduce((s, r) => s + r.value, 0) }))
    .filter(g => g.value > 0)
}
