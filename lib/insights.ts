// Rule-based insights for the Home dashboard (no AI). Pure functions over the
// user's data so they're easy to test and reason about. Spend / income follow
// the shared rules in lib/money.ts so numbers always match.
import { isSpend, catOf, labelOf, isIncome as isIncomeIn, spendGroup, prepareMoney } from './money'
import { viewAmount, NW_RULES, type View } from './netWorth'
import { budgetLabel, budgetLines, spendByCategory, carryIn, FIXED, type Cur } from './budgets'

// ─── Dates (string-based so server/browser time zones can't shift a day) ─────
export const ymOf = (d: string) => d?.slice(0, 7) ?? ''
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export const daysInMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }
const utc = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d || 1) }
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000)
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function addMonthsToDate(date: string, n: number) {
  const day = Number(date.slice(8, 10))
  const ym = addMonths(ymOf(date), n)
  return `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`
}
// Roll a recurring due date forward (by `every` months) until it's today or later
export function nextOccurrence(date: string | null | undefined, today: string, every = 1) {
  if (!date) return null
  let d = date.slice(0, 10), guard = 0
  while (d < today && guard++ < 240) d = addMonthsToDate(d, every)
  return d
}
export const fmtDay = (d: string) => new Date(utc(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// ─── Types ────────────────────────────────────────────────────────────────────
export interface InsightInput {
  view: View; fx: number
  today: string        // YYYY-MM-DD (local)
  focusMonth: string   // YYYY-MM — the month the KPIs describe
  txns: any[]          // all txn types, ~13 months
  accounts: any[]; loans: any[]; insurance: any[]; fixedDeposits: any[]; budgets: any[]
  mutualFunds: any[]; stocks: any[]
  cash: number         // bank & cash in view (lib/netWorth)
  invested: { value: number; cost: number }   // market + fixed holdings, excl. cash
}

// baseline = the "usual" figure; comparable = whether a delta vs it is meaningful
export interface Kpi { value: number; baseline: number | null; comparable: boolean }
export interface Attention {
  id: string; severity: 'high' | 'medium' | 'low'
  title: string; detail: string
  href?: string; action?: 'upload'; actionLabel?: string; date?: string
}
export interface Insight { id: string; tone: 'good' | 'warn' | 'neutral'; title: string; detail?: string; href?: string }
export interface Upcoming { id: string; date: string; label: string; sub: string; amount: number; currency: string; kind: 'emi' | 'card' | 'premium' | 'fd' | 'sip' }
export interface CatRow { cat: string; label: string; value: number; baseline: number | null }

export interface ForecastPoint { date: string; value: number }
export interface Forecast { points: ForecastPoint[]; low: ForecastPoint; end: number; lowAfter: string | null }

export interface HomeInsights {
  isCurrent: boolean; dayCut: number | null
  income: Kpi; spend: Kpi
  saved: { value: number; rate: number | null; baselineRate: number | null; comparable: boolean; emi: number; invest: number }
  runway: { months: number | null; avgSpend: number }
  // Averages over the last 3 complete months (savings rate in %)
  trend: { avgIncome: number; avgSpend: number; savingsRate: number | null; months: number }
  categories: CatRow[]
  attention: Attention[]
  insights: Insight[]
  upcoming: Upcoming[]
  forecast: Forecast | null
  savedByMonth: { month: string; saved: number; hasData: boolean }[]
}

const SEV_RANK = { high: 0, medium: 1, low: 2 }
const normMerchant = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)

// Bills & subscriptions: same merchant in ≥3 of the last 4 complete months, a
// steady amount (±15%), and charged at most twice a month (not a supermarket
// you visit every week). Expenses only — remittances and family support are
// money moved, not bills. Shared by Home's insight and the Bills page.
export interface Recurring {
  key: string; name: string; category: string
  n: number            // complete months seen (3 or 4)
  med: number          // usual monthly amount (in `amt` units)
  last: number         // most recent complete month's amount
  day: number          // usual day of the month it's charged
  paidThisMonth: boolean
  rose: number | null  // % the latest month is above usual (≥5%), else null
}
export function findRecurring(txns: any[], thisMonth: string, amt: (t: any) => number): Recurring[] {
  const recentMonths = [1, 2, 3, 4].map(i => addMonths(thisMonth, -i))
  const NOT_BILLS = new Set(['Family Transfer', 'Investment', 'Credit Card Payment'])
  const per: Record<string, { name: string; cats: Record<string, number>; months: Record<string, number>; counts: Record<string, number>; days: number[]; thisMonth: boolean }> = {}
  for (const t of txns) {
    const m = ymOf(t.txn_date)
    if (t.txn_type !== 'expense' || !isSpend(t) || NOT_BILLS.has(t.category)) continue
    const k = normMerchant(t.merchant)
    if (!k) continue
    if (m === thisMonth) { if (per[k]) per[k].thisMonth = true; else per[k] = { name: String(t.merchant).trim(), cats: {}, months: {}, counts: {}, days: [], thisMonth: true }; continue }
    if (!recentMonths.includes(m)) continue
    const e = per[k] ?? (per[k] = { name: String(t.merchant).trim(), cats: {}, months: {}, counts: {}, days: [], thisMonth: false })
    e.months[m] = (e.months[m] ?? 0) + amt(t)
    e.counts[m] = (e.counts[m] ?? 0) + 1
    e.cats[t.category] = (e.cats[t.category] ?? 0) + 1
    e.days.push(Number(String(t.txn_date).slice(8, 10)))
  }
  return Object.entries(per).map(([key, e]) => {
    const vals = Object.values(e.months).sort((a, b) => a - b)
    const med = vals[Math.floor(vals.length / 2)] ?? 0
    const steady = vals.length > 0 && vals.every(v => med > 0 && Math.abs(v - med) / med <= 0.15)
    const billLike = Object.values(e.counts).every(c => c <= 2)
    const latestMonth = recentMonths.find(m => e.months[m] != null)
    const last = latestMonth ? e.months[latestMonth] : 0
    const days = [...e.days].sort((a, b) => a - b)
    const rosePct = med > 0 ? Math.round((last - med) / med * 100) : 0
    return {
      key, name: e.name, n: vals.length, med, last, steady: steady && billLike,
      category: Object.entries(e.cats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other',
      day: days[Math.floor(days.length / 2)] ?? 1, paidThisMonth: e.thisMonth,
      rose: rosePct >= 5 ? rosePct : null,
    }
  }).filter(r => r.n >= 3 && r.steady && r.med > 0)
    .map(({ steady, ...r }) => r)
    .sort((a, b) => b.med - a.med)
}

export function buildHomeInsights(inp: InsightInput): HomeInsights {
  const { view, fx, today, focusMonth } = inp
  const inView = (cur: string) => view === 'consolidated' || (view === 'uae' ? cur === 'AED' : cur === 'INR')
  const amt = (t: any) => viewAmount(Number(t.amount) || 0, t.currency, view, fx)
  // Remittances paired and card bills checked first (over all currencies, so
  // the India view gets its "Received from UAE" income), then the view filter
  const cardIds = new Set<string>((inp.accounts ?? []).filter((a: any) => a.account_type === 'credit_card').map((a: any) => a.id))
  const isIncome = (t: any) => isIncomeIn(t, view)
  const txns = prepareMoney(inp.txns ?? [], { fx, cardIds }).filter(t => t.txn_date && inView(t.currency))
  const thisMonth = ymOf(today)
  const isCurrent = focusMonth === thisMonth
  const dayCut = isCurrent ? Number(today.slice(8, 10)) : null
  // Smallest change worth mentioning, in view units
  const minAbs = view === 'uae' ? 200 : 3000
  const sym = view === 'uae' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

  // Month totals, optionally only up to a day-of-month (for like-for-like pace)
  // spend = spent (living + family); emi and invest kept apart. byCat covers
  // all money out so budgets on EMI / Investment still match.
  function monthStats(m: string, uptoDay: number | null) {
    let income = 0, spend = 0, emi = 0, invest = 0
    const byCat: Record<string, number> = {}
    for (const t of txns) {
      if (ymOf(t.txn_date) !== m) continue
      if (uptoDay != null && Number(t.txn_date.slice(8, 10)) > uptoDay) continue
      if (isIncome(t)) { income += amt(t); continue }
      if (!isSpend(t)) continue
      const v = amt(t), g = spendGroup(t), c = catOf(t)
      byCat[c] = (byCat[c] ?? 0) + v
      if (g === 'loans') emi += v; else if (g === 'invest') invest += v; else spend += v
    }
    return { income, spend, emi, invest, byCat }
  }

  const cur = monthStats(focusMonth, dayCut)
  // Baseline = average of the 3 prior months that have data, cut at the same day
  const priors = [1, 2, 3].map(i => addMonths(focusMonth, -i))
    .map(m => monthStats(m, dayCut == null ? null : Math.min(dayCut, daysInMonth(m))))
    .filter(s => s.income > 0 || s.spend > 0)
  const avg = (f: (s: ReturnType<typeof monthStats>) => number) => priors.length ? priors.reduce((a, s) => a + f(s), 0) / priors.length : null

  // Income lands on fixed dates (salary on the 27th…), so a same-day pace
  // comparison is meaningless mid-month: income and savings are compared with
  // full prior months, and only once the focus month is complete. Spend accrues
  // through the month, so it keeps the like-for-like (same-day) baseline.
  const fullPriors = [1, 2, 3].map(i => monthStats(addMonths(focusMonth, -i), null)).filter(s => s.income > 0 || s.spend > 0)
  const favg = (f: (s: ReturnType<typeof monthStats>) => number) => fullPriors.length ? fullPriors.reduce((a, s) => a + f(s), 0) / fullPriors.length : null
  const rateOf = (inc: number, sp: number) => inc > 0 ? Math.round((inc - sp) / inc * 100) : null
  const fInc = favg(s => s.income), fSp = favg(s => s.spend + s.emi)
  const income: Kpi = { value: cur.income, baseline: fInc, comparable: !isCurrent }
  const spend: Kpi  = { value: cur.spend,  baseline: avg(s => s.spend), comparable: true }
  const saved = {
    value: cur.income - cur.spend - cur.emi, rate: rateOf(cur.income, cur.spend + cur.emi), emi: cur.emi, invest: cur.invest,
    baselineRate: fInc != null && fSp != null ? rateOf(fInc, fSp) : null, comparable: !isCurrent,
  }

  // Full-month averages over the last 3 complete months (emergency fund, savings)
  const full = [1, 2, 3].map(i => monthStats(addMonths(thisMonth, -i), null)).filter(s => s.income > 0 || s.spend > 0)
  // Monthly outgoings for the safety-net runway: spending plus EMIs
  const avgSpendFull = full.length ? full.reduce((a, s) => a + s.spend + s.emi, 0) / full.length : 0
  const avgIncFull   = full.length ? full.reduce((a, s) => a + s.income, 0) / full.length : 0
  const runway = { months: avgSpendFull > 0 ? Math.round(inp.cash / avgSpendFull * 10) / 10 : null, avgSpend: avgSpendFull }

  // Categories for the focus month vs their paced baseline
  const catBase = (c: string) => priors.length ? priors.reduce((a, s) => a + (s.byCat[c] ?? 0), 0) / priors.length : null
  const categories: CatRow[] = Object.entries(cur.byCat)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([cat, value]) => ({ cat, label: labelOf(cat), value, baseline: catBase(cat) }))

  // ─── Needs attention ──────────────────────────────────────────────────────
  const attention: Attention[] = []
  const nativeMoney = (n: number, c: string) => `${c === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString('en-IN')}`
  const inDays = (d: number) => d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`

  // Credit-card bills
  const cards = (inp.accounts ?? []).filter(a => a.account_type === 'credit_card' && inView(a.currency))
  for (const c of cards) {
    const out = Number(c.outstanding_bal) || 0
    if (!c.due_date || out <= 0) continue
    const due = nextOccurrence(c.due_date, today)!
    const d = daysBetween(today, due)
    if (d <= 10) attention.push({
      id: `card-${c.id}`, severity: d <= 3 ? 'high' : 'medium',
      title: `${c.name} bill due ${inDays(d)}`,
      detail: `${nativeMoney(out, c.currency)} outstanding${c.minimum_due ? ` · minimum ${nativeMoney(Number(c.minimum_due), c.currency)}` : ''}`,
      href: '/dashboard/cards', actionLabel: 'View', date: due,
    })
  }
  // Loan EMIs (monthly)
  for (const l of (inp.loans ?? []).filter(l => inView(l.currency))) {
    const due = nextOccurrence(l.next_emi_date, today)
    if (!due) continue
    const d = daysBetween(today, due)
    if (d <= 7) attention.push({
      id: `emi-${l.id}`, severity: d <= 2 ? 'high' : 'medium',
      title: `${l.name} EMI due ${inDays(d)}`,
      detail: `${nativeMoney(Number(l.emi_amount) || 0, l.currency)} · ${l.bank_name ?? ''}`.replace(/ · $/, ''),
      href: l.id ? `/dashboard/loans/detail/${l.id}` : '/dashboard/loans', actionLabel: 'View', date: due,
    })
  }
  // Insurance renewals / premiums
  const FREQ: Record<string, number> = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
  for (const p of (inp.insurance ?? []).filter(p => inView(p.currency))) {
    const exp = p.expiry_date ? daysBetween(today, p.expiry_date) : null
    if (exp != null && exp >= 0 && exp <= 30) {
      attention.push({ id: `exp-${p.id}`, severity: exp <= 7 ? 'high' : 'medium', title: `${p.policy_name} expires ${inDays(exp)}`, detail: `Renew with ${p.provider ?? 'the insurer'} to stay covered`, href: '/dashboard/insurance', actionLabel: 'Review', date: p.expiry_date })
      continue
    }
    const due = nextOccurrence(p.next_premium_date, today, FREQ[p.premium_frequency] ?? 12)
    if (!due) continue
    const d = daysBetween(today, due)
    if (d <= 14) attention.push({ id: `prem-${p.id}`, severity: d <= 3 ? 'high' : 'low', title: `${p.policy_name} premium due ${inDays(d)}`, detail: nativeMoney(Number(p.annual_premium) || 0, p.currency), href: '/dashboard/insurance', actionLabel: 'View', date: due })
  }
  // Fixed deposits maturing / matured
  for (const f of (inp.fixedDeposits ?? []).filter(f => inView(f.currency) && f.maturity_date)) {
    const d = daysBetween(today, f.maturity_date)
    if (d >= -15 && d <= 30) attention.push({
      id: `fd-${f.id}`, severity: d <= 0 ? 'medium' : 'low',
      title: d < 0 ? `${f.name} matured ${-d} day${d === -1 ? '' : 's'} ago` : `${f.name} matures ${inDays(d)}`,
      detail: `${nativeMoney(Number(f.maturity_amt) || Number(f.principal) || 0, f.currency)} · decide to renew or reinvest`,
      href: '/dashboard/investments/fixed-deposits', actionLabel: 'Plan', date: f.maturity_date,
    })
  }
  // Budgets for the focus month — each currency on its own (UAE budgets in
  // AED against AED spending, India budgets in ₹ against ₹), as on Budgets
  const daysLeft = isCurrent ? daysInMonth(focusMonth) - (dayCut ?? 0) : 0
  const budgetCurs: Cur[] = view === 'uae' ? ['AED'] : view === 'india' ? ['INR'] : ['AED', 'INR']
  for (const c of budgetCurs) {
    const ls = budgetLines(inp.budgets ?? [], spendByCategory(inp.txns ?? [], focusMonth, c), focusMonth, c, { carry: carryIn(inp.budgets ?? [], inp.txns ?? [], focusMonth, c) })
    const where = view === 'consolidated' ? ` (${c === 'AED' ? 'UAE' : 'India'})` : ''
    for (const l of ls) {
      const pct = Math.round(l.pct), name = budgetLabel(l.category) + where
      if (l.status === 'over') attention.push({ id: `bud-${c}-${l.category}`, severity: 'medium', title: `${name} is over budget`, detail: `${nativeMoney(l.spent, c)} of ${nativeMoney(l.cap, c)} (${pct}%)`, href: '/dashboard/budgets', actionLabel: 'Review' })
      else if (isCurrent && pct >= 85 && daysLeft >= 5 && !FIXED.has(l.category)) attention.push({ id: `bud-${c}-${l.category}`, severity: 'low', title: `${name} at ${pct}% of budget`, detail: `${daysLeft} days left this month · ${nativeMoney(l.left, c)} remaining`, href: '/dashboard/budgets', actionLabel: 'Review' })
    }
  }
  // Card utilisation
  const limit = cards.reduce((a, c) => a + viewAmount(Number(c.credit_limit) || 0, c.currency, view, fx), 0)
  const owed  = cards.reduce((a, c) => a + viewAmount(Number(c.outstanding_bal) || 0, c.currency, view, fx), 0)
  const util = limit > 0 ? Math.round(owed / limit * 100) : 0
  if (util > 30) attention.push({ id: 'util', severity: util > 60 ? 'high' : 'medium', title: `Credit card utilisation is ${util}%`, detail: 'Keeping it under 30% protects your credit score', href: '/dashboard/cards', actionLabel: 'View' })
  // Uncategorised spend (last 60 days)
  const since60 = addMonthsToDate(today, -2)
  const uncategorised = txns.filter(t => t.txn_date >= since60 && t.txn_type === 'expense' && (!t.category || String(t.category).trim() === '' || t.category === 'Other')).length
  if (uncategorised >= 3) attention.push({ id: 'uncat', severity: 'low', title: `${uncategorised} transactions are uncategorised`, detail: 'Categorise them so reports and budgets are accurate', href: '/dashboard/money/review', actionLabel: 'Fix' })
  // Accounts that have gone quiet → statement probably not imported
  const byAcct: Record<string, { n: number; last: string }> = {}
  for (const t of inp.txns ?? []) {
    if (!t.account_id || !t.txn_date) continue
    const e = byAcct[t.account_id] ?? (byAcct[t.account_id] = { n: 0, last: '' })
    e.n++; if (t.txn_date > e.last) e.last = t.txn_date
  }
  const quiet = (inp.accounts ?? [])
    .filter(a => a.is_active !== false && inView(a.currency) && ['savings', 'current', 'credit_card'].includes(a.account_type))
    .map(a => ({ a, s: byAcct[a.id] }))
    .filter(x => x.s && x.s.n >= 3 && daysBetween(x.s.last, today) > 35)
    .sort((x, y) => (x.s!.last < y.s!.last ? 1 : -1))
    .slice(0, 2)
  for (const { a, s } of quiet) attention.push({
    id: `quiet-${a.id}`, severity: 'low',
    title: `No ${a.name} transactions since ${fmtDay(s!.last)}`,
    detail: 'Import the latest statement to keep everything up to date',
    action: 'upload', actionLabel: 'Import',
  })
  // Stale market prices
  const staleDays = (rows: any[]) => {
    const ages = rows.filter(r => Number(r.units ?? r.quantity) > 0 && r.last_updated).map(r => daysBetween(String(r.last_updated).slice(0, 10), today))
    return ages.length ? Math.max(...ages) : 0
  }
  const mfAge = staleDays((inp.mutualFunds ?? []).filter(m => inView(m.currency ?? 'INR')))
  if (mfAge > 3) attention.push({ id: 'mf-stale', severity: 'low', title: `Fund prices are ${mfAge} days old`, detail: 'Open Mutual funds to refresh NAVs — net worth uses the last saved price', href: '/dashboard/investments/mutual-funds', actionLabel: 'Refresh' })
  const stAge = staleDays((inp.stocks ?? []).filter(s => inView(s.currency)))
  if (stAge > 3) attention.push({ id: 'st-stale', severity: 'low', title: `Stock prices are ${stAge} days old`, detail: 'Open Stocks to refresh live prices', href: '/dashboard/stocks', actionLabel: 'Refresh' })

  attention.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (a.date ?? '9').localeCompare(b.date ?? '9'))

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = []
  const pct = (a: number, b: number) => Math.round((a - b) / b * 100)
  const byWhen = isCurrent ? ` by the ${ordinal(dayCut!)}` : ''

  if (spend.baseline != null && spend.baseline > 0 && cur.spend > 0) {
    const p = pct(cur.spend, spend.baseline)
    if (Math.abs(p) >= 10 && Math.abs(cur.spend - spend.baseline) >= minAbs) insights.push({
      id: 'pace', tone: p > 0 ? 'warn' : 'good',
      title: `Spending is ${Math.abs(p)}% ${p > 0 ? 'higher' : 'lower'} than usual`,
      detail: `${money(cur.spend)} ${isCurrent ? 'so far' : 'this month'} vs ${money(spend.baseline)} typical${byWhen}`,
      href: '/dashboard/expenses/report',
    })
    else insights.push({ id: 'pace', tone: 'good', title: 'Spending is in line with your usual', detail: `${money(cur.spend)} vs ${money(spend.baseline)} typical${byWhen}`, href: '/dashboard/expenses/report' })
  }

  // Biggest category movers vs their own baseline
  if (priors.length) {
    const movers = Array.from(new Set([...Object.keys(cur.byCat), ...priors.flatMap(s => Object.keys(s.byCat))]))
      .map(c => ({ c, now: cur.byCat[c] ?? 0, base: catBase(c) ?? 0 }))
      .map(x => ({ ...x, diff: x.now - x.base }))
    const up = movers.filter(x => x.diff >= minAbs && x.diff >= 0.25 * Math.max(x.base, 1)).sort((a, b) => b.diff - a.diff)[0]
    const down = movers.filter(x => -x.diff >= minAbs && x.base > 0 && -x.diff >= 0.25 * x.base).sort((a, b) => a.diff - b.diff)[0]
    if (up) insights.push({
      id: 'up', tone: 'warn',
      title: up.base > 0 ? `${labelOf(up.c)} is up ${pct(up.now, up.base)}%` : `New spending on ${labelOf(up.c)}`,
      detail: `${money(up.now)} vs ${money(up.base)} usual${byWhen}`,
      href: '/dashboard/expenses/report',
    })
    if (down) insights.push({
      id: 'down', tone: 'good',
      title: `${labelOf(down.c)} is down ${Math.abs(pct(down.now, down.base))}%`,
      detail: `${money(down.now)} vs ${money(down.base)} usual${byWhen}`,
      href: '/dashboard/expenses/report',
    })
  }

  if (avgIncFull > 0) {
    const r = Math.round((avgIncFull - avgSpendFull) / avgIncFull * 100)
    insights.push({
      id: 'save', tone: r >= 20 ? 'good' : 'warn',
      title: r >= 20 ? `You're saving ${r}% of your income` : `You're saving ${Math.max(r, 0)}% of your income — aim for 20%`,
      detail: `Average of the last ${full.length} complete month${full.length === 1 ? '' : 's'}`,
      href: '/dashboard/reports',
    })
  }

  if (runway.months != null) {
    if (runway.months < 3) insights.push({ id: 'ef', tone: 'warn', title: `Cash covers ${runway.months} months of spending`, detail: 'Build an emergency fund of about 6 months', href: '/dashboard/financial-health' })
    else if (runway.months > 12) insights.push({ id: 'ef', tone: 'neutral', title: `${money(inp.cash - 6 * avgSpendFull)} is idle beyond a 6-month cushion`, detail: `Cash covers ${runway.months} months of spending — consider investing the surplus`, href: '/dashboard/investments' })
  }

  const recurring = findRecurring(txns, thisMonth, amt)
  if (recurring.length >= 2) insights.push({
    id: 'recurring', tone: 'neutral',
    title: `${recurring.length} bills & subscriptions ≈ ${money(recurring.reduce((a, r) => a + r.med, 0))}/month`,
    detail: recurring.slice(0, 4).map(r => r.name).join(', ') + (recurring.length > 4 ? '…' : ''),
    href: '/dashboard/bills',
  })

  const { value: invVal, cost: invCost } = inp.invested
  if (invCost > 0 && invVal > 0) {
    const g = invVal - invCost, gp = Math.round(g / invCost * 1000) / 10
    insights.push({ id: 'inv', tone: g >= 0 ? 'good' : 'warn', title: `Investments are ${g >= 0 ? 'up' : 'down'} ${money(g)} (${gp >= 0 ? '+' : ''}${gp}%)`, detail: `${money(invVal)} today vs ${money(invCost)} invested`, href: '/dashboard/investments' })
  }

  // Largest single expense in the focus month
  const biggest = txns.filter(t => ymOf(t.txn_date) === focusMonth && isSpend(t)).sort((a, b) => amt(b) - amt(a))[0]
  if (biggest && amt(biggest) > 0) insights.push({ id: 'big', tone: 'neutral', title: `Largest expense: ${money(amt(biggest))}`, detail: `${biggest.merchant} · ${labelOf(catOf(biggest))} · ${fmtDay(biggest.txn_date)}`, href: '/dashboard/expenses' })

  // ─── Coming up (next 30 days) ─────────────────────────────────────────────
  const upcoming: Upcoming[] = []
  const within = (d: string | null) => d != null && daysBetween(today, d) >= 0 && daysBetween(today, d) <= 30
  for (const l of (inp.loans ?? []).filter(l => inView(l.currency))) {
    const d = nextOccurrence(l.next_emi_date, today)
    if (within(d)) upcoming.push({ id: `u-emi-${l.id}`, date: d!, label: `${l.name} EMI`, sub: l.bank_name ?? 'Loan', amount: Number(l.emi_amount) || 0, currency: l.currency, kind: 'emi' })
  }
  for (const c of cards) {
    const out = Number(c.outstanding_bal) || 0
    const d = c.due_date ? nextOccurrence(c.due_date, today) : null
    if (out > 0 && within(d)) upcoming.push({ id: `u-card-${c.id}`, date: d!, label: `${c.name} bill`, sub: 'Credit card', amount: out, currency: c.currency, kind: 'card' })
  }
  for (const p of (inp.insurance ?? []).filter(p => inView(p.currency))) {
    const d = nextOccurrence(p.next_premium_date, today, FREQ[p.premium_frequency] ?? 12)
    if (within(d)) upcoming.push({ id: `u-prem-${p.id}`, date: d!, label: `${p.policy_name} premium`, sub: p.provider ?? 'Insurance', amount: Number(p.annual_premium) || 0, currency: p.currency, kind: 'premium' })
  }
  for (const f of (inp.fixedDeposits ?? []).filter(f => inView(f.currency))) {
    if (within(f.maturity_date)) upcoming.push({ id: `u-fd-${f.id}`, date: f.maturity_date, label: `${f.name} matures`, sub: f.bank_name ?? 'Fixed deposit', amount: Number(f.maturity_amt) || Number(f.principal) || 0, currency: f.currency, kind: 'fd' })
  }
  for (const m of (inp.mutualFunds ?? []).filter(m => m.has_sip && Number(m.sip_amount) > 0 && m.sip_date && inView(m.currency ?? 'INR'))) {
    const ym = Number(today.slice(8, 10)) <= Number(m.sip_date) ? thisMonth : addMonths(thisMonth, 1)
    const d = `${ym}-${String(Math.min(Number(m.sip_date), daysInMonth(ym))).padStart(2, '0')}`
    if (within(d)) upcoming.push({ id: `u-sip-${m.id}`, date: d, label: `SIP · ${m.fund_name}`, sub: 'Mutual fund', amount: Number(m.sip_amount), currency: m.currency ?? 'INR', kind: 'sip' })
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date))

  // ─── 30-day cash-flow forecast ────────────────────────────────────────────
  // Start from bank & cash, add the usual income on the day it usually lands,
  // subtract scheduled EMIs / SIPs / premiums, add FD maturities, and burn the
  // remaining average spend evenly. Card bills are left out: they settle spend
  // that the daily run-rate already counts. An estimate, labelled as such.
  let forecast: Forecast | null = null
  if (inp.cash > 0 || avgIncFull > 0) {
    const salaryDays: number[] = []
    for (const m of [1, 2, 3].map(i => addMonths(thisMonth, -i))) {
      const top = txns.filter(t => ymOf(t.txn_date) === m && isIncome(t)).sort((a, b) => amt(b) - amt(a))[0]
      if (top) salaryDays.push(Number(top.txn_date.slice(8, 10)))
    }
    const salaryDay = salaryDays.length
      ? salaryDays.sort((a, b) => salaryDays.filter(d => d === b).length - salaryDays.filter(d => d === a).length)[0]
      : null
    const sched = upcoming.filter(u => u.kind !== 'card')
    const schedOut = sched.filter(u => u.kind !== 'fd')
      .reduce((a, u) => a + viewAmount(u.amount, u.currency, view, fx), 0)
    const daily = Math.max(0, avgSpendFull - schedOut) / 30
    let bal = inp.cash
    const points: ForecastPoint[] = [{ date: today, value: Math.round(bal) }]
    let low = points[0], lowAfter: string | null = null
    for (let d = 1; d <= 30; d++) {
      const date = addDaysTo(today, d)
      bal -= daily
      if (salaryDay && Number(date.slice(8, 10)) === Math.min(salaryDay, daysInMonth(ymOf(date)))) bal += avgIncFull
      for (const u of sched.filter(x => x.date === date)) {
        const v = viewAmount(u.amount, u.currency, view, fx)
        bal += u.kind === 'fd' ? v : -v
      }
      const p = { date, value: Math.round(bal) }
      points.push(p)
      if (p.value < low.value) { low = p; lowAfter = sched.find(x => x.date <= date && x.kind !== 'fd' && x.date >= addDaysTo(date, -3))?.label ?? null }
    }
    forecast = { points, low, end: Math.round(bal), lowAfter }
  }

  const trend = {
    avgIncome: avgIncFull, avgSpend: avgSpendFull, months: full.length,
    savingsRate: avgIncFull > 0 ? Math.round((avgIncFull - avgSpendFull) / avgIncFull * 100) : null,
  }

  // Saved (income − spend) per month, newest first: this month so far, then
  // the 12 before it. Feeds the estimated part of the net-worth line.
  const savedByMonth = Array.from({ length: 13 }, (_, i) => {
    const m = addMonths(thisMonth, -i), s = monthStats(m, null)
    return { month: m, saved: s.income - s.spend - s.emi, hasData: s.income > 0 || s.spend > 0 }
  })

  return { isCurrent, dayCut, income, spend, saved, runway, trend, categories, attention, insights, upcoming, forecast, savedByMonth }
}

export function addDaysTo(date: string, n: number) {
  const d = new Date(utc(date) + n * 86400000)
  return d.toISOString().slice(0, 10)
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Net-worth history from daily snapshots ──────────────────────────────────
export interface Snapshot { snap_date: string; fx: number; uae_assets: number; uae_liab: number; india_assets: number; india_liab: number; breakdown?: Record<string, number> | null }

export function snapshotValue(s: Snapshot, view: View) {
  const uae = Number(s.uae_assets) - Number(s.uae_liab)
  const india = Number(s.india_assets) - Number(s.india_liab)
  return view === 'uae' ? uae : view === 'india' ? india : india + uae * Number(s.fx)
}

// Series for the chart + change vs ~30 days ago (or the oldest snapshot ≥ 7 days old)
export function netWorthHistory(snaps: Snapshot[], view: View, today: string) {
  const series = snaps.filter(s => (s.breakdown?.rules ?? 1) >= NW_RULES)
    .sort((a, b) => a.snap_date.localeCompare(b.snap_date))
    .map(s => ({ date: s.snap_date, value: Math.round(snapshotValue(s, view)) }))
  const target = addMonthsToDate(today, -1)
  const older = series.filter(p => daysBetween(p.date, today) >= 7)
  const ref = older.filter(p => p.date <= target).pop() ?? older[0] ?? null
  return { series, ref }
}

// Net worth at past month-ends before tracking began, estimated by walking
// back one month of savings at a time from `anchor`: the first tracked
// snapshot when there is one (so the dashed line joins the tracked one),
// else today's figure. Market moves and loan principal aren't modelled, so
// callers must label these points as estimated. Stops at the first month
// with no transactions.
export function estimateNetWorthBack(anchor: { date: string; value: number }, today: string, savedByMonth: HomeInsights['savedByMonth']): ForecastPoint[] {
  const out: ForecastPoint[] = []
  const from = ymOf(anchor.date)
  let v = anchor.value
  for (const s of savedByMonth) {   // newest first
    if (s.month > from) continue
    if (!s.hasData && s.month !== ymOf(today)) break
    v -= s.saved
    const prev = addMonths(s.month, -1)
    out.push({ date: `${prev}-${String(daysInMonth(prev)).padStart(2, '0')}`, value: Math.round(v) })
  }
  return out.reverse()
}
