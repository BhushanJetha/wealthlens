// Goals engine: what a goal is worth today, what it will cost by its date
// (prices rise), what it needs each month (money grows), whether your actual
// pace gets you there, and how your monthly saving can fund every goal.
// Shared by the Goals list, goal pages and Home. Every return is an
// assumption and is labelled as one; each goal stays in its own currency.

export type Cur = 'AED' | 'INR'
export type Horizon = 'short' | 'mid' | 'long'

// ── Horizon: how far away the goal is ────────────────────────────────────────
export const HORIZON: Record<Horizon, { label: string; range: string; color: string; bg: string; fit: string }> = {
  short: { label: 'Short term', range: 'under 2 years', color: '#B45309', bg: '#FFF2E2', fit: 'Keep it safe and easy to reach — savings account, FDs, liquid or debt funds.' },
  mid:   { label: 'Mid term', range: '2–5 years', color: '#1D5FA8', bg: '#E7F1FE', fit: 'Mostly steady (FDs, debt or hybrid funds) with some equity.' },
  long:  { label: 'Long term', range: '5+ years', color: '#1E7A50', bg: '#E7F7EF', fit: 'Equity funds through SIPs can do the heavy lifting; review once a year.' },
}
export const monthsUntil = (date: string, today: string) => {
  const [y1, m1, d1] = today.slice(0, 10).split('-').map(Number), [y2, m2, d2] = String(date).slice(0, 10).split('-').map(Number)
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1))
}
export const horizonOf = (months: number): Horizon => (months <= 24 ? 'short' : months <= 60 ? 'mid' : 'long')

// ── Goal types ───────────────────────────────────────────────────────────────
export type Kind = 'emergency' | 'retirement' | 'education' | 'home' | 'car' | 'travel' | 'wedding' | 'family' | 'health' | 'business' | 'purchase' | 'other'
export const KINDS: { key: Kind; label: string; icon: string; color: string; inflation: Record<Cur, number>; why: string }[] = [
  { key: 'emergency',  label: 'Emergency fund', icon: '🛟', color: '#E4573D', inflation: { INR: 0, AED: 0 },  why: 'Job loss, a medical bill or an urgent flight home — without selling investments.' },
  { key: 'retirement', label: 'Retirement / return to India', icon: '🌴', color: '#6A55E8', inflation: { INR: 6, AED: 3 }, why: 'The earlier you start, the more compounding does the work.' },
  { key: 'education',  label: 'Education', icon: '🎓', color: '#3B8EF0', inflation: { INR: 10, AED: 5 }, why: 'School and college fees rise faster than most prices.' },
  { key: 'home',       label: 'Home', icon: '🏠', color: '#2FB67C', inflation: { INR: 6, AED: 4 }, why: 'A bigger down payment means a smaller loan and EMI.' },
  { key: 'car',        label: 'Car', icon: '🚗', color: '#0891B2', inflation: { INR: 5, AED: 3 }, why: 'Pay cash, or most of it, instead of a costly car loan.' },
  { key: 'travel',     label: 'Travel / trip home', icon: '✈️', color: '#F29A2E', inflation: { INR: 6, AED: 3 }, why: 'Saving ahead beats paying card interest after the trip.' },
  { key: 'wedding',    label: 'Wedding', icon: '💍', color: '#EC5B8C', inflation: { INR: 7, AED: 4 }, why: 'A big one-off cost — spread it over the years before.' },
  { key: 'family',     label: 'Family support', icon: '👪', color: '#7C3AED', inflation: { INR: 6, AED: 3 }, why: 'For parents, siblings or a family event in India.' },
  { key: 'health',     label: 'Health', icon: '🩺', color: '#DC2626', inflation: { INR: 10, AED: 6 }, why: 'Medical costs rise fast; insurance doesn\'t cover everything.' },
  { key: 'business',   label: 'Business', icon: '💼', color: '#475569', inflation: { INR: 6, AED: 3 }, why: 'Seed money for your own venture.' },
  { key: 'purchase',   label: 'Big purchase', icon: '🛍️', color: '#DB2777', inflation: { INR: 4, AED: 2 }, why: 'Phone, furniture, a renovation — bought without debt.' },
  { key: 'other',      label: 'Other', icon: '🎯', color: '#6A55E8', inflation: { INR: 5, AED: 3 }, why: 'Anything that matters to you.' },
]
export const kindInfo = (k: Kind) => KINDS.find(x => x.key === k) ?? KINDS[KINDS.length - 1]
// A goal's type: chosen, or worked out from its older category and name
export function kindOf(g: any): Kind {
  if (g.kind && KINDS.some(k => k.key === g.kind)) return g.kind
  const n = String(g.name ?? '').toLowerCase()
  if (g.category === 'emergency' || /emergenc|rainy/.test(n)) return 'emergency'
  if (g.category === 'retirement' || /retire|pension|return to india|fire\b/.test(n)) return 'retirement'
  if (/educat|school|college|universit|fees/.test(n)) return 'education'
  if (g.category === 'real_estate' || /home|house|flat|apartment|property|villa|plot/.test(n)) return 'home'
  if (/\bcar\b|vehicle|bike/.test(n)) return 'car'
  if (/travel|trip|vacation|holiday|flight/.test(n)) return 'travel'
  if (/wedding|marriage/.test(n)) return 'wedding'
  if (/parent|family|mother|father/.test(n)) return 'family'
  if (/medical|health|hospital/.test(n)) return 'health'
  if (/business|startup|venture/.test(n)) return 'business'
  return 'other'
}
export const PRIORITY: Record<number, string> = { 1: 'Must have', 2: 'Important', 3: 'Nice to have' }

