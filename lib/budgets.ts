// Budgets: planned one currency at a time — UAE budgets in AED, India budgets
// in ₹, never converted into each other (prices and needs differ). Rows in
// the budgets table: one cap per category, per currency, per month, plus two
// reserved kinds — a "save first" target and per-person budgets.
// Spending is counted with the same rules as everywhere else (lib/money).
import { isSpend, isSpending, isRemitOut, catOf, labelOf, isIncome, spendGroup, type View } from './money'

// Own date helpers (lib/insights imports this file)
const ymOf = (d: string) => String(d ?? '').slice(0, 7)
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}
const dim = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }

export type Cur = 'AED' | 'INR'
// The money view a currency's budget is counted in
export const curView = (c: Cur): View => (c === 'AED' ? 'uae' : 'india')

// Card bills settle spends already budgeted elsewhere; refunds are money back
export const NOT_PLANABLE = new Set(['Credit Card Payment', 'Loan on Card', 'Refund'])
// Fixed commitments: budgeted at their latest amount, never "ahead of pace", no rollover
export const FIXED = new Set(['EMI/Loan', 'Rent', 'Investment', 'Family Transfer', 'Insurance'])
// Reserved budget rows (not categories)
export const SAVINGS = '__savings__'
export const PERSON = '__person__'
export const isReserved = (c: string) => c === SAVINGS || c === PERSON
const LABEL: Record<string, string> = { 'EMI/Loan': 'EMI / loan payments', Transfer: 'Money transfer', 'International Transfer': 'Sent home' }
export const budgetLabel = (c: string) => LABEL[c] ?? labelOf(c)

// Money out that a category budget can cover (spent, EMIs, investing, money sent home)
const budgetable = (t: any) => isSpend(t) || isRemitOut(t)
const curOf = (b: any): Cur => (b.currency === 'AED' ? 'AED' : 'INR')

// Spend per category in a month, in that currency (optionally between two days)
export function spendByCategory(txns: any[], month: string, cur: Cur, fromDay = 1, toDay = 31): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txns) {
    if (t.currency !== cur || ymOf(t.txn_date) !== month || !budgetable(t)) continue
    const d = Number(String(t.txn_date).slice(8, 10))
    if (d < fromDay || d > toDay) continue
    const c = catOf(t)
    out[c] = (out[c] ?? 0) + (Number(t.amount) || 0)
  }
  return out
}

// ── Rollover ─────────────────────────────────────────────────────────────────
// Unspent money from budgets with "roll over" on carries into the next month,
// month after month (up to 6 back), as long as the category keeps rolling over.
export function carryIn(budgets: any[], txns: any[], month: string, cur: Cur): Record<string, number> {
  let carry: Record<string, number> = {}
  for (let i = 6; i >= 1; i--) {
    const m = addMonths(month, -i)
    const rows = budgets.filter(b => b.month_year === m && curOf(b) === cur && b.rollover && !FIXED.has(b.category) && !isReserved(b.category) && !NOT_PLANABLE.has(b.category))
    if (!rows.length) { carry = {}; continue }
    const spent = spendByCategory(txns, m, cur)
    const next: Record<string, number> = {}
    for (const b of rows) next[b.category] = Math.max(0, (Number(b.monthly_cap) || 0) + (carry[b.category] ?? 0) - (spent[b.category] ?? 0))
    carry = next
  }
  return Object.fromEntries(Object.entries(carry).filter(([, v]) => v > 0))
}

// ── Yearly costs (sinking funds) ─────────────────────────────────────────────
// Recurring goals (migration 031) — or budget_funds rows (029) before it.
// `used`: what was taken out of it to spend, by month (recurring goals)
export interface Fund {
  id: string; name: string; category: string | null; currency: Cur
  target: number; due_date: string; saved: number; last_saved_month: string | null; is_active?: boolean
  goal?: any; used?: { month: string; amount: number }[]
}
// What to put aside each month so it's all there by the due month (one
// set-aside a month, this month through the month before; once this month's
// is done, what's left spreads over the months after it)
export function fundPlan(f: Fund, today: string) {
  const now = ymOf(today), due = ymOf(f.due_date)
  const left = Math.max(0, Number(f.target) - Number(f.saved || 0))
  const doneThisMonth = f.last_saved_month === now
  const months = Math.max(1, monthsBetween(now, due) - (doneThisMonth ? 1 : 0))
  const step = f.currency === 'AED' ? 10 : 100
  return {
    monthly: left > 0 ? Math.ceil(left / months / step) * step : 0,
    monthsLeft: monthsBetween(now, due), slots: months, left,
    pct: Number(f.target) > 0 ? Math.min(100, Number(f.saved || 0) / Number(f.target) * 100) : 0,
    doneThisMonth, isDue: today >= f.due_date, dueThisMonth: now === due,
  }
}
// In a fund's due month, what's been put aside covers that category's spend;
// once it's been spent (and the goal moved on to its next date), what was
// taken out still covers the month it was spent in
export function fundCover(funds: Fund[], month: string, cur: Cur): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of funds) {
    if (f.is_active === false || !f.category || f.currency !== cur) continue
    const c = (ymOf(f.due_date) === month ? Math.min(Number(f.saved || 0), Number(f.target)) : 0)
      + (f.used ?? []).filter(u => u.month === month).reduce((s, u) => s + u.amount, 0)
    if (c > 0) out[f.category] = (out[f.category] ?? 0) + c
  }
  return out
}

