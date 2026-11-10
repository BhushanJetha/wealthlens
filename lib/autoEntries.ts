// Entries the app made for you (auto_ref): approve them, undo them ("Not
// paid" also takes back the SIP units or the loan payment), and let the real
// row from a statement replace them, so the same money is never counted twice.
import { daysBetween, normMerchant } from './insights'
import { ruleTextFor } from './rules'
import { emiInBank } from './loanAuto'
import { sipInBank } from './sipAuto'
import { rdInBank, rdStep } from './rdAuto'

export const isAutoPending = (t: any) => t?.auto_status === 'pending'
export const AUTO_KIND_TEXT: Record<string, string> = { repeat: 'Repeating expense', emi: 'Loan EMI', sip: 'SIP', rd: 'RD instalment', plan: 'Added by you' }

async function adjustFund(sb: any, ref: any, units: number, invested: number) {
  const { data: f } = await sb.from('mutual_funds').select('units,invested_amount').eq('id', ref.id).single()
  if (f) await sb.from('mutual_funds').update({ units: Math.max(0, (Number(f.units) || 0) + units), invested_amount: Math.max(0, (Number(f.invested_amount) || 0) + invested) }).eq('id', ref.id)
}
// The fund or loan records follow the amount when it was corrected
async function syncAmount(sb: any, ref: any, amount: number) {
  const was = Number(ref.amount) || 0
  if (Math.abs(was - amount) < 0.005) return
  if (ref.kind === 'emi' && ref.loan_txn_id) {
    const { data } = await sb.from('loan_transactions').select('interest').eq('id', ref.loan_txn_id).single()
    const interest = Math.min(Number(data?.interest) || 0, amount)
    await sb.from('loan_transactions').update({ amount, interest, principal: amount - interest }).eq('id', ref.loan_txn_id)
  }
  if (ref.kind === 'sip') {
    const units = ref.nav > 0 ? amount / ref.nav : 0
    await adjustFund(sb, ref, units - (Number(ref.units) || 0), amount - was)
    if (ref.inv_txn_id) await sb.from('investment_transactions').update({ amount, units: units || null }).eq('id', ref.inv_txn_id)
  }
}

export async function approveAuto(sb: any, t: any): Promise<string | null> {
  const ref = t.auto_ref ?? {}, amount = Number(t.amount) || 0
  await syncAmount(sb, ref, amount)
  const units = ref.kind === 'sip' && ref.nav > 0 ? { units: amount / ref.nav } : {}
  const { error } = await sb.from('transactions').update({ auto_status: null, auto_ref: { ...ref, ...units, amount } }).eq('id', t.id)
  return error?.message ?? null
}

// Not paid: the entry goes and what it did is undone. The month stays ticked
// off, so it doesn't come back.
export async function rejectAuto(sb: any, t: any): Promise<string | null> {
  const ref = t.auto_ref ?? {}
  const { error } = await sb.from('transactions').delete().eq('id', t.id)
  if (error) return error.message
  if (ref.kind === 'emi' && ref.loan_txn_id) await sb.from('loan_transactions').delete().eq('id', ref.loan_txn_id)
  // An RD counted the instalment when the month was entered (lib/rdAuto): it comes off
  if (ref.kind === 'rd' && ref.id) {
    const { data: r } = await sb.from('recurring_deposits').select('*').eq('id', ref.id).maybeSingle()
    const step = r ? rdStep(r, -1) : {}
    if (Object.keys(step).length) await sb.from('recurring_deposits').update(step).eq('id', ref.id)
  }
  if (ref.kind === 'sip') {
    await adjustFund(sb, ref, -(Number(ref.units) || 0), -(Number(ref.amount) || 0))
    if (ref.inv_txn_id) await sb.from('investment_transactions').delete().eq('id', ref.inv_txn_id)
  }
  return null
}

// A statement (or you) recorded the real payment: it replaces the auto entry,
// and its real amount wins. Each real row replaces one entry. Returns the ids removed.
export async function reconcileAuto(sb: any, txns: any[], src: { loans: any[]; funds: any[]; rds: any[]; aliases?: Record<string, string[]> }): Promise<Set<string>> {
  const removed = new Set<string>(), used = new Set<any>()
  const real = txns.filter(t => !t.auto_ref && !t.recurring_id && !t._remit && t.txn_type !== 'income')
  for (const a of txns.filter(t => t.auto_ref)) {
    const ref = a.auto_ref, pool = real.filter(t => !used.has(t)), date = a.txn_date, amount = Number(a.amount) || 0
    let hit: any = null
    if (ref.kind === 'plan' || ref.kind === 'bill') {
      // Something you added from Expected income: the statement's row, same account
      // and direction, within 5 days and 1%, is the same money. Anything less sure is left for Review.
      hit = txns.find(t => !t.auto_ref && !used.has(t) && t.id !== a.id && t.account_id === a.account_id && t.currency === a.currency
        && (t.txn_type === 'income') === (a.txn_type === 'income') && Math.abs(daysBetween(date, t.txn_date)) <= 5
        && Math.abs((Number(t.amount) || 0) - amount) <= amount * 0.01) ?? null
    } else if (ref.kind === 'repeat') {
      const key = ruleTextFor(a.merchant)
      hit = pool.find(t => t.currency === a.currency && Math.abs(daysBetween(date, t.txn_date)) <= 7 && (
        (!!key && ruleTextFor(t.merchant) === key && Math.abs((Number(t.amount) || 0) - amount) <= amount * 0.1)
        || (t.category === a.category && Math.abs((Number(t.amount) || 0) - amount) <= amount * 0.02))) ?? null
      // The bank's name for this entry, as you told us
      const names = src.aliases?.[ref.id] ?? []
      if (!hit && names.length) hit = pool.find(t => t.currency === a.currency && names.includes(normMerchant(t.merchant)) && Math.abs(daysBetween(date, t.txn_date)) <= 15
        && Math.abs((Number(t.amount) || 0) - amount) <= amount * 0.15) ?? null
    } else if (ref.kind === 'emi') {
      const loan = src.loans.find(l => l.id === ref.id)
      if (loan) hit = emiInBank({ loan, month: ref.month, date, amount, principal: 0, interest: 0 }, pool, src.loans)
    } else if (ref.kind === 'sip') {
      const fund = src.funds.find(f => f.id === ref.id)
      if (fund) hit = sipInBank({ fund, date, amount }, pool)
    } else if (ref.kind === 'rd') {
      const rd = src.rds.find(r => r.id === ref.id)
      if (rd) hit = rdInBank({ rd, month: ref.month, date, amount }, pool)
    }
    if (!hit) continue
    const { error } = await sb.from('transactions').delete().eq('id', a.id)
    if (error) continue
    used.add(hit); removed.add(a.id)
    await syncAmount(sb, ref, Number(hit.amount) || 0)
    if (ref.kind === 'repeat') await sb.from('transactions').update({ recurring_id: ref.id }).eq('id', hit.id)
  }
  return removed
}
