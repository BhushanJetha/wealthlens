// One home and the money behind it: what it cost (price, stamp duty and
// registration, other charges), your own money paid in, the loan (each
// release, EMI and prepayment — the loan's own records, lib/loans), what's
// still to pay the builder and who pays it, what's yours today (worth − what
// the loan still owes), and what happens by the time the loan is paid off.
// Nothing here is entered twice: the loan's records stay on the loan, and the
// property only reads them.
import { loanOwedOn } from './loans'
import { simulatePayoff } from './amortization'
import { otherAssetValue } from './otherAssets'

export type Payer = 'loan' | 'self' | 'both'
export interface Step { id: string; label: string; due: string | null; amount: number; payer: Payer }
export interface OwnPay { id?: string; date: string; amount: number; note?: string | null; source?: 'loan' | 'property' }
export interface LedgerRow { id: string; date: string; kind: 'disbursement' | 'emi' | 'prepayment'; amount: number; principal: number; interest: number; owedAfter: number; note: string | null }
export interface StepStatus extends Step { paidLoan: number; paidOwn: number; left: number; fromLoan: number; fromYou: number; status: 'paid' | 'part' | 'due' }

const MOVES = ['disbursement', 'emi', 'prepayment']
const day = (d: any) => String(d ?? '').slice(0, 10)
const dayBefore = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) }
export const addMonthsTo = (d: string, n: number) => { const x = new Date(`${d.slice(0, 10)}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10) }
const yearsBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (365.25 * 864e5)

// The loan's records, oldest first: each with its principal and interest, and
// what was still owed after it. Worked out the same way as the Loans page
// (liveOutstanding): an EMI without its own split pays a month's interest on
// the running balance and the rest comes off as principal.
export function loanLedger(loanIn: any, txns: any[]): LedgerRow[] {
  const loan = savedLoan(loanIn)
  const mine = txns.filter(t => t.loan_id === loan.id && MOVES.includes(t.kind)).sort((a, b) => day(a.txn_date).localeCompare(day(b.txn_date)))
  if (!mine.length) return []
  const r = (Number(loan.interest_rate) || 0) / 1200
  let bal = loanOwedOn(loan, txns, dayBefore(day(mine[0].txn_date)))
  return mine.map((t, k) => {
    const amt = Number(t.amount) || 0
    let principal = 0, interest = 0
    if (t.kind === 'disbursement') bal += amt
    else if (t.kind === 'prepayment') { principal = Math.min(amt, bal); bal -= principal }
    else {
      interest = t.interest != null ? Number(t.interest) : bal * r
      principal = Math.min(t.principal != null ? Number(t.principal) : Math.max(amt - interest, 0), bal)
      bal -= principal
    }
    return { id: t.id ?? `t${k}`, date: day(t.txn_date), kind: t.kind, amount: amt, principal: Math.round(principal), interest: Math.round(interest), owedAfter: Math.max(0, Math.round(bal)), note: t.note ?? null }
  })
}

// A loan as saved: pages get the live balance in outstanding_amt (lib/loans
// withPaidEmi), but walking its records needs the balance saved on its date
export const savedLoan = (l: any) => (l?.outstanding_live ? { ...l, outstanding_amt: l.outstanding_live.saved } : l)

// The builder's schedule: the property's own, else the loan's payment plan (older records)
export function stepsOf(asset: any, plan: any[] = []): Step[] {
  if (Array.isArray(asset?.schedule) && asset.schedule.length) return asset.schedule.map((s: any, i: number) => ({
    id: String(s.id ?? `s${i}`), label: String(s.label ?? `Step ${i + 1}`), due: s.due ? day(s.due) : null, amount: Number(s.amount) || 0, payer: (['loan', 'self', 'both'].includes(s.payer) ? s.payer : 'both') as Payer,
  }))
  return [...plan].sort((a, b) => (a.slab_no ?? 0) - (b.slab_no ?? 0)).map((p, i) => ({ id: String(p.id ?? `p${i}`), label: String(p.milestone ?? `Step ${i + 1}`), due: p.due_date ? day(p.due_date) : null, amount: Number(p.amount) || 0, payer: 'both' as Payer }))
}

export function propertyModel(inp: { asset: any; loan: any | null; txns: any[]; plan?: any[]; today: string }) {
  const { asset, loan, txns, today } = inp
  const v = otherAssetValue(asset, today), value = v.value
  const growth = Number(asset.growth_pct) || 0
  // What it cost
  const b = asset.cost_breakup ?? {}
  const price = Number(b.price) || Number(asset.purchase_price) || Number(loan?.property_cost) || 0
  const stamp = Number(b.stamp) || 0, other = Number(b.other) || 0, total = price + stamp + other

  // Your own money: down payments kept on the loan, and any kept on the property
  const own: OwnPay[] = [
    ...(loan ? txns.filter(t => t.loan_id === loan.id && t.kind === 'own_contribution').map(t => ({ id: t.id, date: day(t.txn_date), amount: Number(t.amount) || 0, note: t.note ?? null, source: 'loan' as const })) : []),
    ...(Array.isArray(asset.own_payments) ? asset.own_payments.map((p: any) => ({ id: p.id, date: day(p.date), amount: Number(p.amount) || 0, note: p.note ?? null, source: 'property' as const })) : []),
  ].filter(p => p.amount > 0).sort((a, c) => a.date.localeCompare(c.date))
  const ownPaid = own.reduce((s, p) => s + p.amount, 0)

  // The loan
  const ledger = loan ? loanLedger(loan, txns) : []
  const releases = ledger.filter(x => x.kind === 'disbursement')
  const owed = loan ? Math.max(0, Number(loan.outstanding_amt) || 0) : 0
  const drawnRec = releases.reduce((s, x) => s + x.amount, 0)
  const drawn = loan ? Math.max(drawnRec || Number(loan.disbursed_amt) || Number(loan.sanctioned_amt) || 0, owed) : 0
  const sanctioned = loan ? Math.max(Number(loan.sanctioned_amt) || 0, drawn) : 0
  const rate = Number(loan?.interest_rate) || 0, emi = Number(loan?.emi_amount) || 0
  const interestPaid = ledger.reduce((s, x) => s + x.interest, 0)
  const emis = ledger.filter(x => x.kind === 'emi').length
  const payoff = loan && owed > 0 && emi > 0 ? simulatePayoff(owed, rate, emi) : { months: 0, interest: 0 }
  const payoffDate = loan && Number.isFinite(payoff.months) && payoff.months > 0 ? addMonthsTo(today, payoff.months) : null

  // The builder's schedule, paid in date order by the loan's releases and your own money
  const steps = stepsOf(asset, inp.plan)
  const pays = [
    ...(drawnRec > 0 ? releases.map(x => ({ date: x.date, amt: x.amount, src: 'loan' as const })) : drawn > 0 ? [{ date: day(loan?.loan_start_date) || today, amt: drawn, src: 'loan' as const }] : []),
    ...own.map(p => ({ date: p.date, amt: p.amount, src: 'own' as const })),
  ].sort((a, c) => a.date.localeCompare(c.date))
  let k = 0, rem = pays[0]?.amt ?? 0
  let loanLeft = Math.max(0, sanctioned - drawn)
  const schedule: StepStatus[] = steps.map(s => {
    let need = s.amount, paidLoan = 0, paidOwn = 0
    while (need > 0.5 && k < pays.length) {
      const take = Math.min(need, rem)
      if (pays[k].src === 'loan') paidLoan += take; else paidOwn += take
      need -= take; rem -= take
      if (rem <= 0.5) { k++; rem = pays[k]?.amt ?? 0 }
    }
    const left = Math.max(0, need)
    const fromLoan = s.payer === 'self' ? 0 : Math.min(left, loanLeft)
    loanLeft -= fromLoan
    return { ...s, paidLoan, paidOwn, left, fromLoan, fromYou: left - fromLoan, status: left <= 0.5 ? 'paid' : paidLoan + paidOwn > 0.5 ? 'part' : 'due' }
  })
  const stillToPay = schedule.length ? schedule.reduce((s, x) => s + x.left, 0) : Math.max(0, total - ownPaid - drawn)
  const stillLoan = schedule.length ? schedule.reduce((s, x) => s + x.fromLoan, 0) : Math.min(stillToPay, Math.max(0, sanctioned - drawn))
  const stillYou = stillToPay - stillLoan

  // Yours today, and at the loan's end
  const yours = value - owed
  const atEnd = payoffDate ? { date: payoffDate, value: value * Math.pow(1 + growth / 100, payoff.months / 12), interest: interestPaid + payoff.interest } : null

  // Year by year: what it's worth (past: from what you paid to today's value; ahead: your yearly rise) and what the loan owes
  const startDay = day(asset.purchase_date) || day(loan?.loan_start_date) || ledger[0]?.date || today
  const startYear = Number(startDay.slice(0, 4)), nowYear = Number(today.slice(0, 4))
  const endYear = atEnd ? Number(atEnd.date.slice(0, 4)) : nowYear + 10
  const r = rate / 1200
  const futureOwed = new Map<number, number>()
  if (loan && owed > 0 && emi > 0) {
    let bal = owed, d = today
    for (let m = 1; m <= 600 && bal > 0.5; m++) { const i = bal * r; bal -= Math.min(Math.max(emi - i, 0), bal); d = addMonthsTo(today, m); futureOwed.set(Number(d.slice(0, 4)), bal) }
  }
  const basis = total || price || value
  const years = Array.from({ length: Math.max(1, endYear - startYear + 1) }, (_, i) => {
    const y = startYear + i, at = y < nowYear ? `${y}-12-31` : y === nowYear ? today : `${y}-12-31`
    const worth = at <= today
      ? (startDay < today ? basis + (value - basis) * Math.max(0, Math.min(1, yearsBetween(startDay, at) / Math.max(yearsBetween(startDay, today), 1e-6))) : value)
      : value * Math.pow(1 + growth / 100, yearsBetween(today, at))
    const loanStart = day(loan?.loan_start_date)
    const owe = !loan ? 0 : at <= today ? (loanStart && loanStart > at ? 0 : at === today ? owed : loanOwedOn(savedLoan(loan), txns, at)) : (futureOwed.get(y) ?? 0)
    return { year: y, at, worth: Math.round(worth), owed: Math.round(owe), past: at <= today }
  })

  // Each year so far: borrowed, principal paid back, owed at its end
  const ledgerYears = Array.from(new Set(ledger.map(x => Number(x.date.slice(0, 4))))).sort()
  const byYear = ledgerYears.length ? Array.from({ length: nowYear - ledgerYears[0] + 1 }, (_, i) => {
    const y = ledgerYears[0] + i, rows = ledger.filter(x => x.date.startsWith(String(y)))
    return { year: y, borrowed: rows.filter(x => x.kind === 'disbursement').reduce((s, x) => s + x.amount, 0), repaid: rows.reduce((s, x) => s + x.principal, 0),
      prepaid: rows.filter(x => x.kind === 'prepayment').reduce((s, x) => s + x.principal, 0), interest: rows.reduce((s, x) => s + x.interest, 0),
      owedEnd: rows.length ? rows[rows.length - 1].owedAfter : (loan ? loanOwedOn(savedLoan(loan), txns, y === nowYear ? today : `${y}-12-31`) : 0) }
  }) : []

  return {
    currency: v.currency, value, growth, valueAsOf: day(asset.value_as_of) || null,
    cost: { price, stamp, other, total }, own, ownPaid,
    loan: loan ? { id: loan.id, name: String(loan.name ?? 'Loan'), sanctioned, drawn, owed, repaid: Math.max(0, drawn - owed), toRelease: Math.max(0, sanctioned - drawn), rate, emi, interestPaid, emis, ledger,
      payoff: payoffDate ? { date: payoffDate, months: payoff.months, interest: payoff.interest } : null } : null,
    schedule, stillToPay, stillLoan, stillYou,
    yours, yoursPct: value > 0 ? Math.max(0, Math.min(100, Math.round(yours / value * 100))) : 0,
    atEnd, years, byYear,
  }
}
export type PropertyModel = ReturnType<typeof propertyModel>

// What to do next, from the numbers (each with the page it opens)
export function propertyIdeas(m: PropertyModel, today: string, fmt: (n: number) => string) {
  const out: { tone: 'due' | 'plan' | 'save' | 'info'; title: string; detail: string; href?: string }[] = []
  const next = m.schedule.find(s => s.left > 0.5)
  if (next) {
    const when = next.due ? new Date(`${next.due}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'next'
    out.push(next.fromLoan >= next.left - 0.5
      ? { tone: 'due', title: `${fmt(next.left)} due ${when} — the loan pays it`, detail: 'Send the builder’s demand letter to the bank a week before, so it’s released on time.' }
      : { tone: 'due', title: `${fmt(next.left)} due ${when}${next.fromLoan > 0 ? ` — ${fmt(next.fromYou)} from you` : ' — from you'}`, detail: next.fromLoan > 0 ? `The loan covers ${fmt(next.fromLoan)}; the rest is yours to pay.` : 'Keep it ready in your bank before the date.' })
  }
  const mine = m.schedule.filter(s => s.fromYou > 0.5 && s.due && s.due > today)
  if (mine.length) {
    const amt = mine.reduce((s, x) => s + x.fromYou, 0), last = mine[mine.length - 1].due!
    const months = Math.max(1, Math.round(yearsBetween(today, last) * 12))
    out.push({ tone: 'plan', title: `Set aside ${fmt(Math.ceil(amt / months / 1000) * 1000)} a month`, detail: `Your ${fmt(amt)} still to pay is due by ${new Date(`${last}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })} — ${months} month${months === 1 ? '' : 's'} from now. Make it a goal.`, href: '/dashboard/goals' })
  }
  if (m.loan && m.loan.owed > 0 && m.loan.emi > 0 && m.loan.payoff) {
    const extra = m.currency === 'AED' ? 10000 : 100000
    const sim = simulatePayoff(m.loan.owed, m.loan.rate, m.loan.emi, 0, extra)
    if (Number.isFinite(sim.months) && sim.months < m.loan.payoff.months) {
      const saved = m.loan.payoff.months - sim.months
      out.push({ tone: 'save', title: `Prepay ${fmt(extra)} a year: done ${saved >= 12 ? `${Math.round(saved / 6) / 2} years` : `${saved} months`} sooner`, detail: `About ${fmt(Math.max(0, m.loan.payoff.interest - sim.interest))} less interest. Try your own amount on the loan.`, href: `/dashboard/loans/detail/${m.loan.id}` })
    }
  }
  if (!m.valueAsOf || yearsBetween(m.valueAsOf, today) > 1) out.push({ tone: 'info', title: m.valueAsOf ? `Value last set ${new Date(`${m.valueAsOf}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}` : 'Set what it’s worth', detail: 'Check what similar homes nearby sell for, and update it once a year.' })
  return out
}
