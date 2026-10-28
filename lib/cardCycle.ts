// Credit-card statement cycle: when the statement closes, when it's due, and
// how many interest-free days a purchase made today gets — so the card whose
// statement has just closed is the one to use.
//
// The statement day is the one you set (accounts.statement_day, migration
// 027); without it, it's estimated from the due date (UAE cards are usually
// due ~25 days after the statement, Indian cards ~20).
import { addMonths, daysInMonth, daysBetween, ymOf, addDaysTo, nextCardDue } from './insights'

export interface Cycle {
  statementDay: number; estimated: boolean
  grace: number                // days from statement to due date
  closes: string               // next statement date (today or later)
  payBy: string                // due date for a purchase made today
  freeDays: number             // interest-free days for a purchase made today
  lastClosed: string           // the statement before `closes`
}

const GRACE: Record<string, number> = { AED: 25, INR: 20 }
const onDay = (ym: string, day: number) => `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`

export function cycleOf(card: any, today: string): Cycle | null {
  const due = nextCardDue(card, today)
  const defGrace = GRACE[card.currency] ?? 20
  let day = Number(card.statement_day) || 0, estimated = false
  if (!day) {
    if (!due) return null
    day = Number(addDaysTo(due, -defGrace).slice(8, 10)); estimated = true
  }
  // Grace: from the statement before the saved due date to that due date
  let grace = defGrace
  if (due) {
    let st = onDay(ymOf(due), day)
    if (st >= due) st = onDay(addMonths(ymOf(due), -1), day)
    const g = daysBetween(st, due)
    if (g >= 10 && g <= 35) grace = g
  }
  let closes = onDay(ymOf(today), day)
  if (closes < today) closes = onDay(addMonths(ymOf(today), 1), day)
  const lastClosed = onDay(addMonths(ymOf(closes), -1), day)
  // With a due day, the bill is due on that day after the statement closes
  // (months differ in length, so a fixed number of days drifts)
  const payBy = due ? nextCardDue(card, addDaysTo(closes, 1))! : addDaysTo(closes, grace)
  return { statementDay: day, estimated, grace: daysBetween(closes, payBy), closes, payBy, freeDays: daysBetween(today, payBy), lastClosed }
}

// Loans on a card (cash on card, a purchase turned into EMIs — migration 033):
// their EMIs are billed to it, and what's still owed blocks that much limit
export const loansOnCard = (card: any, loans: any[] = []) =>
  loans.filter(l => l.pay_from_account_id === card.id && l.loan_type === 'loan_on_card' && l.is_active !== false)
// What's owed, blocked by loans, and still free to spend on a card
export function cardLimits(card: any, loans: any[] = []) {
  const limit = Number(card.credit_limit) || 0, owed = Math.max(0, Number(card.outstanding_bal) || 0)
  const blocked = loansOnCard(card, loans).reduce((s, l) => s + Math.max(0, Number(l.outstanding_amt) || 0), 0)
  return { limit, owed, blocked, available: limit > 0 ? Math.max(0, limit - owed - blocked) : null, util: limit > 0 ? (owed + blocked) / limit * 100 : null }
}

export interface CardPick { card: any; cycle: Cycle; available: number | null; util: number | null }

// Cards in a currency, best first: most interest-free days, among cards with
// room left (under 90% used). Spending in the card's own currency avoids
// foreign-exchange fees, so AED spends get AED cards and ₹ spends ₹ cards.
export function rankCards(cards: any[], currency: string, today: string, loans: any[] = []): CardPick[] {
  return cards.filter(c => c.account_type === 'credit_card' && c.is_active !== false && c.currency === currency)
    .map(c => { const l = cardLimits(c, loans); return { card: c, cycle: cycleOf(c, today)!, available: l.available, util: l.util } })
    .filter(p => p.cycle)
    .sort((a, b) => Number((a.util ?? 0) >= 90) - Number((b.util ?? 0) >= 90) || b.cycle.freeDays - a.cycle.freeDays)
}