// ── Lines ────────────────────────────────────────────────────────────────────
export type BudgetStatus = 'over' | 'near' | 'ok'
export interface BudgetLine {
  category: string
  base: number; carry: number; cover: number      // cap = base + rolled over + yearly fund
  cap: number; spent: number; left: number; pct: number; status: BudgetStatus
  row: any; manual: boolean; rollover: boolean
}
export function budgetLines(budgets: any[], spend: Record<string, number>, month: string, cur: Cur,
  extras: { carry?: Record<string, number>; cover?: Record<string, number> } = {}): BudgetLine[] {
  const RANK: Record<BudgetStatus, number> = { over: 0, near: 1, ok: 2 }
  return budgets
    .filter(b => b.month_year === month && curOf(b) === cur && !NOT_PLANABLE.has(b.category) && !isReserved(b.category) && Number(b.monthly_cap) >= 0)
    .map(b => {
      const category = b.category, base = Number(b.monthly_cap) || 0
      const carry = extras.carry?.[category] ?? 0, cover = extras.cover?.[category] ?? 0
      const cap = base + carry + cover, spent = spend[category] ?? 0
      const pct = cap > 0 ? spent / cap * 100 : spent > 0 ? 100 : 0
      return {
        category, base, carry, cover, cap, spent, left: cap - spent, pct, row: b, manual: !!b.is_manual, rollover: !!b.rollover,
        // A fixed cost paid in full (within 2%) is done, not over
        status: (FIXED.has(category) && cap > 0 && spent >= cap * 0.98 && spent <= cap * 1.02 ? 'ok'
          : pct > 100.5 && spent > 0 ? 'over' : pct >= 85 ? 'near' : 'ok') as BudgetStatus,
      }
    })
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.cap - a.cap)
}

// ── This week ────────────────────────────────────────────────────────────────
// Monday to today (from the 1st if the month began this week); each flexible
// budget's weekly share is its monthly amount × 7 ÷ days in the month.
export function weekOf(today: string) {
  const d = new Date(`${today}T00:00:00Z`), dow = (d.getUTCDay() + 6) % 7
  const fromDay = Math.max(1, Number(today.slice(8, 10)) - dow)
  return { fromDay, toDay: Number(today.slice(8, 10)), daysLeft: 6 - dow, share: (cap: number) => cap * 7 / dim(ymOf(today)) }
}

// ── Save first ───────────────────────────────────────────────────────────────
// A month's money in one currency, by the shared rules: income in that view
// (India income = money landing in NRE), spent (living + family), EMIs and
// investing; saved = income − spent − EMIs (investing counts as saving).
// `prepared` = prepareMoney(transactions).
export function monthMoney(prepared: any[], month: string, cur: Cur) {
  const view = curView(cur)
  let income = 0, spent = 0, emi = 0, invest = 0
  for (const t of prepared) {
    if (ymOf(t.txn_date) !== month || t.currency !== cur) continue
    const v = Number(t.amount) || 0
    if (isIncome(t, view)) { income += v; continue }
    const g = spendGroup(t)
    if (g === 'loans') emi += v; else if (g === 'invest') invest += v; else if (g) spent += v
  }
  return { income, spent, emi, invest, saved: income - spent - emi }
}

// ── Per person ───────────────────────────────────────────────────────────────
// Spending tagged for each family member (transactions.holder_name)
export function personSpend(txns: any[], month: string, cur: Cur): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txns) {
    if (!t.holder_name || t.currency !== cur || ymOf(t.txn_date) !== month || !isSpending(t)) continue
    out[t.holder_name] = (out[t.holder_name] ?? 0) + (Number(t.amount) || 0)
  }
  return out
}