// ── Assumptions ──────────────────────────────────────────────────────────────
// Yearly return assumed by horizon (a mix that suits it), per currency
const RETURN: Record<Cur, Record<Horizon, number>> = { INR: { short: 6.5, mid: 9, long: 11 }, AED: { short: 4, mid: 6, long: 8 } }
export const returnOf = (g: any, h: Horizon) => (g.return_pct != null && g.return_pct !== '' ? Number(g.return_pct) : RETURN[(g.currency as Cur) ?? 'INR'][h])
export const inflationOf = (g: any) => (g.inflation_pct != null && g.inflation_pct !== '' ? Number(g.inflation_pct) : kindInfo(kindOf(g)).inflation[(g.currency as Cur) ?? 'INR'])

// ── Money maths (monthly) ────────────────────────────────────────────────────
const fv = (pv: number, r: number, n: number) => pv * Math.pow(1 + r, n)
const annuity = (pmt: number, r: number, n: number) => (r > 0 ? pmt * (Math.pow(1 + r, n) - 1) / r : pmt * n)
// Monthly amount that grows `pv` to `target` in `n` months at monthly rate r
export function pmtFor(target: number, pv: number, r: number, n: number) {
  if (n <= 0) return Math.max(0, target - pv)
  const left = target - fv(pv, r, n)
  if (left <= 0) return 0
  return r > 0 ? left * r / (Math.pow(1 + r, n) - 1) : left / n
}
// Months until `pv` plus `pmt` a month reaches the target (which itself grows with prices)
export function monthsToReach(target: number, pv: number, pmt: number, annualRet: number, annualInfl: number, cap = 600) {
  const r = annualRet / 1200, i = Math.pow(1 + annualInfl / 100, 1 / 12) - 1
  let v = pv, t = target
  for (let m = 0; m <= cap; m++) {
    if (v >= t) return m
    v = v * (1 + r) + pmt; t = t * (1 + i)
  }
  return null
}

