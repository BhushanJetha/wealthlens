// Money overview: what's in each account, what's about to leave it, and what
// that leaves to spend before the next income lands.
//
// Which account pays an EMI or a card bill is the one set on it
// (pay_from_account_id, migration 027), else the one that paid it last time.
import { viewAmount, type View } from './netWorth'
import { kindOf, counterOf } from './ledger'
import { catOf, CC_BILL, isIncome as isIncomeIn, isSpend } from './money'
import { matchScore } from './loans'
import { findRecurring, nextOccurrence, addDaysTo, daysBetween, ymOf, addMonths, daysInMonth, fmtDay } from './insights'

export type DueKind = 'emi' | 'card' | 'premium' | 'sip' | 'bill'
export interface Due {
  id: string; date: string; label: string; sub: string
  amount: number; currency: string; kind: DueKind
  payFrom: string | null                     // account it leaves from
  payFromSource: 'set' | 'history' | null
  owner?: { table: 'home_loans' | 'accounts'; id: string }   // where "paid from" can be saved
  href?: string
}
export interface ExpectedIn { id: string; accountId: string; date: string; amount: number; currency: string; label: string }
export interface BalanceWarning { id: string; severity: 'high' | 'medium' | 'low'; title: string; detail: string; accountId: string; date?: string; href?: string }

