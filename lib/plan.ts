// Plan: one month of income laid out (bills, goals, everyday spending, what's
// left), paying goals first on salary day, the year ahead, what-if checks and
// fixes when goals need more than you save. Built only from what the app already
// works out elsewhere (lib/goals, lib/regular, lib/spendRoom, lib/homePlan), so
// every number matches its own page.
import { fundingPlan, goalPlan, isRecurring, kindOf, pmtFor, tracksCash, type Cur } from './goals'
import type { GoalItem } from './goalsView'
import { spendRoom } from './spendRoom'
import { budgetKeyOf, spentOn } from './budgets'
import { monthlyCommitted, type FoundCharge } from './regular'
import { monthCommitments } from './homePlan'
import { addMonths, ymOf } from './insights'
import { isIncome, prepareMoney } from './money'
import type { Bill } from './bigBills'
import type { BuilderDue } from './property'

const stepOf = (c: Cur) => (c === 'AED' ? 10 : 100)
const roundTo = (v: number, c: Cur) => Math.round(v / stepOf(c)) * stepOf(c)
const viewOf = (c: Cur) => (c === 'AED' ? 'uae' as const : 'india' as const)
const addMonthsDate = (d: string, n: number) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.toISOString().slice(0, 8)}${String(Math.min(day, dim)).padStart(2, '0')}`
}

// Goals that need a monthly amount from you: one-time goals still going, not
// filled by a linked investment or by your bank balance (recurring goals are
// big bills, counted with bills)
export function fundedByYou(it: GoalItem, links: any[]) {
  const g = it.goal
  return !isRecurring(g) && it.plan.status !== 'achieved' && it.plan.status !== 'paused' && g.status !== 'cancelled'
    && !tracksCash(g) && !g.account_id && !links.some(l => l.goal_id === g.id)
}

// ── This month, in one currency ──────────────────────────────────────────────
export interface MonthPlan {
  cur: Cur; income: number; incomeDeclared: boolean
  bills: number; emis: number; billsCount: number
  goals: number; goalRows: { goal: any; amount: number }[]
  everyday: number; everydaySpent: number
  left: number
  saving: number                                    // what you've actually saved, a month (last 3)
  funding: ReturnType<typeof fundingPlan>; short: number
}
export function monthPlan(inp: {
  cur: Cur; today: string; items: GoalItem[]; monthly: Record<Cur, { income: number; saved: number; essentials: number }>
  declared: number | null; budgets: any[]; txns: any[]; recurring: any[]; bills: Bill[]; found: FoundCharge[]; loans: any[]
}): MonthPlan {
  const { cur, today } = inp
  const mine = inp.items.filter(it => it.goal.currency === cur && it.goal.status !== 'cancelled')
  const funding = fundingPlan(mine.map(it => ({ goal: it.goal, value: it.v.value, plan: it.plan })), inp.monthly[cur].saved)
  const goalRows = funding.rows.filter(r => !isRecurring(r.goal) && r.need > 0).map(r => ({ goal: r.goal, amount: r.need }))
  const committed = monthlyCommitted(cur, inp.recurring, inp.bills, inp.found)
  const emis = inp.loans.filter(l => (l.currency || 'INR') === cur && l.is_active !== false).reduce((s, l) => s + (Number(l.emi_amount) || 0), 0)
  const room = spendRoom({ today, cur, budgets: inp.budgets, txns: inp.txns, safe: Infinity })
  // A repeating bill in an everyday category (a subscription, say) is in Bills: not twice
  const repeatsIn: Record<string, number> = {}
  for (const r of inp.recurring) if (r.is_active && r.txn_type === 'expense' && r.currency === cur) repeatsIn[r.category] = (repeatsIn[r.category] ?? 0) + (Number(r.amount) || 0) / (Number(r.every_months) || 1)
  const everyday = room.lines.reduce((s, l) => s + Math.max(0, l.cap - Object.entries(repeatsIn).reduce((a, [c, v]) => a + (c === l.category || budgetKeyOf(c) === l.category ? v : 0), 0)), 0), everydaySpent = room.lines.reduce((s, l) => s + l.spent, 0)
  const income = inp.declared ?? inp.monthly[cur].income
  const goals = goalRows.reduce((s, r) => s + r.amount, 0)
  // Charges only spotted in your history are part of your usual spending, so they're counted there
  const bills = committed.repeating + committed.aside
  return {
    cur, income, incomeDeclared: inp.declared != null, bills, emis, billsCount: inp.recurring.filter(r => r.currency === cur && r.is_active).length + inp.bills.filter(b => b.currency === cur).length,
    goals, goalRows, everyday, everydaySpent, left: income - bills - emis - goals - everyday,
    // Short: what this month's plan is over by, the number the page shows
    saving: inp.monthly[cur].saved, funding, short: Math.max(0, -(income - bills - emis - goals - everyday)),
  }
}

// ── Pay yourself first ───────────────────────────────────────────────────────
export type PayFirstMode = 'ask' | 'auto' | 'off'
export const payFirstModeOf = (meta: any): PayFirstMode => (meta?.pay_first === 'auto' || meta?.pay_first === 'off' ? meta.pay_first : 'ask')
export const payFirstKey = (ym: string, cur: Cur) => `payfirst:${ym}:${cur}`
export const PAY_FIRST_NOTE = 'Paid yourself first'

// Salary has landed this month: an income of at least half the usual
export function salaryThisMonth(txns: any[], cur: Cur, today: string, usual: number, fx: number) {
  const ym = today.slice(0, 7)
  const rows = prepareMoney(txns, { fx }).filter(t => t.currency === cur && ymOf(t.txn_date) === ym && String(t.txn_date) <= today && isIncome(t, viewOf(cur)))
  const top = rows.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[0]
  return top && (Number(top.amount) || 0) >= usual * 0.5 && usual > 0 ? top : null
}
// What to set aside for each goal: what the funding plan can give it this month
export function payFirstRows(cur: Cur, items: GoalItem[], links: any[], saving: number) {
  const mine = items.filter(it => it.goal.currency === cur && it.goal.status !== 'cancelled')
  const f = fundingPlan(mine.map(it => ({ goal: it.goal, value: it.v.value, plan: it.plan })), saving)
  return f.rows.map(r => ({ goal: r.goal, amount: roundTo(r.given, cur) }))
    .filter(r => r.amount > 0 && fundedByYou(mine.find(it => it.goal.id === r.goal.id)!, links))
}
export function payFirstDue(inp: { mode: PayFirstMode; cur: Cur; today: string; txns: any[]; items: GoalItem[]; links: any[]; saving: number; usualIncome: number; fx: number; answers: string[]; contributions: any[] }) {
  if (inp.mode === 'off') return null
  const ym = inp.today.slice(0, 7)
  const salary = salaryThisMonth(inp.txns, inp.cur, inp.today, inp.usualIncome, inp.fx)
  if (!salary) return null
  const done = inp.answers.includes(payFirstKey(ym, inp.cur)) || inp.contributions.some(c => c.note === PAY_FIRST_NOTE && String(c.contrib_date).slice(0, 7) === ym && c.currency === inp.cur)
  if (done) return null
  const rows = payFirstRows(inp.cur, inp.items, inp.links, inp.saving)
  if (!rows.length) return null
  return { cur: inp.cur, salary, rows, total: rows.reduce((s, r) => s + r.amount, 0) }
}

// ── The year ahead ───────────────────────────────────────────────────────────
export type MonthState = 'comfortable' | 'tight' | 'short'
export interface YearMonth { ym: string; income: number; out: number; left: number; state: MonthState; lines: { label: string; amount: number }[] }
export function yearAheadPlan(inp: {
  cur: Cur; today: string; plan: MonthPlan; txns: any[]; accounts: any[]; loans: any[]; insurance: any[]; mutualFunds: any[]; rds: any[]
  recurring: any[]; lic: any[]; bills: Bill[]; answers: string[]; events: any[]
  builder?: BuilderDue[]      // your part of the builder payments (lib/property)
}): YearMonth[] {
  const { cur, plan } = inp
  const out: YearMonth[] = []
  for (let i = 0; i < 12; i++) {
    const ym = addMonths(inp.today.slice(0, 7), i)
    // Money that leaves your bank that month (EMIs, SIPs, rent, premiums, big bills on their date…)
    const fixed = monthCommitments({ ym, today: inp.today, view: viewOf(cur), txns: inp.txns, accounts: inp.accounts, loans: inp.loans, insurance: inp.insurance,
      mutualFunds: inp.mutualFunds, rds: inp.rds, recurring: inp.recurring, lic: inp.lic, bills: inp.bills, answers: inp.answers })
      .filter(c => c.currency === cur && !c.id.startsWith('bill-'))            // (spotted charges are in everyday spending)
    const trips = inp.events.filter(e => !e.closed_at && e.currency === cur && !e.goal_id && Number(e.budget) > 0 && String(e.start_date).slice(0, 7) === ym)
    const lines = [
      ...fixed.map(c => ({ label: c.label, amount: c.amount })),
      ...trips.map(e => ({ label: e.name, amount: Number(e.budget) })),
      ...(inp.builder ?? []).filter(b => b.currency === cur && b.date.slice(0, 7) === ym).map(b => ({ label: b.label, amount: b.amount })),
      ...(plan.goals > 0 ? [{ label: 'Goals', amount: plan.goals }] : []),
      ...(plan.everyday > 0 ? [{ label: 'Everyday spending', amount: plan.everyday }] : []),
    ]
    const o = lines.reduce((s, l) => s + l.amount, 0), left = plan.income - o
    out.push({ ym, income: plan.income, out: o, left, state: left < 0 ? 'short' : left < plan.income * 0.1 ? 'tight' : 'comfortable',
      lines: lines.sort((a, b) => b.amount - a.amount) })
  }
  return out
}

// ── What if ──────────────────────────────────────────────────────────────────
export const emi = (principal: number, annualRate: number, months: number) => {
  if (principal <= 0 || months <= 0) return 0
  const r = annualRate / 1200
  return r > 0 ? principal * r / (1 - Math.pow(1 + r, -months)) : principal / months
}
export interface GoalShift { goal: any; was: string; now: string | null }
// Goals after a change in what you can save each month: which dates move
export function goalShifts(cur: Cur, items: GoalItem[], saving: number, newSaving: number, today: string): GoalShift[] {
  const mine = items.filter(it => it.goal.currency === cur && it.goal.status !== 'cancelled' && !isRecurring(it.goal))
  const before = fundingPlan(mine.map(it => ({ goal: it.goal, value: it.v.value, plan: it.plan })), saving)
  const after = fundingPlan(mine.map(it => ({ goal: it.goal, value: it.v.value, plan: it.plan })), newSaving)
  const out: GoalShift[] = []
  for (const r of after.rows) {
    const was = before.rows.find(x => x.goal.id === r.goal.id)!
    const dateOf = (f: typeof r) => f.fits ? String(r.goal.target_date).slice(0, 10) : f.newMonths != null ? addMonthsDate(today, f.newMonths) : null
    const a = dateOf(was), b = dateOf(r)
    if (a !== b) out.push({ goal: r.goal, was: a ?? String(r.goal.target_date).slice(0, 10), now: b })
  }
  return out
}
export function buyBig(inp: { cur: Cur; today: string; plan: MonthPlan; items: GoalItem[]; liquid: number; essentials: number
  price: number; upfront: number; years: number; rate: number }) {
  const loan = Math.max(0, inp.price - inp.upfront)
  const pay = emi(loan, inp.rate, inp.years * 12)
  const monthsBefore = inp.essentials > 0 ? inp.liquid / inp.essentials : null
  const monthsAfter = inp.essentials > 0 ? Math.max(0, inp.liquid - inp.upfront) / inp.essentials : null
  // What this month's plan leaves for goals: what they get now plus what's left over
  const saving = Math.max(0, inp.plan.goals + inp.plan.left)
  const shifts = goalShifts(inp.cur, inp.items, saving, Math.max(0, saving - pay), inp.today)
  // A gentler way: save the upfront first from what's spare, so the emergency money stays
  const spare = Math.max(0, inp.plan.left)
  const wait = inp.upfront > 0 && spare > 0 ? Math.ceil(inp.upfront / spare) : null
  const waitMonths = wait != null && wait <= 36 ? wait : null      // further off than 3 years isn't a gentler way
  return { loan, emi: pay, interest: Math.max(0, pay * inp.years * 12 - loan), leftAfter: inp.plan.left - pay, monthsBefore, monthsAfter, shifts, waitMonths,
    ok: inp.plan.left - pay >= 0 && (monthsAfter == null || monthsAfter >= 3) }
}
export function incomeChange(inp: { cur: Cur; today: string; plan: MonthPlan; items: GoalItem[]; pct: number }) {
  const delta = inp.plan.income * inp.pct / 100
  const saving = Math.max(0, inp.plan.goals + inp.plan.left)
  return { income: inp.plan.income + delta, leftAfter: inp.plan.left + delta, shifts: goalShifts(inp.cur, inp.items, saving, Math.max(0, saving + delta), inp.today) }
}
// Paying part of a loan now: months and interest saved, keeping the same EMI
export function prepay(loan: any, amount: number) {
  const bal = Number(loan.outstanding_amt) || 0, pay = Number(loan.emi_amount) || 0, r = (Number(loan.interest_rate) || 0) / 1200
  const run = (b: number) => { let n = 0, interest = 0; while (b > 0.5 && n < 600) { const i = b * r; interest += i; b = b + i - pay; n++ } return { n, interest } }
  if (bal <= 0 || pay <= bal * r) return null
  const before = run(bal), after = run(Math.max(0, bal - amount))
  return { monthsSaved: before.n - after.n, interestSaved: Math.max(0, before.interest - after.interest), monthsLeft: after.n }
}

// ── Fixes when goals need more than you save ────────────────────────────────
export type Fix =
  | { kind: 'move'; goal: any; date: string; newNeed: number; covers: number }
  | { kind: 'lower'; goal: any; target: number; newNeed: number; covers: number }
  | { kind: 'budgets'; cuts: { row: any; category: string; from: number; to: number }[]; covers: number }
export function fixesFor(inp: { cur: Cur; today: string; items: GoalItem[]; short: number; budgetRows: any[]; spent: Record<string, number>; links: any[] }): Fix[] {
  const { cur, today, short } = inp
  if (!(short > 0)) return []
  const fixes: Fix[] = []
  // The least important one-time goal with the biggest monthly amount moves or shrinks first
  const cand = inp.items.filter(it => it.goal.currency === cur && fundedByYou(it, inp.links) && kindOf(it.goal) !== 'emergency' && it.plan.need > 0)
    .sort((a, b) => Number(b.goal.priority ?? 2) - Number(a.goal.priority ?? 2) || b.plan.need - a.plan.need)[0]
  if (cand) {
    const g = cand.goal, need = cand.plan.need, want = Math.max(0, need - short)
    for (let m = 1; m <= 120; m++) {
      const date = addMonthsDate(String(g.target_date), m)
      const p = goalPlan({ ...g, target_date: date }, cand.v.value, cand.pace, today)
      if (p.need <= want + 0.5) { fixes.push({ kind: 'move', goal: g, date, newNeed: p.need, covers: Math.min(short, need - p.need) }); break }
    }
    // The amount it can reach by its date with what's left for it
    const r = cand.plan.ret / 1200, n = cand.plan.months, infl = Math.pow(1 + cand.plan.inflation / 100, n / 12)
    let lo = 0, hi = Number(g.target_amount)
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (pmtFor(mid * infl, cand.v.value, r, n) <= want) lo = mid; else hi = mid
    }
    const step = cur === 'AED' ? 1000 : 10000, target = Math.floor(lo / step) * step
    if (target > 0 && target < Number(g.target_amount)) {
      const newNeed = pmtFor(target * infl, cand.v.value, r, n)
      fixes.push({ kind: 'lower', goal: g, target, newNeed, covers: Math.min(short, need - newNeed) })
    }
  }
  // Spend less: the budgets with the most room, at most 40% off each
  const rows = inp.budgetRows.filter(b => (b.currency ?? 'INR') === cur && b.month_year === today.slice(0, 7) && Number(b.monthly_cap) > 0 && !String(b.category).startsWith('__'))
    .map(b => ({ row: b, category: b.category, cap: Number(b.monthly_cap), room: Number(b.monthly_cap) - spentOn(inp.spent, b.category) }))
    .sort((a, b) => b.room - a.room)
  let need = short
  const cuts: { row: any; category: string; from: number; to: number }[] = []
  for (const b of rows) {
    if (need <= 0) break
    const cut = Math.min(need, Math.floor(b.cap * 0.4 / stepOf(cur)) * stepOf(cur))
    if (cut <= 0) continue
    cuts.push({ row: b.row, category: b.category, from: b.cap, to: b.cap - cut })
    need -= cut
  }
  if (cuts.length) fixes.push({ kind: 'budgets', cuts, covers: short - Math.max(0, need) })
  return fixes.sort((a, b) => b.covers - a.covers)
}
