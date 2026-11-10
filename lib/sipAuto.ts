// SIP tracking (migration 028): on each SIP's day the instalment is recorded
// — units at the latest NAV, the fund's units and invested amount updated, a
// dated record for the investment charts — straight away when your bank
// statement shows the debit (or you've chosen "record it for me"), else after
// a one-tap confirm. A fund can have several SIPs (migration 047, lib/sips);
// each month of each SIP is recorded once.
import { ymOf, addMonths, daysBetween } from './insights'
import { dateIn, autoTag } from './recurring'
import { catOf } from './money'
import { sipsOf, claimSip, type Sip } from './sips'

export interface SipDue { fund: any; sip: Sip; month: string; date: string; amount: number; nav: number; evidence?: any }

const words = (name: string) => String(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4).slice(0, 2)
export const navOf = (f: any) => Number(f.current_nav) || Number(f.avg_nav) || 0

// This month's instalment of every SIP (and last month's, if never settled) once its day has come
export function dueSips(funds: any[], today: string): SipDue[] {
  const now = ymOf(today), out: SipDue[] = []
  for (const f of funds) {
    if (!('sip_last_month' in f)) continue
    for (const s of sipsOf(f)) {
      const months = s.last_month ? [addMonths(now, -1), now] : [now]
      for (const m of months) {
        if (s.last_month && m <= s.last_month) continue
        const date = dateIn(m, s.day)
        if (date <= today) out.push({ fund: f, sip: s, month: m, date, amount: Number(s.amount), nav: navOf(f) })
      }
    }
  }
  return out
}

const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.1
// Already in the fund's history this month (CAS import, a buy you entered…).
// `used`: rows already taken by another SIP of the same fund.
export const sipRecorded = (d: SipDue, invTxns: any[], used = new Set<any>()) => invTxns.find(t => !used.has(t) && t.asset_id === d.fund.id
  && ['sip', 'purchase'].includes(t.txn_type) && ymOf(t.txn_date) === d.month && near(Number(t.amount) || 0, d.amount)) ?? null

// The bank debit: an investment payment naming the fund (or its AMC), within a week, amount ±10%
export function sipInBank(d: Pick<SipDue, 'fund' | 'date' | 'amount'>, txns: any[], used = new Set<any>()): any | null {
  const w = [...words(d.fund.fund_name), ...words(d.fund.amc ?? d.fund.fund_house ?? '')].slice(0, 3)
  if (!w.length) return null
  return txns.find(t => !used.has(t) && (catOf(t) === 'Investment' || /\bsip\b/i.test(`${t.sub_category ?? ''} ${t.merchant ?? ''}`))
    && Math.abs(daysBetween(d.date, t.txn_date)) <= 7 && near(Number(t.amount) || 0, d.amount)
    && w.some(x => `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase().includes(x))) ?? null
}

// Mark one SIP's month done (recorded or skipped)
export const claimSipMonth = (supabase: any, d: Pick<SipDue, 'fund' | 'sip' | 'month'>) => claimSip(supabase, d.fund, d.sip.id, d.month)

// Record one instalment. `moneyRow` also adds the payment to your
// transactions (when no bank statement has it).
export async function recordSip(supabase: any, userId: string, d: SipDue, opts: { moneyRow: boolean; tag?: { review: boolean } }): Promise<string | null> {
  if (!(await claimSipMonth(supabase, d))) return 'Already recorded'
  const f = d.fund, paidOn = d.evidence?.txn_date ?? d.date, amount = Number(d.evidence?.amount) || d.amount
  const units = d.nav > 0 ? amount / d.nav : 0
  const inv = supabase.from('investment_transactions').insert({
    user_id: userId, asset_type: 'mutual_fund', asset_id: f.id, asset_name: f.fund_name, folio_number: f.folio_number ?? null,
    txn_date: paidOn, txn_type: 'sip', amount, units: units || null, nav: d.nav || null, currency: f.currency ?? 'INR', source: 'sip_auto',
  })
  const [, invRes] = await Promise.all([
    supabase.from('mutual_funds').update({ units: (Number(f.units) || 0) + units, invested_amount: (Number(f.invested_amount) || 0) + amount }).eq('id', f.id),
    opts.tag ? inv.select('id').single() : inv,
  ])
  if (opts.moneyRow) await supabase.from('transactions').insert({
    user_id: userId, txn_date: paidOn, merchant: f.fund_name, description: `Monthly SIP - ${f.fund_name}`, category: 'Investment', sub_category: 'SIP',
    amount, currency: f.currency ?? 'INR', country: f.country ?? 'India', txn_type: 'expense', account_id: d.sip.account_id ?? f.sip_account_id ?? null, source: 'manual', is_verified: true,
    ...(opts.tag ? autoTag({ kind: 'sip', id: f.id, sip_id: d.sip.id, month: d.month, amount, units, nav: d.nav, inv_txn_id: invRes?.data?.id }, opts.tag.review) : {}),
  })
  f.units = (Number(f.units) || 0) + units; f.invested_amount = (Number(f.invested_amount) || 0) + amount
  return null
}

export async function runSips(supabase: any, userId: string, today: string, funds: any[], txns: any[], invTxns: any[], review = false) {
  const pending: SipDue[] = []
  let writes = 0   // anything recorded or ticked off (the page re-reads its data)
  if (!funds.length || !('sip_last_month' in funds[0])) return { ready: funds.length === 0, pending, writes }
  // Each history row or bank row proves one SIP only (two SIPs of one amount on one fund)
  const usedInv = new Set<any>(), usedBank = new Set<any>()
  for (const d of dueSips(funds, today)) {
    const seen = sipRecorded(d, invTxns, usedInv)
    if (seen) { usedInv.add(seen); await claimSipMonth(supabase, d); writes++; continue }
    const bank = sipInBank(d, txns, usedBank)
    if (bank) { usedBank.add(bank); d.evidence = bank; await recordSip(supabase, userId, d, { moneyRow: false }); writes++ }
    else if (d.sip.auto || review) { await recordSip(supabase, userId, d, { moneyRow: true, ...(review ? { tag: { review: !d.sip.auto } } : {}) }); writes++ }
    else pending.push(d)
  }
  return { ready: true, pending, writes }
}
