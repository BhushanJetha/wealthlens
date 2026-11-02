// Money overview: what's in each account, what's about to leave it, and what
// that leaves to spend before the next income lands.
//
// Which account pays an EMI or a card bill is the one set on it
// (pay_from_account_id, migration 027), else the one that paid it last time.
import { viewAmount, type View } from './netWorth'
import { kindOf, counterOf } from './ledger'
import { catOf, CC_BILL, isIncome as isIncomeIn, isSpend, expandSplits, prepareMoney } from './money'
import { matchScore } from './loans'
import { findRecurring, seenPayments, nextOccurrence, nextCardDue, addDaysTo, daysBetween, ymOf, addMonths, daysInMonth, fmtDay } from './insights'
import { nextDate, type RecurringTxn } from './recurring'
import { nextExpected, type IncomePlan } from './incomePlans'
import { ruleTextFor } from './rules'
import { policyEvery, reservedFor, type Bill } from './bigBills'
import { isCounted, sameName } from './regular'

export type DueKind = 'emi' | 'card' | 'premium' | 'sip' | 'bill' | 'repeat'
export interface Due {
  id: string; date: string; label: string; sub: string
  amount: number; currency: string; kind: DueKind
  payFrom: string | null                     // account it leaves from
  payFromSource: 'set' | 'history' | null
  owner?: { table: 'home_loans' | 'accounts'; id: string }   // where "paid from" can be saved
  href?: string
  category?: string | null; why?: string     // where the amount comes from
  seen?: { date: string; amount: number }[]
}
export interface ExpectedIn {
  id: string; accountId: string; date: string; amount: number; currency: string; label: string
  // Why it's expected
  accountName?: string; usual?: number; day?: number; months?: number; got?: number; late?: boolean
  declared?: boolean; whenText?: string      // from what you declared, not detected
}
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
  recurring?: RecurringTxn[]; rds?: any[]; plans?: IncomePlan[]; lic?: any[]; bills?: Bill[]; answers?: string[]
}): Due[] {
  const { today, days, view } = inp
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const within = (d: string | null) => d != null && daysBetween(today, d) >= 0 && daysBetween(today, d) <= days
  const out: Due[] = []

  const cardIds = new Set(inp.accounts.filter(a => kindOf(a) === 'card').map(a => a.id))
  for (const l of inp.loans.filter(l => inView(l.currency || 'INR'))) {
    // A loan on a card is paid through the card's bill (listed below), not on its own
    if (l.loan_type === 'loan_on_card' && cardIds.has(l.pay_from_account_id)) continue
    const d = nextOccurrence(l.next_emi_date, today)
    if (!within(d) || !(Number(l.emi_amount) > 0)) continue
    if (l.emi_last_month && ymOf(d!) <= l.emi_last_month) continue      // already off the balance
    const p = loanPayFrom(l, inp.txns, inp.accounts, inp.loans)
    out.push({ id: `emi-${l.id}`, date: d!, label: `${l.name} EMI`, sub: l.bank_name ?? 'Loan', amount: Number(l.emi_amount), currency: l.currency || 'INR',
      kind: 'emi', payFrom: p.id, payFromSource: p.source, owner: { table: 'home_loans', id: l.id }, href: `/dashboard/loans/detail/${l.id}` })
  }
  for (const c of inp.accounts.filter(a => kindOf(a) === 'card' && inView(a.currency))) {
    const owed = Number(c.outstanding_bal) || 0
    const d = nextCardDue(c, today)
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
      kind: 'premium', payFrom: null, payFromSource: null, href: '/dashboard/insurance', why: 'From your policy' })
  }
  for (const p of (inp.lic ?? []).filter(p => p.is_active !== false && inView(p.currency || 'INR'))) {
    const every = policyEvery(p.premium_frequency), d = nextOccurrence(p.next_premium_date, today, every)
    const per = (Number(p.annual_premium) || 0) * every / 12
    if (!within(d) || !(per > 0) || (p.maturity_date && d! > String(p.maturity_date).slice(0, 10))) continue
    out.push({ id: `lic-${p.id}`, date: d!, label: `LIC ${p.name || p.plan_name || 'policy'} premium`, sub: 'LIC', amount: per, currency: p.currency || 'INR',
      kind: 'premium', payFrom: null, payFromSource: null, href: '/dashboard/bills', why: 'From your LIC policy' })
  }
  // Your own big bills (a policy's date is already above)
  for (const b of (inp.bills ?? []).filter(b => b.goal && !b.policy && inView(b.currency) && within(b.due) && !(inp.recurring ?? []).some(r => r.is_active && r.currency === b.currency && sameName(r.merchant, b.name)))) {
    out.push({ id: `big-${b.key}`, date: b.due, label: b.name, sub: 'Big bill', amount: b.amount, currency: b.currency, kind: 'bill', payFrom: null, payFromSource: null, href: '/dashboard/bills', category: b.category, why: 'A big bill you added' })
  }
  for (const m of inp.mutualFunds.filter(m => m.has_sip && Number(m.sip_amount) > 0 && m.sip_date && inView(m.currency ?? 'INR'))) {
    for (const ym of [ymOf(today), addMonths(ymOf(today), 1)]) {
      const d = `${ym}-${String(Math.min(Number(m.sip_date), daysInMonth(ym))).padStart(2, '0')}`
      if (!within(d) || (m.sip_last_month && ym <= m.sip_last_month)) continue
      const words = String(m.fund_name ?? '').toLowerCase().split(/\s+/).filter(w => w.length >= 4).slice(0, 2)
      const t = latest(inp.txns.filter(t => catOf(t) === 'Investment' && words.length && words.every(w => `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase().includes(w))))
      out.push({ id: `sip-${m.id}-${ym}`, date: d, label: `SIP · ${m.fund_name}`, sub: 'Mutual fund', amount: Number(m.sip_amount), currency: m.currency ?? 'INR',
        kind: 'sip', payFrom: t?.account_id ?? null, payFromSource: t ? 'history' : null, href: '/dashboard/investments/mutual-funds' })
    }
  }
  for (const r of (inp.rds ?? []).filter(r => r.is_active !== false && Number(r.monthly_amount) > 0 && r.start_date && inView(r.currency ?? 'INR'))) {
    const day = Number(String(r.start_date).slice(8, 10))
    for (const ym of [ymOf(today), addMonths(ymOf(today), 1)]) {
      const d = `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`
      if (!within(d) || (r.rd_last_month && ym <= r.rd_last_month) || d < String(r.start_date).slice(0, 10)) continue
      if (r.maturity_date && d > String(r.maturity_date).slice(0, 10)) continue
      out.push({ id: `rd-${r.id}-${ym}`, date: d, label: `RD · ${r.name}`, sub: r.bank_name ?? 'Recurring deposit', amount: Number(r.monthly_amount), currency: r.currency ?? 'INR',
        kind: 'sip', payFrom: r.rd_account_id ?? null, payFromSource: r.rd_account_id ? 'set' : null, href: '/dashboard/investments/recurring-deposits' })
    }
  }
  // What you declared you send to India leaves the UAE side (in the All view it's a move)
  if (view === 'uae') for (const p of (inp.plans ?? []).filter(x => x.is_active && x.kind === 'remit')) {
    const n = nextExpected(p, today, inp.txns)
    if (within(n.date)) out.push({ id: `plan-${p.id}-${n.ym}`, date: n.date, label: p.name, sub: 'Your monthly transfer', amount: Number(p.amount), currency: p.currency,
      kind: 'repeat', payFrom: p.account_id, payFromSource: 'set', href: '/dashboard/settings/income' })
  }
  // Repeating entries you've set up (money out only — not income or moves)
  const repeats = (inp.recurring ?? []).filter(r => r.is_active && isSpend(r) && inView(r.currency))
  for (const r of repeats) {
    const d = nextDate(r, today)
    if (!within(d)) continue
    out.push({ id: `rep-${r.id}`, date: d, label: r.merchant, sub: `Repeats monthly${r.auto_add ? ' · adds itself' : ''}`, amount: Number(r.amount), currency: r.currency,
      kind: 'repeat', payFrom: r.account_id, payFromSource: r.account_id ? 'set' : null, href: '/dashboard/bills', category: r.category, why: 'A repeating entry you set up' })
  }
  const repeatKeys = new Set(repeats.map(r => ruleTextFor(r.merchant)))
  // Bills & subscriptions not yet charged this month, on their usual day
  const month = ymOf(today), dayNow = Number(today.slice(8, 10))
  const spends = expandSplits(inp.txns).filter(t => isSpend(t) && inView(t.currency))
  for (const r of findRecurring(spends, month, t => Number(t.amount) || 0)) {
    if (repeatKeys.has(ruleTextFor(r.name))) continue
    const ym = r.paidThisMonth ? addMonths(month, 1) : r.day >= dayNow ? month : null
    if (!ym) continue
    const d = `${ym}-${String(Math.min(r.day, daysInMonth(ym))).padStart(2, '0')}`
    if (!within(d)) continue
    const last = latest(spends.filter(t => String(t.merchant ?? '').trim() === r.name))
    if (!isCounted(r, last?.currency, repeats, inp.answers, inp.bills)) continue          // already one of your entries, or you said it isn't regular
    const acc = inp.accounts.find(a => a.id === last?.account_id)
    out.push({ id: `bill-${r.key}`, date: d, label: r.name, sub: acc ? `Usually on ${acc.name}` : 'Bill or subscription', amount: r.med, currency: last?.currency ?? 'INR',
      kind: 'bill', payFrom: acc?.id ?? null, payFromSource: acc ? 'history' : null, href: '/dashboard/bills', category: r.category,
      why: `Found in your spending: about this amount in ${r.n} of the last 4 months`, seen: seenPayments(spends, r.name) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
}

// Regular income still to land in each account: each source on its own (salary,
// rent, interest, a named payer), seen in at least 2 of the last 3 months, on its
// usual day, less what's already arrived this month. One-offs (refunds, gifts,
// bonuses, deposits maturing) are never expected. A plain "Other" credit counts
// only when the same payer pays about the same amount each time.
const ONE_OFF_INCOME = new Set(['Refund', 'Gift', 'Tax Refund', 'Bonus', 'FD/RD Maturity', 'Freelance', 'One-off income'])
export function expectedIncome(txns: any[], accounts: any[], today: string, days: number, opts: { late?: boolean } = {}): ExpectedIn[] {
  const month = ymOf(today), months = [1, 2, 3].map(i => addMonths(month, -i)), dayNow = Number(today.slice(8, 10))
  const out: ExpectedIn[] = []
  for (const a of accounts.filter(a => kindOf(a) !== 'card')) {
    const groups: Record<string, any[]> = {}
    for (const t of txns) {
      if (t.account_id !== a.id || t.txn_type !== 'income' || ONE_OFF_INCOME.has(String(t.category ?? '').trim())) continue
      const c = String(t.category ?? '').trim()
      const plain = !c || c === 'Other' || c === 'Transfer'
      const key = plain ? `payer:${ruleTextFor(t.merchant) || t.id}` : `cat:${c}`
      ;(groups[key] ||= []).push(t)
    }
    for (const [key, inc] of Object.entries(groups)) {
      const per = months.map(m => inc.filter(t => ymOf(t.txn_date) === m)).filter(xs => xs.length)
      if (per.length < 2) continue
      const totals = per.map(xs => xs.reduce((s, t) => s + (Number(t.amount) || 0), 0))
      const usual = median(totals)
      if (!(usual > 0)) continue
      if (key.startsWith('payer:') && totals.some(v => Math.abs(v - usual) > usual * 0.25)) continue
      const day = median(per.map(xs => Number(xs.reduce((b, t) => (Number(t.amount) > Number(b.amount) ? t : b)).txn_date.slice(8, 10))))
      const got = inc.filter(t => ymOf(t.txn_date) === month).reduce((s, t) => s + (Number(t.amount) || 0), 0)
      const top = latest(inc)
      const row = (ym: string, amount: number, date: string, late: boolean): ExpectedIn => ({ id: `in-${a.id}-${key}-${ym}`, accountId: a.id, date, amount, currency: a.currency,
        label: top?.merchant || top?.category || 'Usual income', accountName: a.name, usual, day, months: per.length, got, late })
      const dated = (ym: string) => `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`
      let found: ExpectedIn | null = null
      if (got >= usual * 0.8) found = row(addMonths(month, 1), usual, dated(addMonths(month, 1)), false)      // this month's has arrived: next month's
      else if (day >= dayNow) found = row(month, usual - got, dated(month), false)
      else if (opts.late) found = row(month, usual - got, today, true)                                        // its day has passed and it isn't recorded yet
      if (found && daysBetween(today, found.date) <= days) out.push(found)
    }
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
export interface SafeToSpend { amount: number; cash: number; dueBefore: number; dueCount: number; unlinked: number; reserved: number; until: string; payday: boolean; days: number; perDay: number | null }
export function safeToSpend(inp: { today: string; view: View; fx: number; accounts: any[]; dues: Due[]; txns: any[]; payday?: string | null; bills?: Bill[] }): SafeToSpend {
  const { today, view, fx } = inp
  const isIncome = (t: any) => isIncomeIn(t, view)
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  // Next payday: the day the month's biggest income usually lands
  const month = ymOf(today)
  const days: number[] = []
  // (the same income every screen counts: in India, what lands from UAE; not your own moves)
  const earned = prepareMoney(inp.txns, { fx })
  for (const m of [1, 2, 3].map(i => addMonths(month, -i))) {
    const top = earned.filter(t => ymOf(t.txn_date) === m && inView(t.currency) && isIncome(t))
      .sort((a, b) => viewAmount(b.amount, b.currency, view, fx) - viewAmount(a.amount, a.currency, view, fx))[0]
    if (top) days.push(Number(top.txn_date.slice(8, 10)))
  }
  const payDay = days.length ? days.sort((a, b) => days.filter(d => d === b).length - days.filter(d => d === a).length || a - b)[0] : null
  let until = addDaysTo(today, 30)
  if (payDay) {
    const ym = payDay > Number(today.slice(8, 10)) ? month : addMonths(month, 1)
    until = `${ym}-${String(Math.min(payDay, daysInMonth(ym))).padStart(2, '0')}`
  }
  if (inp.payday) until = inp.payday                  // the day you declared
  const cardIds = new Set(inp.accounts.filter(a => kindOf(a) === 'card').map(a => a.id))
  const cash = inp.accounts.filter(a => kindOf(a) !== 'card' && inView(a.currency))
    .reduce((s, a) => s + Math.max(0, viewAmount(Number(a.current_balance) || 0, a.currency, view, fx)), 0)
  const before = inp.dues.filter(d => d.date <= until && !(d.payFrom && cardIds.has(d.payFrom)))
  const dueBefore = before.reduce((s, d) => s + viewAmount(d.amount, d.currency, view, fx), 0)
  // Auto entries with no account yet: no balance has moved for them, so they come off here
  const unlinked = inp.txns.filter(t => t.auto_status === 'pending' && !t.account_id && !t.paid_by_friend_id && inView(t.currency))
    .reduce((s, t) => s + viewAmount(Number(t.amount) || 0, t.currency, view, fx), 0)
  // Set aside for big bills: still in the bank, but not free to spend
  const reserved = (['AED', 'INR'] as const).filter(inView).reduce((s, c) => s + viewAmount(reservedFor(inp.bills ?? [], c, until, today), c, view, fx), 0)
  const amount = cash - dueBefore - unlinked - reserved
  const n = Math.max(1, daysBetween(today, until))
  return { amount, cash, dueBefore, dueCount: before.length, unlinked, reserved, until, payday: !!payDay || !!inp.payday, days: n, perDay: amount > 0 ? amount / n : null }
}