// ── Suggested caps ───────────────────────────────────────────────────────────
// Flexible costs: average monthly spend over the last 3 complete months (a
// month without the category counts as 0) plus a 10% buffer. Fixed
// commitments (EMIs, rent, SIPs, family support, insurance): the latest
// month's amount. Only categories seen in at least 2 of those months, so
// one-off costs (school fees, a holiday) don't become budgets — those are
// better as yearly costs. One currency at a time.
export interface Suggestion { cap: number; avg: number; max: number; months: number }
export function suggestCaps(txns: any[], currency: Cur, month: string): Record<string, Suggestion> {
  const months = [1, 2, 3].map(i => addMonths(month, -i))
  const per: Record<string, Record<string, number>> = {}
  for (const t of txns) {
    const m = ymOf(t.txn_date)
    if (t.currency !== currency || !months.includes(m) || !budgetable(t)) continue
    const c = catOf(t)
    if (NOT_PLANABLE.has(c)) continue
    ;(per[c] ||= {})[m] = (per[c][m] ?? 0) + (Number(t.amount) || 0)
  }
  const step = currency === 'AED' ? 10 : 100
  const out: Record<string, Suggestion> = {}
  for (const [c, ms] of Object.entries(per)) {
    const vals = Object.values(ms)
    if (vals.length < 2) continue
    const avg = vals.reduce((a, v) => a + v, 0) / 3
    const latest = ms[months.find(m => ms[m] != null)!]
    const base = FIXED.has(c) ? latest : avg * 1.1
    out[c] = { avg: Math.round(avg), max: Math.round(Math.max(...vals)), months: vals.length, cap: Math.ceil(base / step) * step }
  }
  return out
}

// ── Keeping a month's budgets right ──────────────────────────────────────────
// Per currency, independently.
// When a month starts (no budgets yet in that currency, and `allow(cur)`):
//   • fixed amounts, the save-first target and per-person budgets carry
//     forward from the latest earlier month
//   • auto caps are added for last month's auto categories (or, the first
//     time ever, for every suggestion), keeping their rollover setting
// Through the month: auto caps follow the suggestion; ones with nothing
// behind them go; last month's auto categories come back if missing, unless
// you deleted them this month (`allow(cur, category)` false).
export interface BudgetWrite { category: string; currency: Cur; monthly_cap: number; is_manual: boolean; rollover?: boolean; holder_name?: string | null }
export function planMonthBudgets(budgets: any[], txns: any[], month: string,
  allow: (cur: Cur, category?: string) => boolean = () => true): { upserts: BudgetWrite[]; deletes: string[] } {
  const upserts: BudgetWrite[] = [], deletes: string[] = []
  for (const cur of ['AED', 'INR'] as const) {
    const mine = budgets.filter(b => curOf(b) === cur && !NOT_PLANABLE.has(b.category))
    const now = mine.filter(b => b.month_year === month)
    const has = new Set(now.map(b => b.category))
    const sug = suggestCaps(txns, cur, month)
    const prevMonth = mine.filter(b => b.month_year < month).map(b => b.month_year).sort().pop()
    const prev = mine.filter(b => b.month_year === prevMonth)
    const prevAuto = new Map(prev.filter(b => !b.is_manual && !isReserved(b.category)).map(b => [b.category, b]))
    if (now.length === 0 && allow(cur)) {
      for (const b of prev.filter(b => b.is_manual)) {
        upserts.push({ category: b.category, currency: cur, monthly_cap: Number(b.monthly_cap) || 0, is_manual: true, rollover: !!b.rollover, holder_name: b.holder_name ?? null })
        if (!isReserved(b.category)) has.add(b.category)
      }
      for (const [c, s] of Object.entries(sug)) if (!has.has(c) && (!prevMonth || prevAuto.has(c))) {
        upserts.push({ category: c, currency: cur, monthly_cap: s.cap, is_manual: false, rollover: !!prevAuto.get(c)?.rollover }); has.add(c)
      }
      continue
    }
    for (const b of now) {
      if (b.is_manual || isReserved(b.category)) continue
      const s = sug[b.category]
      if (!s) deletes.push(b.id)
      else if (Number(b.monthly_cap) !== s.cap) upserts.push({ category: b.category, currency: cur, monthly_cap: s.cap, is_manual: false, rollover: !!b.rollover })
    }
    if (now.length > 0) for (const [c, b] of Array.from(prevAuto)) {
      if (has.has(c) || !sug[c] || !allow(cur, c)) continue
      upserts.push({ category: c, currency: cur, monthly_cap: sug[c].cap, is_manual: false, rollover: !!b.rollover })
    }
  }
  return { upserts, deletes }
}
