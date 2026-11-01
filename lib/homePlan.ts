// Home's look ahead: the reminders for the next 7 days, what the rest of this
// month looks like, and what next month is already committed to. Estimates are
// built only from what's on file; nothing here writes anything.
import { kindOf } from './ledger'
import { isSpend } from './money'
import { viewAmount, type View } from './netWorth'
import { addMonths, daysBetween, daysInMonth, nextCardDue, nextOccurrence, ymOf } from './insights'
import type { Due, ExpectedIn, BalanceWarning } from './moneyOverview'
import type { RecurringTxn } from './recurring'

const FREQ: Record<string, number> = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }

// ── Next 7 days ─────────────────────────────────────────────────────────────
export interface Reminder { id: string; date: string; label: string; sub: string; amount: number | null; currency: string; dir: 'out' | 'in' | 'event'; href: string }
export function nextWeek(today: string, dues: Due[], incoming: ExpectedIn[], events: any[]): { items: Reminder[]; out: Due[]; in: ExpectedIn[] } {
  const near = (d: string, n: number) => { const x = daysBetween(today, d); return x >= 0 && x <= n }
  const out = dues.filter(d => near(d.date, 7)), inc = incoming.filter(i => near(i.date, 7))
  const items: Reminder[] = [
    ...out.map(d => ({ id: d.id, date: d.date, label: d.label, sub: d.sub, amount: d.amount, currency: d.currency, dir: 'out' as const, href: d.href ?? '/dashboard/bills' })),
    ...inc.map(i => ({ id: i.id, date: i.date, label: i.label, sub: 'Usually lands around now', amount: i.amount, currency: i.currency, dir: 'in' as const, href: '/dashboard/income' })),
    // Trips and functions show two weeks ahead, so there's time to prepare
    ...events.filter(e => !e.closed_at && near(String(e.start_date).slice(0, 10), 14)).map(e => ({
      id: `ev-${e.id}`, date: String(e.start_date).slice(0, 10), label: e.name, sub: e.budget ? 'Trip or event · its budget' : 'Trip or event', amount: Number(e.budget) || null,
      currency: e.currency ?? 'INR', dir: 'event' as const, href: '/dashboard/events' })),
  ]
  return { items: items.sort((a, b) => a.date.localeCompare(b.date)), out, in: inc }
}

