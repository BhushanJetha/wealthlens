// One holding, any kind: what it's worth, what went in, its yearly return,
// the facts worth showing, when it matures, tax if you sold today and where it
// could go. The holding page (/dashboard/investments/h/<type>/<id>) renders
// this for every type, valued with the same functions as Net worth.
import { holdingValue, holdingCost } from './netWorth'

export type HType = 'mutual_funds' | 'stocks' | 'etf_investments' | 'fixed_deposits' | 'recurring_deposits' | 'bond_investments'
  | 'ppf_epf_accounts' | 'nps_accounts' | 'gold_investments' | 'lic_policies'
type Cur = 'AED' | 'INR'

// type → its label, its list page, its key in holdingValue, and its asset_type in investment_transactions
export const HTYPES: Record<HType, { label: string; plural: string; list: string; key: keyof typeof holdingValue; asset?: string }> = {
  mutual_funds:       { label: 'Mutual fund', plural: 'Mutual funds', list: '/dashboard/investments/mutual-funds', key: 'mf', asset: 'mutual_fund' },
  stocks:             { label: 'Share', plural: 'Stocks', list: '/dashboard/stocks', key: 'stock', asset: 'stock' },
  etf_investments:    { label: 'ETF', plural: 'ETFs', list: '/dashboard/investments/etf', key: 'etf', asset: 'etf' },
  fixed_deposits:     { label: 'Fixed deposit', plural: 'Fixed deposits', list: '/dashboard/investments/fixed-deposits', key: 'fd' },
  recurring_deposits: { label: 'Recurring deposit', plural: 'Recurring deposits', list: '/dashboard/investments/recurring-deposits', key: 'rd' },
  bond_investments:   { label: 'Bond', plural: 'Bonds / SGB', list: '/dashboard/investments/bonds', key: 'bond' },
  ppf_epf_accounts:   { label: 'PPF / EPF', plural: 'PPF / EPF', list: '/dashboard/investments/ppf-epf', key: 'ppf' },
  nps_accounts:       { label: 'NPS', plural: 'NPS', list: '/dashboard/investments/nps', key: 'nps' },
  gold_investments:   { label: 'Gold', plural: 'Gold', list: '/dashboard/investments/gold', key: 'gold' },
  lic_policies:       { label: 'LIC policy', plural: 'LIC', list: '/dashboard/investments/lic', key: 'lic' },
}
export const isHType = (t: string): t is HType => t in HTYPES
export const holdingHref = (type: HType, id: string) => `/dashboard/investments/h/${type}/${id}`

export function holdingName(type: HType, r: any): string {
  if (type === 'mutual_funds') return r.fund_name ?? 'Fund'
  if (type === 'stocks') return r.name || r.symbol || 'Share'
  if (type === 'etf_investments') return r.etf_name ?? r.name ?? r.symbol ?? 'ETF'
  if (type === 'ppf_epf_accounts') return r.name || String(r.kind ?? 'PPF').toUpperCase()
  return r.name ?? r.plan_name ?? r.bank_name ?? HTYPES[type].label
}

// Typical yearly return for a kind (a WealthLens estimate), for the category
// check and the projection when a holding has no rate of its own
export const BENCH: Record<string, number> = { equity: 12, debt: 7, hybrid: 10, elss: 12, index: 11, liquid: 6, gold: 8, stock: 12, etf: 11, nps: 10 }

export function xirr(cf: { t: number; a: number }[]): number | null {
  if (cf.length < 2) return null
  const s = [...cf].sort((x, y) => x.t - y.t), t0 = s[0].t
  const yf = (t: number) => (t - t0) / (365.25 * 864e5)
  if (!s.some(c => c.a < 0) || !s.some(c => c.a > 0)) return null
  if (yf(s[s.length - 1].t) < 0.25) return null            // too short to annualise honestly
  const npv = (r: number) => s.reduce((a, c) => a + c.a / Math.pow(1 + r, yf(c.t)), 0)
  let lo = -0.999, hi = 10, flo = npv(lo)
  if (isNaN(flo) || flo * npv(hi) > 0) return null
  for (let i = 0; i < 120; i++) { const m = (lo + hi) / 2, fm = npv(m); if (!isFinite(fm)) return null; if (Math.abs(fm) < 1e-7) return Math.round(m * 1000) / 10; if (flo * fm < 0) hi = m; else { lo = m; flo = fm } }
  const r = ((lo + hi) / 2) * 100
  return r > -99 && r < 1000 ? Math.round(r * 10) / 10 : null
}

