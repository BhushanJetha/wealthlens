// EMI tracking (migration 028): on a loan's EMI day the month's EMI is
// recorded as a loan payment — straight away when your bank statement shows
// it (or you've chosen "record it for me"), else after a one-tap "Paid?".
// Recorded EMIs bring the live outstanding down (lib/loans liveOutstanding).
import { ymOf, addMonths, daysBetween } from './insights'
import { dateIn } from './recurring'
import { catOf } from './money'
import { matchScore, liveOutstanding } from './loans'

export interface EmiDue { loan: any; month: string; date: string; amount: number; principal: number; interest: number; evidence?: any }

const EMI_CATS = new Set(['EMI/Loan', 'Loan on Card'])
const emiDay = (l: any) => Number(String(l.next_emi_date ?? '').slice(8, 10)) || 0

// This month's EMI (and last month's, if it was never settled) once its day has come
export function dueEmis(loans: any[], today: string, loanTxns: any[]): EmiDue[] {
  const now = ymOf(today), out: EmiDue[] = []
  for (const l of loans) {
    const day = emiDay(l), emi = Number(l.emi_amount) || 0
    if (!day || emi <= 0 || l.is_active === false || !('emi_last_month' in l)) continue
    const months = l.emi_last_month ? [addMonths(now, -1), now] : [now]
    for (const m of months) {
      if (l.emi_last_month && m <= l.emi_last_month) continue
      // Not before the loan began, nor before a "next EMI" date that's still ahead
      // (a loan on a card can be billed in the month it was taken)
      const date = dateIn(m, day)
      if (l.loan_start_date && date < String(l.loan_start_date).slice(0, 10)) continue
      const next = String(l.next_emi_date).slice(0, 10)
      if (next > today && ymOf(next) > m) continue
      if (date > today) continue
      // Split from the live balance (interest on what's owed, the rest is principal)
      const bal = liveOutstanding(l, loanTxns)?.value ?? (Number(l.outstanding_amt) || 0)
      if (bal <= 0.5) continue                                  // repaid — no more EMIs
      const interest = Math.round(bal * (Number(l.interest_rate) || 0) / 1200)
      out.push({ loan: l, month: m, date, amount: emi, interest: Math.min(interest, emi), principal: Math.max(emi - interest, 0) })
    }
  }
  return out
}

// Already in the loan's records this month?
export const emiRecorded = (d: EmiDue, loanTxns: any[]) =>
  loanTxns.some(t => t.loan_id === d.loan.id && t.kind === 'emi' && ymOf(t.txn_date) === d.month)

// The bank debit for it: an EMI payment naming the lender (or the only loan
// in that currency), within a week of the EMI day, amount ±15%
export function emiInBank(d: EmiDue, txns: any[], loans: any[]): any | null {
  const cur = d.loan.currency || 'INR'
  const only = loans.filter(l => (l.currency || 'INR') === cur).length === 1
  return txns.find(t => (EMI_CATS.has(catOf(t)) || t.txn_type === 'loan') && t.currency === cur
    && Math.abs(daysBetween(d.date, t.txn_date)) <= 7
    && Math.abs((Number(t.amount) || 0) - d.amount) <= d.amount * 0.15
    && (only || matchScore(d.loan, t) > 0)) ?? null
}

export async function claimEmiMonth(supabase: any, loan: any, month: string): Promise<boolean> {
  let q = supabase.from('home_loans').update({ emi_last_month: month }).eq('id', loan.id)
  q = loan.emi_last_month ? q.eq('emi_last_month', loan.emi_last_month) : q.is('emi_last_month', null)
  const { data, error } = await q.select('id')
  if (!error && data?.length) { loan.emi_last_month = month; return true }
  return false
}

// Record one month's EMI. `moneyRow` also adds the payment to your
// transactions (when no bank statement has it).
export async function recordEmi(supabase: any, userId: string, d: EmiDue, opts: { moneyRow: boolean; note: string }): Promise<string | null> {
  const before = d.loan.emi_last_month ?? null
  if (!(await claimEmiMonth(supabase, d.loan, d.month))) return 'Already recorded'
  const paidOn = d.evidence?.txn_date ?? d.date, amount = Number(d.evidence?.amount) || d.amount
  const { error } = await supabase.from('loan_transactions').insert({
    user_id: userId, loan_id: d.loan.id, kind: 'emi', txn_date: paidOn, amount,
    principal: Math.max(amount - d.interest, 0), interest: Math.min(d.interest, amount), note: opts.note,
  })
  if (error) {
    await supabase.from('home_loans').update({ emi_last_month: before }).eq('id', d.loan.id)
    d.loan.emi_last_month = before
    return error.message
  }
  // A loan on a card is billed to the card: it's a card-loan payment, not new
  // spending (the money was counted when it was spent) — so never counted twice
  const onCard = d.loan.loan_type === 'loan_on_card'
  if (opts.moneyRow) await supabase.from('transactions').insert({
    user_id: userId, txn_date: paidOn, merchant: `${d.loan.name} EMI`, category: onCard ? 'Loan on Card' : 'EMI/Loan', txn_type: 'loan', amount,
    currency: d.loan.currency || 'INR', country: (d.loan.currency || 'INR') === 'AED' ? 'UAE' : 'India',
    account_id: d.loan.pay_from_account_id ?? null, source: 'manual', is_verified: true,
  })
  return null
}

// On page load: record what the bank shows (or auto loans), tick off months
// already recorded, and return the rest for a confirm.
export async function runEmis(supabase: any, userId: string, today: string, loans: any[], txns: any[], loanTxns: any[]) {
  const pending: EmiDue[] = []
  if (!loans.length || !('emi_last_month' in loans[0])) return { ready: loans.length === 0, pending }
  for (const d of dueEmis(loans, today, loanTxns)) {
    if (emiRecorded(d, loanTxns)) { await claimEmiMonth(supabase, d.loan, d.month); continue }
    const bank = emiInBank(d, txns, loans)
    if (bank) { d.evidence = bank; await recordEmi(supabase, userId, d, { moneyRow: false, note: 'Found in your bank statement' }) }
    else if (d.loan.emi_auto) await recordEmi(supabase, userId, d, { moneyRow: true, note: 'Recorded on the EMI day' })
    else pending.push(d)
  }
  return { ready: true, pending }
}
