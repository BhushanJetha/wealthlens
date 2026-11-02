// Expected income and regular transfers you declared (migration 040). A plan is a
// forecast: it never touches a balance. Money moves only when you add the entry
// or a statement shows it; then the plan is compared with what really happened.
import { addMonths, daysBetween, daysInMonth, ymOf } from './insights'
import { catOf, isIncome, isNreToNro, isRemitOut, prepareMoney, type View } from './money'
import { viewAmount } from './netWorth'
import { autoTag } from './recurring'

export type PlanKind = 'income' | 'remit' | 'nre_nro'
export type DayRule = 'fixed' | 'last_working' | 'second_last_working'
export interface IncomePlan {
  id: string; kind: PlanKind; name: string; amount: number; currency: string
  account_id: string | null; counter_account_id: string | null
  day_rule: DayRule; day_of_month: number | null; variance_pct: number
  category: string | null; is_active: boolean; last_done_month: string | null; snoozed_until: string | null
}
export const DAY_RULE_TEXT: Record<DayRule, string> = { fixed: 'A fixed date', last_working: 'Last working day', second_last_working: 'Second-last working day' }
export const LATE_AFTER_DAYS = 3

const utc = (d: string) => new Date(`${d}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6
const stepWorking = (d: Date, by: number) => { const x = new Date(d); do x.setUTCDate(x.getUTCDate() + by); while (isWeekend(x)); return x }

// The date in a month. Working days are Monday to Friday; a fixed date on a
// weekend moves to the Friday before (or the Monday after, to stay in the month).
export function planDate(p: Pick<IncomePlan, 'day_rule' | 'day_of_month'>, ym: string): string {
  const end = daysInMonth(ym)
  if (p.day_rule === 'fixed') {
    const d = utc(`${ym}-${String(Math.min(p.day_of_month || 1, end)).padStart(2, '0')}`)
    if (!isWeekend(d)) return iso(d)
    const before = stepWorking(d, -1)
    return ymOf(iso(before)) === ym ? iso(before) : iso(stepWorking(d, 1))
  }
  let d = utc(`${ym}-${String(end).padStart(2, '0')}`)
  if (isWeekend(d)) d = stepWorking(d, -1)
  return iso(p.day_rule === 'second_last_working' ? stepWorking(d, -1) : d)
}
export const planDayText = (p: IncomePlan) => p.day_rule === 'fixed' ? `the ${p.day_of_month}` : DAY_RULE_TEXT[p.day_rule].toLowerCase()

const within = (p: IncomePlan, amount: number) => Math.abs(amount - Number(p.amount)) <= Number(p.amount) * Number(p.variance_pct) / 100 + 0.005
const PLAIN = new Set(['Other', 'Transfer', '', 'Salary', 'One-off income'])

// What really happened for a plan in a month: the entry you added, or the closest
// matching row near its date (within half its amount either way, else it's something else)
export function findActual(p: IncomePlan, ym: string, txns: any[]): any | null {
  const due = planDate(p, ym), amt = Number(p.amount)
  const added = txns.find(t => t.auto_ref?.kind === 'plan' && t.auto_ref?.id === p.id && t.auto_ref?.month === ym)
  if (added) return added
  const fits = (t: any) => {
    if (t.currency !== p.currency || !t.txn_date || Math.abs(daysBetween(due, t.txn_date)) > 6) return false
    if (p.account_id && t.account_id && t.account_id !== p.account_id) return false
    if (p.kind === 'remit') return isRemitOut(t)
    if (p.kind === 'nre_nro') return isNreToNro(t) && t.txn_type !== 'income'
    const c = String(t.category ?? '').trim()
    return t.txn_type === 'income' && (c === p.category || PLAIN.has(c))
  }
  const near = txns.filter(fits).filter(t => Math.abs((Number(t.amount) || 0) - amt) <= amt * 0.5)
  return near.sort((a, b) => Math.abs(Number(a.amount) - amt) - Math.abs(Number(b.amount) - amt))[0] ?? null
}

export type CheckState = 'due' | 'late' | 'different'
export interface PlanCheck { id: string; plan: IncomePlan; month: string; date: string; state: CheckState; actual?: any }

// What needs you now: due today or just past, 3+ days late, or a different amount
export function planChecks(plans: IncomePlan[], today: string, txns: any[]): PlanCheck[] {
  const out: PlanCheck[] = [], now = ymOf(today)
  for (const p of plans.filter(x => x.is_active)) {
    for (const ym of [addMonths(now, -1), now]) {
      if (p.last_done_month && ym <= p.last_done_month) continue
      const date = planDate(p, ym), age = daysBetween(date, today)
      if (age < 0 || (ym !== now && age > 10)) continue
      const actual = findActual(p, ym, txns)
      if (actual) {
        if (actual.auto_ref?.kind !== 'plan' && !within(p, Number(actual.amount) || 0)) out.push({ id: `${p.id}-${ym}`, plan: p, month: ym, date, state: 'different', actual })
        continue
      }
      if (p.snoozed_until && today <= p.snoozed_until) continue
      out.push({ id: `${p.id}-${ym}`, plan: p, month: ym, date, state: age > LATE_AFTER_DAYS ? 'late' : 'due' })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Is this month's still to come (not settled, not seen)?
function stillToCome(p: IncomePlan, ym: string, txns: any[]) {
  return !(p.last_done_month && ym <= p.last_done_month) && !findActual(p, ym, txns)
}
// The next date it's expected, from today. A date that's passed and isn't
// recorded counts as today: late, but still expected.
export function nextExpected(p: IncomePlan, today: string, txns: any[]): { date: string; late: boolean; ym: string } {
  const now = ymOf(today)
  if (stillToCome(p, now, txns)) {
    const d = planDate(p, now)
    return d < today ? { date: today, late: true, ym: now } : { date: d, late: false, ym: now }
  }
  const next = addMonths(now, 1)
  return { date: planDate(p, next), late: false, ym: next }
}

// ₹ per dirham you actually got lately, else today's rate
export function usualRate(txns: any[], fx: number) {
  const rows = prepareMoney(txns, { fx }).filter(t => t._remit && t._source === 'matched' && Number(t._rate) > 0)
    .sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)))
  return Number(rows[0]?._rate) || fx
}

// What's declared, as expected income in a view. India's income is what lands from UAE.
export function plannedIncoming(plans: IncomePlan[], o: { today: string; view: View; fx: number; txns: any[]; days: number }) {
  const inView = (c: string) => o.view === 'consolidated' || (o.view === 'uae' ? c === 'AED' : c !== 'AED')
  const rate = usualRate(o.txns, o.fx)
  const out: any[] = []
  for (const p of plans.filter(x => x.is_active)) {
    const landing = p.kind === 'remit' && o.view === 'india'
    if (!(p.kind === 'income' && inView(p.currency)) && !landing) continue
    const n = nextExpected(p, o.today, o.txns)
    if (daysBetween(o.today, n.date) > o.days) continue
    out.push({
      id: `plan-${p.id}-${n.ym}`, accountId: (landing ? p.counter_account_id : p.account_id) ?? '', date: n.date,
      amount: landing ? Math.round(Number(p.amount) * rate) : Number(p.amount), currency: landing ? 'INR' : p.currency,
      label: p.name, late: n.late, declared: true, whenText: planDayText(p), usual: Number(p.amount),
    })
  }
  return out
}

// Once you've declared what comes in for a view, that's all that counts: the
// app's guesses are only for a view you've told it nothing about
export function mergeExpected(planned: any[], detected: any[], plans: IncomePlan[], view: View) {
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const declared = plans.some(p => p.is_active && ((p.kind === 'income' && inView(p.currency)) || (p.kind === 'remit' && view === 'india')))
  return (declared ? planned : [...planned, ...detected]).sort((a, b) => a.date.localeCompare(b.date))
}

// Monthly income you declared, in a view (null: none declared, so use the average)
export function declaredIncome(plans: IncomePlan[], view: View, fx: number, txns: any[]): number | null {
  const active = plans.filter(p => p.is_active)
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const income = active.filter(p => p.kind === 'income' && inView(p.currency))
  const landing = view === 'india' ? active.filter(p => p.kind === 'remit') : []
  if (!income.length && !landing.length) return null
  return income.reduce((s, p) => s + viewAmount(Number(p.amount), p.currency, view, fx), 0)
    + landing.reduce((s, p) => s + Number(p.amount) * usualRate(txns, fx), 0)
}

// The next payday you declared in a view: when your biggest income lands
export function declaredPayday(plans: IncomePlan[], today: string, view: View, txns: any[]): string | null {
  const money = plans.filter(p => p.is_active && (view === 'india' ? p.kind === 'remit' || (p.kind === 'income' && p.currency !== 'AED')
    : p.kind === 'income' && (view === 'consolidated' || p.currency === 'AED'))).sort((a, b) => Number(b.amount) - Number(a.amount))
  if (!money.length) return null
  const n = nextExpected(money[0], today, txns)
  return n.date > today ? n.date : planDate(money[0], addMonths(ymOf(today), 1))
}

// Credits that fit nothing you declared: worth asking about. Only once you've
// declared something, from the last 30 days, not already looked at.
export function unknownCredits(plans: IncomePlan[], txns: any[], today: string, fx: number): any[] {
  if (!plans.some(p => p.is_active)) return []
  const seen = new Set<any>()
  for (const p of plans) for (const ym of [addMonths(ymOf(today), -1), ymOf(today)]) { const a = findActual(p, ym, txns); if (a) seen.add(a.id) }
  const min = (c: string) => c === 'AED' ? 100 : 2000
  return prepareMoney(txns, { fx }).filter(t => isIncome(t, 'consolidated') && !t._remit && t.account_id && !t.reviewed_at && !t.auto_ref && !seen.has(t.id)
    && ['Other', 'Transfer', ''].includes(String(t.category ?? '').trim()) && catOf(t) !== 'Refund'
    && Number(t.amount) >= min(t.currency) && t.txn_date <= today && daysBetween(t.txn_date, today) <= 30)
    .sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)))
}

// Add it: the entry that moves your balance. Marked as coming from the plan, so a
// statement's real row can replace it instead of counting twice.
export function planRow(p: IncomePlan, userId: string, o: { ym: string; amount: number; date: string }) {
  const base = { user_id: userId, txn_date: o.date, merchant: p.name, amount: o.amount, currency: p.currency, country: p.currency === 'AED' ? 'UAE' : 'India',
    account_id: p.account_id, source: 'manual', is_verified: true, ...autoTag({ kind: 'plan', id: p.id, month: o.ym, amount: o.amount }, false) }
  if (p.kind === 'income') return { ...base, txn_type: 'income', category: p.category || 'Salary' }
  return { ...base, txn_type: 'transfer', category: 'Transfer', sub_category: p.kind === 'remit' ? 'International' : 'Internal', counter_account_id: p.counter_account_id }
}
export async function addFromPlan(sb: any, userId: string, p: IncomePlan, o: { ym: string; amount: number; date: string }): Promise<string | null> {
  const { error } = await sb.from('transactions').insert(planRow(p, userId, o))
  if (error) return error.message
  const r = await sb.from('income_plans').update({ last_done_month: o.ym, snoozed_until: null }).eq('id', p.id)
  return r.error?.message ?? null
}