const FREQ: Record<string, number> = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
const EMI_CATS = new Set(['EMI/Loan', 'Loan on Card'])
const latest = (rows: any[]) => rows.reduce((a, t) => (!a || t.txn_date > a.txn_date ? t : a), null as any)
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const money = (n: number, c: string) => `${c === 'AED' ? 'AED ' : '₹'}${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

// ─── Who pays what ───────────────────────────────────────────────────────────
export function loanPayFrom(loan: any, txns: any[], accounts: any[], loans: any[]): { id: string | null; source: Due['payFromSource'] } {
  if (loan.pay_from_account_id) return { id: loan.pay_from_account_id, source: 'set' }
  const banks = new Set(accounts.filter(a => kindOf(a) !== 'card').map(a => a.id))
  const emis = txns.filter(t => banks.has(t.account_id) && (EMI_CATS.has(catOf(t)) || t.txn_type === 'loan'))
  // The payment that names this lender; with only one loan in the currency, any EMI is it
  const named = emis.filter(t => matchScore(loan, t) > 0)
  const only = loans.filter(l => (l.currency || 'INR') === (loan.currency || 'INR')).length === 1
  const t = latest(named.length ? named : only ? emis.filter(t => t.currency === (loan.currency || 'INR')) : [])
  return t ? { id: t.account_id, source: 'history' } : { id: null, source: null }
}

export function cardPayFrom(card: any, txns: any[], accounts: any[]): { id: string | null; source: Due['payFromSource'] } {
  if (card.pay_from_account_id) return { id: card.pay_from_account_id, source: 'set' }
  const byId = new Map(accounts.map(a => [a.id, a]))
  const paid = txns.filter(t => catOf(t) === CC_BILL && t.account_id !== card.id && kindOf(byId.get(t.account_id)) === 'bank'
    && counterOf(t, byId.get(t.account_id), accounts) === card.id)
  const onCard = txns.filter(t => t.account_id === card.id && catOf(t) === CC_BILL && t.counter_account_id)
  const a = latest(paid), b = latest(onCard)
  if (a && (!b || a.txn_date >= b.txn_date)) return { id: a.account_id, source: 'history' }
  if (b) return { id: b.counter_account_id, source: 'history' }
  return { id: null, source: null }
}

// ─── What's coming ───────────────────────────────────────────────────────────
// Every scheduled payment from today to today + `days`, in native currency.
export function buildDues(inp: {
  today: string; days: number; view: View
  txns: any[]; accounts: any[]; loans: any[]; insurance: any[]; mutualFunds: any[]
}): Due[] {
  const { today, days, view } = inp
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const within = (d: string | null) => d != null && daysBetween(today, d) >= 0 && daysBetween(today, d) <= days
  const out: Due[] = []

  for (const l of inp.loans.filter(l => inView(l.currency || 'INR'))) {
    const d = nextOccurrence(l.next_emi_date, today)
    if (!within(d) || !(Number(l.emi_amount) > 0)) continue
    const p = loanPayFrom(l, inp.txns, inp.accounts, inp.loans)
    out.push({ id: `emi-${l.id}`, date: d!, label: `${l.name} EMI`, sub: l.bank_name ?? 'Loan', amount: Number(l.emi_amount), currency: l.currency || 'INR',
      kind: 'emi', payFrom: p.id, payFromSource: p.source, owner: { table: 'home_loans', id: l.id }, href: `/dashboard/loans/detail/${l.id}` })
  }
  for (const c of inp.accounts.filter(a => kindOf(a) === 'card' && inView(a.currency))) {
    const owed = Number(c.outstanding_bal) || 0
    const d = c.due_date ? nextOccurrence(c.due_date, today) : null
    if (owed <= 0 || !within(d)) continue
    const p = cardPayFrom(c, inp.txns, inp.accounts)
    out.push({ id: `card-${c.id}`, date: d!, label: `${c.name} bill`, sub: c.minimum_due ? `Minimum ${money(Number(c.minimum_due), c.currency)}` : 'Credit card',
      amount: owed, currency: c.currency, kind: 'card', payFrom: p.id, payFromSource: p.source, owner: { table: 'accounts', id: c.id }, href: '/dashboard/cards' })
  }
  for (const p of inp.insurance.filter(p => inView(p.currency || 'INR'))) {
    const d = nextOccurrence(p.next_premium_date, today, FREQ[p.premium_frequency] ?? 12)
    if (!within(d)) continue
    const per = (Number(p.annual_premium) || 0) * (FREQ[p.premium_frequency] ?? 12) / 12
    if (per > 0) out.push({ id: `prem-${p.id}`, date: d!, label: `${p.policy_name} premium`, sub: p.provider ?? 'Insurance', amount: per, currency: p.currency || 'INR',
      kind: 'premium', payFrom: null, payFromSource: null, href: '/dashboard/insurance' })
  }
  for (const m of inp.mutualFunds.filter(m => m.has_sip && Number(m.sip_amount) > 0 && m.sip_date && inView(m.currency ?? 'INR'))) {
    for (const ym of [ymOf(today), addMonths(ymOf(today), 1)]) {
      const d = `${ym}-${String(Math.min(Number(m.sip_date), daysInMonth(ym))).padStart(2, '0')}`
      if (!within(d)) continue
      const words = String(m.fund_name ?? '').toLowerCase().split(/\s+/).filter(w => w.length >= 4).slice(0, 2)
      const t = latest(inp.txns.filter(t => catOf(t) === 'Investment' && words.length && words.every(w => `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase().includes(w))))
      out.push({ id: `sip-${m.id}-${ym}`, date: d, label: `SIP · ${m.fund_name}`, sub: 'Mutual fund', amount: Number(m.sip_amount), currency: m.currency ?? 'INR',
        kind: 'sip', payFrom: t?.account_id ?? null, payFromSource: t ? 'history' : null, href: '/dashboard/investments/mutual-funds' })
    }
  }
  // Bills & subscriptions not yet charged this month, on their usual day
  const month = ymOf(today), dayNow = Number(today.slice(8, 10))
  const spends = inp.txns.filter(t => isSpend(t) && inView(t.currency))
  for (const r of findRecurring(spends, month, t => Number(t.amount) || 0)) {
    const ym = r.paidThisMonth ? addMonths(month, 1) : r.day >= dayNow ? month : null
    if (!ym) continue
    const d = `${ym}-${String(Math.min(r.day, daysInMonth(ym))).padStart(2, '0')}`
    if (!within(d)) continue
    const last = latest(spends.filter(t => String(t.merchant ?? '').trim() === r.name))
    const acc = inp.accounts.find(a => a.id === last?.account_id)
    out.push({ id: `bill-${r.key}`, date: d, label: r.name, sub: acc ? `Usually on ${acc.name}` : 'Bill or subscription', amount: r.med, currency: last?.currency ?? 'INR',
      kind: 'bill', payFrom: acc?.id ?? null, payFromSource: acc ? 'history' : null, href: '/dashboard/bills' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
}

// Income that usually lands in an account (≥2 of the last 3 months), on its
// usual day, if it hasn't landed yet this month.
export function expectedIncome(txns: any[], accounts: any[], today: string, days: number): ExpectedIn[] {
  const month = ymOf(today), months = [1, 2, 3].map(i => addMonths(month, -i))
  const out: ExpectedIn[] = []
  for (const a of accounts.filter(a => kindOf(a) !== 'card')) {
    const inc = txns.filter(t => t.account_id === a.id && t.txn_type === 'income')
    const per = months.map(m => inc.filter(t => ymOf(t.txn_date) === m)).filter(xs => xs.length)
    if (per.length < 2) continue
    const amount = median(per.map(xs => xs.reduce((s, t) => s + (Number(t.amount) || 0), 0)))
    const day = median(per.map(xs => Number(xs.reduce((b, t) => (Number(t.amount) > Number(b.amount) ? t : b)).txn_date.slice(8, 10))))
    const got = inc.filter(t => ymOf(t.txn_date) === month).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const ym = got >= amount * 0.8 ? addMonths(month, 1) : day >= Number(today.slice(8, 10)) ? month : null
    if (!ym || !(amount > 0)) continue
    const date = `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`
    if (daysBetween(today, date) > days) continue
    const top = latest(inc)
    out.push({ id: `in-${a.id}-${ym}`, accountId: a.id, date, amount, currency: a.currency, label: top?.merchant || top?.category || 'Usual income' })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

// ─── Will each account cover what's due from it? ─────────────────────────────
export function balanceWarnings(accounts: any[], dues: Due[], incoming: ExpectedIn[], today: string, days = 14): BalanceWarning[] {
  const out: BalanceWarning[] = []
  for (const a of accounts.filter(a => kindOf(a) !== 'card')) {
    const bal = Number(a.current_balance) || 0
    const mine = dues.filter(d => d.payFrom === a.id && d.currency === a.currency && daysBetween(today, d.date) <= days)
    const ins = incoming.filter(i => i.accountId === a.id && daysBetween(today, i.date) <= days)
    const alert = Number(a.low_balance_alert) || 0
    // Payments first on a shared day — the cautious order
    const events = [...mine.map(d => ({ date: d.date, v: -d.amount, due: d })), ...ins.map(i => ({ date: i.date, v: i.amount, due: null as Due | null }))]
      .sort((x, y) => x.date.localeCompare(y.date) || x.v - y.v)
    let run = bal, warned = false
    for (const e of events) {
      run += e.v
      if (!e.due) continue
      if (run < 0) {
        out.push({ id: `short-${a.id}`, severity: 'high', accountId: a.id, date: e.date, href: e.due.href,
          title: `${a.name} is short ${money(-run, a.currency)} for ${e.due.label}`,
          detail: `Due ${fmtDay(e.date)} · balance ${money(bal, a.currency)}${mine.length > 1 ? `, ${money(mine.filter(d => d.date <= e.date).reduce((s, d) => s + d.amount, 0), a.currency)} due from it by then` : ''}` })
        warned = true; break
      }
      if (alert > 0 && run < alert) {
        out.push({ id: `low-${a.id}`, severity: 'medium', accountId: a.id, date: e.date, href: e.due.href,
          title: `${a.name} drops below ${money(alert, a.currency)}`,
          detail: `${money(run, a.currency)} left after ${e.due.label} on ${fmtDay(e.date)}` })
        warned = true; break
      }
    }
    if (warned) continue
    if (alert > 0 && bal < alert) out.push({ id: `low-${a.id}`, severity: 'medium', accountId: a.id,
      title: `${a.name} is below ${money(alert, a.currency)}`, detail: `Balance ${money(bal, a.currency)}`, href: '/dashboard/accounts' })
    else if (bal < 0) out.push({ id: `neg-${a.id}`, severity: 'low', accountId: a.id, href: '/dashboard/accounts',
      title: `${a.name} shows ${money(bal, a.currency)} below zero`, detail: 'Set its starting balance (Edit balance) so the live balance is right' })
  }
  return out
}

// ─── Safe to spend ───────────────────────────────────────────────────────────
// Bank & cash, minus what's due from them up to the day the next income lands
// (a payment on payday itself counts — it may go out first). Card
// spends aren't counted twice: a card's bill is the due, not each charge.
export interface SafeToSpend { amount: number; cash: number; dueBefore: number; dueCount: number; until: string; payday: boolean; days: number; perDay: number | null }
export function safeToSpend(inp: { today: string; view: View; fx: number; accounts: any[]; dues: Due[]; txns: any[] }): SafeToSpend {
  const { today, view, fx } = inp
  const isIncome = (t: any) => isIncomeIn(t, view)
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  // Next payday: the day the month's biggest income usually lands
  const month = ymOf(today)
  const days: number[] = []
  for (const m of [1, 2, 3].map(i => addMonths(month, -i))) {
    const top = inp.txns.filter(t => ymOf(t.txn_date) === m && inView(t.currency) && isIncome(t))
      .sort((a, b) => viewAmount(b.amount, b.currency, view, fx) - viewAmount(a.amount, a.currency, view, fx))[0]
    if (top) days.push(Number(top.txn_date.slice(8, 10)))
  }
  const payDay = days.length ? days.sort((a, b) => days.filter(d => d === b).length - days.filter(d => d === a).length || a - b)[0] : null
  let until = addDaysTo(today, 30)
  if (payDay) {
    const ym = payDay > Number(today.slice(8, 10)) ? month : addMonths(month, 1)
    until = `${ym}-${String(Math.min(payDay, daysInMonth(ym))).padStart(2, '0')}`
  }
  const cardIds = new Set(inp.accounts.filter(a => kindOf(a) === 'card').map(a => a.id))
  const cash = inp.accounts.filter(a => kindOf(a) !== 'card' && inView(a.currency))
    .reduce((s, a) => s + Math.max(0, viewAmount(Number(a.current_balance) || 0, a.currency, view, fx)), 0)
  const before = inp.dues.filter(d => d.date <= until && !(d.payFrom && cardIds.has(d.payFrom)))
  const dueBefore = before.reduce((s, d) => s + viewAmount(d.amount, d.currency, view, fx), 0)
  const amount = cash - dueBefore
  const n = Math.max(1, daysBetween(today, until))
  return { amount, cash, dueBefore, dueCount: before.length, until, payday: !!payDay, days: n, perDay: amount > 0 ? amount / n : null }
}