// ── Value of a goal today ────────────────────────────────────────────────────
export interface Ctx {
  links: { goal_id: string; investment_type: string; investment_id: string; allocation_pct?: number | null }[]
  investments: Record<string, any[]>
  contributions: { goal_id: string; amount: number; currency?: string; contrib_date: string }[]
  accounts: any[]               // live balances (lib/ledger)
  invTxns?: { asset_id: string; txn_type: string; txn_date: string; amount: number }[]
  fx: number
}
export function investmentValue(type: string, rec: any): number {
  if (type === 'stocks') return (Number(rec.quantity) || 0) * (Number(rec.current_price ?? rec.avg_buy_price) || 0)
  if (type === 'mutual_funds') return (Number(rec.units) || 0) * (Number(rec.current_nav ?? rec.avg_nav) || 0)
  if (type === 'etf_investments') return (Number(rec.units) || 0) * (Number(rec.current_price || rec.avg_buy_price) || 0) || Number(rec.invested_amount) || 0
  if (type === 'fixed_deposits') return Number(rec.principal) || 0
  if (type === 'recurring_deposits') {
    if (rec.current_amount != null) return Number(rec.current_amount) || 0
    const s = String(rec.start_date ?? rec.created_at ?? '').slice(0, 7)
    const [y, m] = s.split('-').map(Number), now = new Date()
    const months = y ? Math.max(0, (now.getFullYear() - y) * 12 + now.getMonth() + 1 - m) : 0
    return months * (Number(rec.monthly_amount) || 0)
  }
  if (type === 'nps_accounts') return Number(rec.corpus_amount ?? rec.invested_amount) || 0
  if (type === 'lic_policies') return Number(rec.total_paid) || 0
  if (type === 'gold_investments') return rec.quantity_grams && rec.current_price_per_gram ? Number(rec.quantity_grams) * Number(rec.current_price_per_gram) : Number(rec.invested_amount) || 0
  return Number(rec.invested_amount ?? rec.current_value) || 0
}
// Share of a holding that's equity (risk), for the mix check
export function equityShare(type: string, rec: any): number {
  if (type === 'stocks') return 1
  if (type === 'etf_investments') return /gold|debt|bond|liquid/i.test(`${rec.etf_type ?? ''} ${rec.etf_name ?? ''}`) ? 0 : 1
  if (type === 'mutual_funds') {
    const t = String(rec.fund_type ?? '').toLowerCase()
    return t === 'hybrid' ? 0.5 : ['debt', 'liquid'].includes(t) ? 0 : 1
  }
  if (type === 'nps_accounts') return 0.5
  return 0
}
const isGold = (type: string, rec: any) => type === 'gold_investments' || (type === 'etf_investments' && /gold/i.test(`${rec.etf_type ?? ''} ${rec.etf_name ?? ''}`))
const kindOfAccount = (a: any) => (a?.account_type === 'credit_card' ? 'card' : a?.account_type === 'wallet' ? 'cash' : 'bank')
// Emergency funds count bank & cash unless switched off (before migration 030 there's no switch)
export const tracksCash = (g: any) => (g.track_cash ?? (kindOf(g) === 'emergency')) === true