// ── A month's commitments ───────────────────────────────────────────────────
export interface Commitment { id: string; label: string; amount: number; currency: string; kind: 'emi' | 'card' | 'sip' | 'rd' | 'repeat' | 'premium' }
export function monthCommitments(inp: { ym: string; today: string; view: View; txns: any[]; accounts: any[]; loans: any[]; insurance: any[]; mutualFunds: any[]; rds: any[]; recurring: RecurringTxn[] }): Commitment[] {
  const { ym, today, view } = inp
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const out: Commitment[] = []
  const cards = inp.accounts.filter(a => kindOf(a) === 'card' && a.is_active !== false)
  const cardIds = new Set(cards.map(a => a.id))
  for (const l of inp.loans) {
    if (l.is_active === false || !(Number(l.emi_amount) > 0) || !inView(l.currency || 'INR')) continue
    if (l.loan_type === 'loan_on_card' && cardIds.has(l.pay_from_account_id)) continue      // paid through the card's bill
    out.push({ id: `emi-${l.id}`, label: `${l.name} EMI`, amount: Number(l.emi_amount), currency: l.currency || 'INR', kind: 'emi' })
  }
  // A card: what's owed if the bill falls in that month, else what's been charged this month (it bills next)
  for (const c of cards) {
    if (!inView(c.currency)) continue
    const due = nextCardDue(c, today)
    const charged = inp.txns.filter(t => t.account_id === c.id && t.txn_type === 'expense' && ymOf(t.txn_date) === ymOf(today)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const amount = due && ymOf(due) === ym ? Number(c.outstanding_bal) || 0 : charged
    if (amount > 0) out.push({ id: `card-${c.id}`, label: `${c.name} bill`, amount, currency: c.currency, kind: 'card' })
  }
  for (const m of inp.mutualFunds) {
    if (m.has_sip && Number(m.sip_amount) > 0 && m.sip_date && inView(m.currency ?? 'INR') && !(m.sip_last_month && ym <= m.sip_last_month))
      out.push({ id: `sip-${m.id}`, label: `SIP · ${m.fund_name}`, amount: Number(m.sip_amount), currency: m.currency ?? 'INR', kind: 'sip' })
  }
  for (const r of inp.rds) {
    if (r.is_active === false || !(Number(r.monthly_amount) > 0) || !r.start_date || !inView(r.currency ?? 'INR')) continue
    if (ym < String(r.start_date).slice(0, 7) || (r.maturity_date && ym > String(r.maturity_date).slice(0, 7))) continue
    out.push({ id: `rd-${r.id}`, label: `RD · ${r.name}`, amount: Number(r.monthly_amount), currency: r.currency ?? 'INR', kind: 'rd' })
  }
  for (const r of inp.recurring) {
    if (!r.is_active || !isSpend(r) || !inView(r.currency) || ym < r.start_month || (r.last_done_month && ym <= r.last_done_month)) continue
    const [ya, ma] = r.start_month.split('-').map(Number), [yb, mb] = ym.split('-').map(Number)
    if (((yb - ya) * 12 + (mb - ma)) % (r.every_months || 1)) continue
    out.push({ id: `rep-${r.id}`, label: r.merchant, amount: Number(r.amount), currency: r.currency, kind: 'repeat' })
  }
  for (const p of inp.insurance) {
    const every = FREQ[p.premium_frequency] ?? 12, per = (Number(p.annual_premium) || 0) * every / 12
    const d = nextOccurrence(p.next_premium_date, `${ym}-01`, every)
    if (per > 0 && d && ymOf(d) === ym && inView(p.currency || 'INR')) out.push({ id: `prem-${p.id}`, label: `${p.policy_name} premium`, amount: per, currency: p.currency || 'INR', kind: 'premium' })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

// ── The plan ────────────────────────────────────────────────────────────────
export interface HomePlan {
  rest: { cash: number; comingIn: number; dueOut: number; budgetsLeft: number; endOfMonth: number; afterBudgets: number; days: number }
  next: { ym: string; income: number; committed: number; toPlan: number; items: Commitment[]; events: any[] }
}
export function homePlan(inp: { today: string; view: View; fx: number; cash: number; dues: Due[]; incoming: ExpectedIn[]; budgetsLeft: number; avgIncome: number
  txns: any[]; accounts: any[]; loans: any[]; insurance: any[]; mutualFunds: any[]; rds: any[]; recurring: RecurringTxn[]; events: any[] }): HomePlan {
  const { today, view, fx } = inp
  const v = (n: number, c: string) => viewAmount(n, c, view, fx)
  const month = ymOf(today), next = addMonths(month, 1)
  const inMonth = (d: string) => ymOf(d) === month
  const comingIn = inp.incoming.filter(i => inMonth(i.date)).reduce((s, i) => s + v(i.amount, i.currency), 0)
  const dueOut = inp.dues.filter(d => inMonth(d.date)).reduce((s, d) => s + v(d.amount, d.currency), 0)
  const endOfMonth = inp.cash + comingIn - dueOut
  const items = monthCommitments({ ym: next, today, view, txns: inp.txns, accounts: inp.accounts, loans: inp.loans, insurance: inp.insurance, mutualFunds: inp.mutualFunds, rds: inp.rds, recurring: inp.recurring })
  const committed = items.reduce((s, c) => s + v(c.amount, c.currency), 0)
  return {
    rest: { cash: inp.cash, comingIn, dueOut, budgetsLeft: inp.budgetsLeft, endOfMonth, afterBudgets: endOfMonth - inp.budgetsLeft, days: daysInMonth(month) - Number(today.slice(8, 10)) },
    next: { ym: next, income: inp.avgIncome, committed, toPlan: inp.avgIncome - committed, items,
      events: inp.events.filter(e => !e.closed_at && ymOf(String(e.start_date)) === next) },
  }
}
export type { BalanceWarning }
