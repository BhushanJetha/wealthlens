// Budgets: one cap per category, per currency, per month (budgets table).
// Spending is counted with the same rules as everywhere else (lib/money): a
// category with an AED and an INR cap is one line, and in the All view the
// two caps are added together (at today's rate), never shown twice.
import { isSpend, isRemitOut, catOf, labelOf, type View } from './money'
import { viewAmount } from './netWorth'
// Own date helpers (lib/insights imports this file)
const ymOf = (d: string) => String(d ?? '').slice(0, 7)
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Card bills settle spends already budgeted elsewhere; refunds are money back
export const NOT_PLANABLE = new Set(['Credit Card Payment', 'Loan on Card', 'Refund'])
// Fixed commitments: budgeted at their latest amount, never "ahead of pace"
export const FIXED = new Set(['EMI/Loan', 'Rent', 'Investment', 'Family Transfer', 'Insurance'])
const LABEL: Record<string, string> = { 'EMI/Loan': 'EMI / loan payments', Transfer: 'Money transfer', 'International Transfer': 'Sent home' }
export const budgetLabel = (c: string) => LABEL[c] ?? labelOf(c)

const inView = (cur: string, view: View) => view === 'consolidated' || (view === 'uae' ? cur === 'AED' : cur !== 'AED')
// Money out that a budget can cover (spent, EMIs, investing, money sent home)
const budgetable = (t: any) => isSpend(t) || isRemitOut(t)

// Spend per category in a month, in view units (optionally only up to a day)
export function spendByCategory(txns: any[], month: string, view: View, fx: number, uptoDay?: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txns) {
    if (ymOf(t.txn_date) !== month || !inView(t.currency, view) || !budgetable(t)) continue
    if (uptoDay != null && Number(String(t.txn_date).slice(8, 10)) > uptoDay) continue
    const c = catOf(t)
    out[c] = (out[c] ?? 0) + viewAmount(Number(t.amount) || 0, t.currency, view, fx)
  }
  return out
}

export type BudgetStatus = 'over' | 'near' | 'ok'
export interface BudgetLine {
  category: string; cap: number; spent: number; left: number; pct: number; status: BudgetStatus
  caps: Partial<Record<'AED' | 'INR', number>>   // native caps behind this line
  rows: any[]; manual: boolean
}

// One line per category for a month, in view units
export function budgetLines(budgets: any[], spend: Record<string, number>, month: string, view: View, fx: number): BudgetLine[] {
  const by: Record<string, any[]> = {}
  for (const b of budgets) {
    const cur = b.currency || 'INR'
    if (b.month_year !== month || !inView(cur, view) || NOT_PLANABLE.has(b.category) || !(Number(b.monthly_cap) >= 0)) continue
    ;(by[b.category] ||= []).push(b)
  }
  const RANK: Record<BudgetStatus, number> = { over: 0, near: 1, ok: 2 }
  return Object.entries(by).map(([category, rows]) => {
    const cap = rows.reduce((s, b) => s + viewAmount(Number(b.monthly_cap) || 0, b.currency || 'INR', view, fx), 0)
    const spent = spend[category] ?? 0
    const pct = cap > 0 ? spent / cap * 100 : spent > 0 ? 100 : 0
    const caps: BudgetLine['caps'] = {}
    for (const b of rows) caps[(b.currency || 'INR') as 'AED' | 'INR'] = Number(b.monthly_cap) || 0
    return {
      category, cap, spent, left: cap - spent, pct, caps, rows, manual: rows.some(b => b.is_manual),
      // A fixed cost paid in full (within 2%) is done, not over
      status: (FIXED.has(category) && cap > 0 && spent >= cap * 0.98 && spent <= cap * 1.02 ? 'ok'
        : pct > 100.5 && spent > 0 ? 'over' : pct >= 85 ? 'near' : 'ok') as BudgetStatus,
    }
  }).sort((a, b) => RANK[a.status] - RANK[b.status] || b.cap - a.cap)
}