export interface Holding { type: string; id: string; name: string; value: number; pct: number; equity: number }
export interface GoalValue { value: number; equity: number; gold: number; safe: number; holdings: Holding[]; account: number; added: number; cash: number }
export function goalValue(g: any, ctx: Ctx): GoalValue {
  const cur: Cur = g.currency === 'AED' ? 'AED' : 'INR'
  const to = (v: number, from: string) => (from === cur ? v : cur === 'INR' ? v * ctx.fx : v / ctx.fx)
  const holdings: Holding[] = []
  let equity = 0, gold = 0, safe = 0
  for (const l of ctx.links.filter(l => l.goal_id === g.id)) {
    const rec = (ctx.investments[l.investment_type] ?? []).find((r: any) => r.id === l.investment_id)
    if (!rec) continue
    const pct = Number(l.allocation_pct ?? 100)
    const v = to(investmentValue(l.investment_type, rec) * pct / 100, rec.currency ?? 'INR')
    const e = equityShare(l.investment_type, rec)
    holdings.push({ type: l.investment_type, id: rec.id, name: rec.fund_name ?? rec.etf_name ?? rec.name ?? rec.symbol ?? 'Investment', value: v, pct, equity: e })
    if (isGold(l.investment_type, rec)) gold += v; else { equity += v * e; safe += v * (1 - e) }
  }
  // Emergency fund can count your bank & cash balances in its currency
  const cash = tracksCash(g) ? ctx.accounts.filter(a => kindOfAccount(a) !== 'card' && (a.currency === cur) && a.is_active !== false)
    .reduce((s, a) => s + Math.max(0, Number(a.current_balance) || 0), 0) : 0
  const acc = !tracksCash(g) && g.account_id ? ctx.accounts.find(a => a.id === g.account_id) : null
  const account = acc ? to(Math.max(0, Number(acc.current_balance) || 0), acc.currency) : 0
  // Money you added by hand (taken out = negative); already in the bank if cash is tracked
  const added = tracksCash(g) ? 0 : ctx.contributions.filter(c => c.goal_id === g.id).reduce((s, c) => s + to(Number(c.amount) || 0, c.currency ?? cur), 0)
  safe += cash + account + Math.max(0, added)
  const value = Math.max(0, holdings.reduce((s, h) => s + h.value, 0) + cash + account + added)
  return { value, equity, gold, safe, holdings, account, added, cash }
}

// Actual money going into a goal each month lately (SIPs and buys into linked
// funds, RD instalments, money added by hand), averaged over 3 months
export function goalPace(g: any, ctx: Ctx, today: string): number {
  const cur: Cur = g.currency === 'AED' ? 'AED' : 'INR'
  const to = (v: number, from: string) => (from === cur ? v : cur === 'INR' ? v * ctx.fx : v / ctx.fx)
  const ym = today.slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 4, 1)).toISOString().slice(0, 7)    // 3 complete months
  const inWindow = (d: string) => d.slice(0, 7) >= from && d.slice(0, 7) < ym
  let total = 0
  for (const l of ctx.links.filter(l => l.goal_id === g.id)) {
    const rec = (ctx.investments[l.investment_type] ?? []).find((r: any) => r.id === l.investment_id)
    if (!rec) continue
    const share = Number(l.allocation_pct ?? 100) / 100
    if (l.investment_type === 'recurring_deposits') { total += to(Number(rec.monthly_amount) || 0, rec.currency ?? 'INR') * share * 3; continue }
    const bought = (ctx.invTxns ?? []).filter(t => t.asset_id === rec.id && ['sip', 'purchase'].includes(t.txn_type) && inWindow(t.txn_date)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const sip = rec.has_sip && Number(rec.sip_amount) > 0 ? Number(rec.sip_amount) * 3 : 0
    total += to(Math.max(bought, sip), rec.currency ?? 'INR') * share
  }
  if (!tracksCash(g)) total += ctx.contributions.filter(c => c.goal_id === g.id && Number(c.amount) > 0 && inWindow(c.contrib_date)).reduce((s, c) => s + to(Number(c.amount), c.currency ?? cur), 0)
  return total / 3
}