const BUY = new Set(['purchase', 'sip', 'switch_in'])
const SELL = new Set(['redemption', 'switch_out'])
const ms = (d: string) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`)
const monthsBetween = (a: string, b: string) => Math.max(0, Math.round((ms(b) - ms(a)) / (30.44 * 864e5)))

export interface Lot { id: string | null; date: string; kind: 'SIP' | 'Lump sum' | 'Opening' | 'Sold' | 'Dividend' | 'Other'; units: number | null; price: number | null; amount: number; raw: any }
export interface Maturity { date: string | null; amount: number | null; rate: number | null; monthsLeft: number | null }
export interface Tax { kind: 'equity' | 'debt' | 'gold'; longGain: number; shortGain: number; tax: number | null; note: string }
export interface HoldingModel {
  type: HType; name: string; sub: string; currency: Cur
  value: number; cost: number; gain: number; gainPct: number | null; xirr: number | null
  units: number | null; avg: number | null; price: number | null; since: string | null
  facts: [string, string][]; lots: Lot[]; maturity: Maturity | null; tax: Tax | null
  rate: number; sip: { amount: number; day: number | null } | null
  chart: { kind: 'nav'; code: number | null } | { kind: 'price'; symbol: string } | null
  share?: number
}

const rateOf = (fundType: string) => BENCH[String(fundType ?? '').toLowerCase()] ?? 12
const isGold = (r: any) => /gold|silver/i.test(`${r.fund_name ?? ''} ${r.etf_name ?? ''} ${r.etf_type ?? ''} ${r.fund_type ?? ''}`)
const isDebt = (r: any) => /debt|liquid|bond|gilt|money market|overnight/i.test(`${r.fund_type ?? ''} ${r.etf_type ?? ''} ${r.fund_name ?? ''}`)

// FD at maturity (quarterly compounding, the Indian bank default) when the bank's figure isn't saved
export function fdMaturity(principal: number, rate: number, start: string, end: string) {
  const years = (ms(end) - ms(start)) / (365.25 * 864e5)
  return principal * Math.pow(1 + rate / 400, 4 * Math.max(0, years))
}
// RD at maturity: each instalment compounds quarterly for the months it has left
export function rdMaturity(monthly: number, rate: number, months: number) {
  let total = 0
  for (let k = 1; k <= months; k++) total += monthly * Math.pow(1 + rate / 400, 4 * k / 12)
  return total
}

export function holdingModel(type: HType, r: any, txns: any[], today: string, opts: { price?: number | null } = {}): HoldingModel {
  const meta = HTYPES[type], cur: Cur = r.currency === 'AED' ? 'AED' : 'INR'
  const priced = opts.price != null && opts.price > 0
  // A fresh price replaces the saved one, for units-based holdings
  const live = priced ? (type === 'mutual_funds' ? { ...r, current_nav: opts.price } : { ...r, current_price: opts.price }) : r
  const value = holdingValue[meta.key](live), cost = holdingCost[meta.key](live)
  const gain = value - cost, gainPct = cost > 0 && value !== cost ? gain / cost * 100 : null
  const mine = txns.filter(t => t.asset_id === r.id).sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))

  // Purchases, with the holding you had before the first recorded one as "Opening"
  const lots: Lot[] = mine.map(t => ({
    id: t.id ?? null, date: String(t.txn_date).slice(0, 10), raw: t, amount: Number(t.amount) || 0,
    units: t.units != null ? Number(t.units) : null, price: t.nav != null ? Number(t.nav) : null,
    kind: t.txn_type === 'sip' ? 'SIP' : BUY.has(t.txn_type) ? 'Lump sum' : SELL.has(t.txn_type) ? 'Sold' : t.txn_type === 'dividend' ? 'Dividend' : 'Other',
  }))
  const unitsNow = type === 'mutual_funds' ? Number(r.units) || 0 : type === 'stocks' ? Number(r.quantity) || 0 : type === 'etf_investments' ? Number(r.units) || 0 : null
  const avg = type === 'mutual_funds' ? Number(r.avg_nav) || null : type === 'stocks' || type === 'etf_investments' ? Number(r.avg_buy_price) || null : null
  const price = type === 'mutual_funds' ? Number(live.current_nav ?? r.avg_nav) || null : type === 'stocks' || type === 'etf_investments' ? Number(live.current_price || r.avg_buy_price) || null : null
  if (unitsNow != null) {
    const bought = lots.filter(l => l.kind === 'SIP' || l.kind === 'Lump sum').reduce((s, l) => s + (l.units ?? 0), 0)
    const sold = lots.filter(l => l.kind === 'Sold').reduce((s, l) => s + (l.units ?? 0), 0)
    const opening = unitsNow - bought + sold
    if (opening > 0.001) {
      const spent = lots.filter(l => l.kind === 'SIP' || l.kind === 'Lump sum').reduce((s, l) => s + l.amount, 0)
      const amount = Math.max(0, cost - spent)
      const date = String(r.purchase_date ?? r.created_at ?? lots[0]?.date ?? today).slice(0, 10)
      lots.unshift({ id: null, date: lots[0] && lots[0].date < date ? lots[0].date : date, kind: 'Opening', units: opening, price: amount > 0 ? amount / opening : null, amount, raw: null })
    }
  }
  const start = String(r.start_date ?? r.purchase_date ?? lots[0]?.date ?? r.created_at ?? '').slice(0, 10) || null

  // Yearly return: from the dated money in and out, valued today
  let x: number | null = null
  if (lots.length && value > 0) {
    const cf = lots.filter(l => l.amount > 0).map(l => ({ t: ms(l.date), a: l.kind === 'Sold' || l.kind === 'Dividend' ? l.amount : -l.amount }))
    x = xirr([...cf, { t: ms(today), a: value }])
  } else if (start && cost > 0 && value > 0 && value !== cost && unitsNow != null) {
    x = xirr([{ t: ms(start), a: -cost }, { t: ms(today), a: value }])
  }

  const facts: [string, string][] = []
  const money = (n: number) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')}`
  const num = (n: number, d = 2) => n.toLocaleString('en-IN', { maximumFractionDigits: d })
  const add = (k: string, v: unknown) => { if (v != null && v !== '' && !(typeof v === 'number' && !isFinite(v))) facts.push([k, String(v)]) }
  let maturity: Maturity | null = null, rate = 0, sub = meta.label
  let chart: HoldingModel['chart'] = null, sip: HoldingModel['sip'] = null, tax: Tax | null = null

  if (type === 'mutual_funds') {
    sub = [String(r.fund_type ?? '').replace(/^\w/, c => c.toUpperCase()), r.plan_type].filter(Boolean).join(' · ') || 'Mutual fund'
    add('Invested', money(cost)); add('Units', num(Number(r.units) || 0, 3)); add('Average NAV', avg ? `₹${avg.toFixed(2)}` : null); add('Folio', r.folio_number || null)
    rate = rateOf(isGold(r) ? 'gold' : r.fund_type); chart = { kind: 'nav', code: r.scheme_code ? Number(r.scheme_code) : null }
    if (r.has_sip && Number(r.sip_amount) > 0) sip = { amount: Number(r.sip_amount), day: Number(r.sip_date) || null }
  } else if (type === 'stocks' || type === 'etf_investments') {
    sub = type === 'stocks' ? [r.symbol, r.exchange, r.sector].filter(Boolean).join(' · ') : [r.symbol, r.etf_type].filter(Boolean).join(' · ') || 'ETF'
    add('Invested', money(cost)); add(type === 'stocks' ? 'Shares' : 'Units', num(unitsNow ?? 0, 3)); add('Average price', avg ? `${cur === 'AED' ? 'AED ' : '₹'}${avg.toFixed(2)}` : null)
    rate = type === 'stocks' ? BENCH.stock : isGold(r) ? BENCH.gold : isDebt(r) ? BENCH.debt : BENCH.etf
    if (r.symbol) chart = { kind: 'price', symbol: String(r.symbol) }
  } else if (type === 'fixed_deposits') {
    rate = Number(r.interest_rate) || 0
    const amt = Number(r.maturity_amt) || (r.start_date && r.maturity_date ? fdMaturity(Number(r.principal) || 0, rate, r.start_date, r.maturity_date) : null)
    maturity = { date: r.maturity_date ?? null, amount: amt, rate, monthsLeft: r.maturity_date ? monthsBetween(today, r.maturity_date) : null }
    sub = [r.bank_name, `${rate}% a year`].filter(Boolean).join(' · ')
    add('Principal', money(Number(r.principal) || 0)); add('Interest', `${rate}% a year`); add('Opened', r.start_date); add('Matures', r.maturity_date)
  } else if (type === 'recurring_deposits') {
    rate = Number(r.interest_rate) || 0
    const tenure = Number(r.tenure_months) || (r.start_date && r.maturity_date ? monthsBetween(r.start_date, r.maturity_date) : 0)
    maturity = { date: r.maturity_date ?? null, amount: tenure > 0 ? rdMaturity(Number(r.monthly_amount) || 0, rate, tenure) : null, rate, monthsLeft: r.maturity_date ? monthsBetween(today, r.maturity_date) : null }
    sub = [r.bank_name, `${money(Number(r.monthly_amount) || 0)} a month`].filter(Boolean).join(' · ')
    add('Each month', money(Number(r.monthly_amount) || 0)); add('Paid in so far', money(value)); add('Interest', `${rate}% a year`); add('Tenure', tenure ? `${tenure} months` : null); add('Matures', r.maturity_date)
  } else if (type === 'bond_investments') {
    rate = Number(r.coupon_rate) || 0
    maturity = { date: r.maturity_date ?? null, amount: Number(r.face_value) && Number(r.quantity) ? Number(r.face_value) * Number(r.quantity) : null, rate, monthsLeft: r.maturity_date ? monthsBetween(today, r.maturity_date) : null }
    sub = [r.bond_type, rate ? `${rate}% coupon` : null].filter(Boolean).join(' · ') || 'Bond'
    add('Invested', money(cost)); add('Quantity', r.quantity); add('Coupon', rate ? `${rate}% a year` : null); add('Bought', r.purchase_date); add('Matures', r.maturity_date)
  } else if (type === 'ppf_epf_accounts') {
    rate = Number(r.interest_rate) || (String(r.kind).toLowerCase() === 'epf' ? 8.25 : 7.1)
    maturity = r.maturity_date ? { date: r.maturity_date, amount: null, rate, monthsLeft: monthsBetween(today, r.maturity_date) } : null
    sub = [String(r.kind ?? '').toUpperCase(), r.holder_name].filter(Boolean).join(' · ')
    add('Balance', money(value)); add('Each year', Number(r.annual_contribution) ? money(Number(r.annual_contribution)) : null); add('Interest', `${rate}% a year`); add('Opened', r.start_date); add('Matures', r.maturity_date)
  } else if (type === 'nps_accounts') {
    rate = BENCH.nps
    sub = [r.tier ? `Tier ${r.tier}` : null, r.fund_manager].filter(Boolean).join(' · ') || 'NPS'
    add('Invested', money(cost)); add('Equity', r.equity_allocation != null ? `${r.equity_allocation}%` : null); add('Corporate bonds', r.corporate_bond_allocation != null ? `${r.corporate_bond_allocation}%` : null); add('Government bonds', r.govt_securities_allocation != null ? `${r.govt_securities_allocation}%` : null); add('Started', r.start_date)
  } else if (type === 'gold_investments') {
    rate = BENCH.gold
    sub = [r.gold_type, r.quantity_grams ? `${num(Number(r.quantity_grams))} g` : null].filter(Boolean).join(' · ') || 'Gold'
    add('Invested', money(cost)); add('Grams', r.quantity_grams ? num(Number(r.quantity_grams)) : null); add('Bought at', r.buy_price_per_gram ? `${money(Number(r.buy_price_per_gram))}/g` : null); add('Price now', r.current_price_per_gram ? `${money(Number(r.current_price_per_gram))}/g` : null); add('Bought', r.purchase_date)
  } else if (type === 'lic_policies') {
    sub = [r.plan_name, r.policy_number ? `Policy ${String(r.policy_number).slice(-4)}` : null].filter(Boolean).join(' · ') || 'LIC'
    maturity = { date: r.maturity_date ?? null, amount: (Number(r.sum_assured) || 0) + (Number(r.bonus_accrued) || 0) || null, rate: null, monthsLeft: r.maturity_date ? monthsBetween(today, r.maturity_date) : null }
    add('Paid so far', money(value)); add('Premium', r.annual_premium ? `${money(Number(r.annual_premium))} a year` : null); add('Sum assured', r.sum_assured ? money(Number(r.sum_assured)) : null); add('Bonus so far', Number(r.bonus_accrued) ? money(Number(r.bonus_accrued)) : null); add('Next premium', r.next_premium_date); add('Matures', r.maturity_date)
  }

  // Tax if sold today (India rules, from each purchase's age; an estimate)
  if (cur === 'INR' && (type === 'mutual_funds' || type === 'stocks' || type === 'etf_investments') && price && unitsNow) {
    const kind: Tax['kind'] = isGold(r) ? 'gold' : isDebt(r) ? 'debt' : 'equity'
    const longAfter = kind === 'equity' ? 12 : 24
    let longGain = 0, shortGain = 0, units = 0
    for (const l of lots.filter(l => l.units && l.units > 0 && l.price && l.kind !== 'Sold' && l.kind !== 'Dividend')) {
      const g = l.units! * (price - l.price!)
      if (monthsBetween(l.date, today) >= longAfter) longGain += g; else shortGain += g
      units += l.units!
    }
    if (units === 0 && avg) { if (start && monthsBetween(start, today) >= longAfter) longGain = gain; else shortGain = gain }
    const t = kind === 'equity' ? Math.max(0, longGain - 125000) * 0.125 + Math.max(0, shortGain) * 0.2
      : kind === 'gold' ? Math.max(0, longGain) * 0.125 : null
    tax = { kind, longGain, shortGain, tax: t == null ? null : Math.round(t),
      note: kind === 'equity' ? 'Long-term (a year or more): ₹1.25L of gains a year are tax-free, then 12.5%. Short-term: 20%. This counts it as your only sale this year.'
        : kind === 'gold' ? 'Gold held 2 years or more: 12.5%. Sooner: taxed at your income-tax slab.'
        : 'Debt funds bought after April 2023 are taxed at your income-tax slab, however long you hold them.' }
  }

  return { type, name: holdingName(type, r), sub, currency: cur, value, cost, gain, gainPct, xirr: x, units: unitsNow, avg, price, since: start,
    facts, lots: lots.reverse(), maturity, tax, rate, sip, chart }
}

// Value in N years, with a monthly SIP (or RD), at a yearly rate
export function projectValue(now: number, monthly: number, rate: number, years: number) {
  const r = rate / 1200, n = years * 12
  return r > 0 ? now * Math.pow(1 + r, n) + monthly * ((Math.pow(1 + r, n) - 1) / r) : now + monthly * n
}