// ── Suggested caps ───────────────────────────────────────────────────────────
// Flexible costs: average monthly spend over the last 3 complete months (a
// month without the category counts as 0) plus a 10% buffer. Fixed
// commitments (EMIs, rent, SIPs, family support, insurance): the latest
// month's amount. Only categories seen in at least 2 of those months, so
// one-off costs (school fees, a holiday) don't become budgets — and one
// currency at a time, so AED caps come from AED spending and ₹ caps from ₹.
export interface Suggestion { cap: number; avg: number; max: number; months: number }
export function suggestCaps(txns: any[], currency: 'AED' | 'INR', month: string): Record<string, Suggestion> {
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

// What to write so this month's budgets are right, per currency.
// When a month starts (no budgets yet in that currency):
//   • custom caps carry forward from the latest earlier month that had any
//   • auto caps are added for last month's auto categories (or, the first
//     time ever, for every suggestion)
// Through the month:
//   • auto caps follow the suggestion; ones with nothing behind them go
//   • a category budgeted automatically in one currency also gets an auto cap
//     in the other when it's regularly spent there too (UAE rent and India
//     rent are one "Rent" line)
// `allow(cur)` says whether a currency may be seeded this month, and
// `allow(cur, category)` whether a category may be added (false once you've
// deleted it this month) — so a budget you delete stays deleted.
export interface BudgetWrite { category: string; currency: 'AED' | 'INR'; monthly_cap: number; is_manual: boolean }
export function planMonthBudgets(budgets: any[], txns: any[], month: string,
  allow: (cur: 'AED' | 'INR', category?: string) => boolean = () => true): { upserts: BudgetWrite[]; deletes: string[] } {
  const upserts: BudgetWrite[] = [], deletes: string[] = []
  const thisMonth = budgets.filter(b => b.month_year === month && !NOT_PLANABLE.has(b.category))
  // Auto categories this month, or last month (so a category carries on even
  // if its only row was in the other currency)
  const lastMonth = budgets.filter(b => b.month_year < month).map(b => b.month_year).sort().pop()
  const autoAnywhere = new Set([...thisMonth, ...budgets.filter(b => b.month_year === lastMonth)]
    .filter(b => !b.is_manual && !NOT_PLANABLE.has(b.category)).map(b => b.category))
  const manualAnywhere = new Set(thisMonth.filter(b => b.is_manual).map(b => b.category))
  for (const cur of ['AED', 'INR'] as const) {
    const mine = budgets.filter(b => (b.currency || 'INR') === cur && !NOT_PLANABLE.has(b.category))
    const now = mine.filter(b => b.month_year === month)
    const has = new Set(now.map(b => b.category))
    const sug = suggestCaps(txns, cur, month)
    if (now.length === 0 && allow(cur)) {
      const prevMonth = mine.filter(b => b.month_year < month).map(b => b.month_year).sort().pop()
      const prev = mine.filter(b => b.month_year === prevMonth)
      for (const b of prev.filter(b => b.is_manual)) {
        upserts.push({ category: b.category, currency: cur, monthly_cap: Number(b.monthly_cap) || 0, is_manual: true })
        has.add(b.category)
      }
      const autoCats = prevMonth ? new Set(prev.filter(b => !b.is_manual).map(b => b.category)) : null
      for (const [c, s] of Object.entries(sug)) if (!has.has(c) && (!autoCats || autoCats.has(c))) {
        upserts.push({ category: c, currency: cur, monthly_cap: s.cap, is_manual: false }); has.add(c)
      }
    }
    for (const b of now) {
      if (b.is_manual) continue
      const s = sug[b.category]
      if (!s) deletes.push(b.id)
      else if (Number(b.monthly_cap) !== s.cap) upserts.push({ category: b.category, currency: cur, monthly_cap: s.cap, is_manual: false })
    }
    for (const c of Array.from(autoAnywhere)) {
      if (has.has(c) || manualAnywhere.has(c) || !sug[c] || !allow(cur, c)) continue
      upserts.push({ category: c, currency: cur, monthly_cap: sug[c].cap, is_manual: false })
    }
  }
  return { upserts, deletes }
}