// ── The plan for one goal ────────────────────────────────────────────────────
export type GoalStatus = 'achieved' | 'paused' | 'new' | 'on_track' | 'behind'
export interface Plan {
  months: number; horizon: Horizon; inflation: number; ret: number
  futureTarget: number                 // target in money of the target date
  pct: number                          // value ÷ future target
  need: number                         // a month, at the assumed return
  needRange: { cautious: number; optimistic: number }
  pace: number
  projected: number                    // at the target date, at today's pace
  projectedRange: { cautious: number; optimistic: number }
  gap: number                          // projected − future target (+ ahead, − behind)
  reachAt: number | null               // months to reach at today's pace
  status: GoalStatus
  maxEquity: number                    // suggested equity share for the time left
}
export function goalPlan(g: any, value: number, pace: number, today: string): Plan {
  const months = monthsUntil(g.target_date, today), horizon = horizonOf(months)
  const inflation = inflationOf(g), ret = returnOf(g, horizon)
  const futureTarget = Number(g.target_amount) * Math.pow(1 + inflation / 100, months / 12)
  const at = (rate: number) => fv(value, rate / 1200, months) + annuity(pace, rate / 1200, months)
  const need = pmtFor(futureTarget, value, ret / 1200, months)
  const projected = at(ret)
  const status: GoalStatus = g.status === 'achieved' || value >= futureTarget ? 'achieved' : g.status === 'paused' ? 'paused'
    : value <= 0 && pace <= 0 ? 'new' : projected >= futureTarget * 0.98 ? 'on_track' : 'behind'
  return {
    months, horizon, inflation, ret, futureTarget, pct: futureTarget > 0 ? Math.min(100, value / futureTarget * 100) : 0,
    need, needRange: { cautious: pmtFor(futureTarget, value, Math.max(ret - 3, 0) / 1200, months), optimistic: pmtFor(futureTarget, value, (ret + 3) / 1200, months) },
    pace, projected, projectedRange: { cautious: at(Math.max(ret - 3, 0)), optimistic: at(ret + 3) },
    gap: projected - futureTarget, reachAt: monthsToReach(Number(g.target_amount), value, pace, ret, inflation),
    status, maxEquity: months < 24 ? 10 : months < 36 ? 30 : months < 60 ? 50 : months < 84 ? 70 : 80,
  }
}

// ── Funding plan: what you save vs what the goals need ───────────────────────
// Goals in priority order (emergency fund first, then Must have → Nice to
// have, then the nearest date) each take what they need from the monthly
// saving until it runs out. A goal that doesn't fit gets two ways out: the
// date it would reach with what's left for it, or the target it could reach
// by its date.
export interface Funding { goal: any; need: number; given: number; fits: boolean; newMonths: number | null; reachableToday: number }
export function fundingPlan(items: { goal: any; value: number; plan: Plan }[], capacity: number): { rows: Funding[]; need: number; spare: number } {
  const active = items.filter(x => x.plan.status !== 'achieved' && x.plan.status !== 'paused')
  const order = [...active].sort((a, b) =>
    Number(kindOf(b.goal) === 'emergency') - Number(kindOf(a.goal) === 'emergency')
    || (Number(a.goal.priority ?? 2) - Number(b.goal.priority ?? 2))
    || a.plan.months - b.plan.months)
  let left = Math.max(0, capacity)
  const rows = order.map(({ goal, value, plan }) => {
    const given = Math.min(plan.need, left)
    left -= given
    const fits = given >= plan.need - 0.5
    const newMonths = fits ? null : given > 0 ? monthsToReach(Number(goal.target_amount), value, given, plan.ret, plan.inflation) : null
    const by = fv(value, plan.ret / 1200, plan.months) + annuity(given, plan.ret / 1200, plan.months)
    return { goal, need: plan.need, given, fits, newMonths, reachableToday: by / Math.pow(1 + plan.inflation / 100, plan.months / 12) }
  })
  return { rows, need: rows.reduce((s, r) => s + r.need, 0), spare: left }
}

// One investment shared by goals adding up to more than 100%
export function overAllocated(links: Ctx['links']): { type: string; id: string; pct: number }[] {
  const by: Record<string, number> = {}
  for (const l of links) by[`${l.investment_type}::${l.investment_id}`] = (by[`${l.investment_type}::${l.investment_id}`] ?? 0) + Number(l.allocation_pct ?? 100)
  return Object.entries(by).filter(([, p]) => p > 100.5).map(([k, pct]) => { const [type, id] = k.split('::'); return { type, id, pct } })
}
