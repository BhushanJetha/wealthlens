// SIP tracking (migration 028): on a fund's SIP day the instalment is
// recorded — units at the latest NAV, the fund's units and invested amount
// updated, a dated record for the investment charts — straight away when your
// bank statement shows the debit (or you've chosen "record it for me"), else
// after a one-tap confirm. A month is never recorded twice (sip_last_month).
import { ymOf, addMonths, daysBetween } from './insights'
import { dateIn } from './recurring'
import { catOf } from './money'

export interface SipDue { fund: any; month: string; date: string; amount: number; nav: number; evidence?: any }

const words = (name: string) => String(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4).slice(0, 2)
export const navOf = (f: any) => Number(f.current_nav) || Number(f.avg_nav) || 0

export function dueSips(funds: any[], today: string): SipDue[] {
  const now = ymOf(today), out: SipDue[] = []
  for (const f of funds) {
    const day = Number(f.sip_date) || 0, amt = Number(f.sip_amount) || 0
    if (!f.has_sip || !day || amt <= 0 || !('sip_last_month' in f)) continue
    const months = f.sip_last_month ? [addMonths(now, -1), now] : [now]
    for (const m of months) {
      if (f.sip_last_month && m <= f.sip_last_month) continue
      const date = dateIn(m, day)
      if (date <= today) out.push({ fund: f, month: m, date, amount: amt, nav: navOf(f) })
    }
  }
  return out
}

// Already in the fund's history this month (CAS import, a buy you entered…)
export const sipRecorded = (d: SipDue, invTxns: any[]) => invTxns.some(t => t.asset_id === d.fund.id
  && ['sip', 'purchase'].includes(t.txn_type) && ymOf(t.txn_date) === d.month
  && Math.abs((Number(t.amount) || 0) - d.amount) <= d.amount * 0.1)

// The bank debit: an investment payment naming the fund (or its AMC), within a week, amount ±10%
export function sipInBank(d: SipDue, txns: any[]): any | null {
  const w = [...words(d.fund.fund_name), ...words(d.fund.amc ?? d.fund.fund_house ?? '')].slice(0, 3)
  if (!w.length) return null
  return txns.find(t => (catOf(t) === 'Investment' || /\bsip\b/i.test(`${t.sub_category ?? ''} ${t.merchant ?? ''}`))
    && Math.abs(daysBetween(d.date, t.txn_date)) <= 7
    && Math.abs((Number(t.amount) || 0) - d.amount) <= d.amount * 0.1
    && w.some(x => `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase().includes(x))) ?? null
}

export async function claimSipMonth(supabase: any, fund: any, month: string): Promise<boolean> {
  let q = supabase.from('mutual_funds').update({ sip_last_month: month }).eq('id', fund.id)
  q = fund.sip_last_month ? q.eq('sip_last_month', fund.sip_last_month) : q.is('sip_last_month', null)
  const { data, error } = await q.select('id')
  if (!error && data?.length) { fund.sip_last_month = month; return true }
  return false
}

// Record one instalment. `moneyRow` also adds the payment to your
// transactions (when no bank statement has it).
export async function recordSip(supabase: any, userId: string, d: SipDue, opts: { moneyRow: boolean }): Promise<string | null> {
  if (!(await claimSipMonth(supabase, d.fund, d.month))) return 'Already recorded'
  const f = d.fund, paidOn = d.evidence?.txn_date ?? d.date, amount = Number(d.evidence?.amount) || d.amount
  const units = d.nav > 0 ? amount / d.nav : 0
  await Promise.all([
    supabase.from('mutual_funds').update({ units: (Number(f.units) || 0) + units, invested_amount: (Number(f.invested_amount) || 0) + amount }).eq('id', f.id),
    supabase.from('investment_transactions').insert({
      user_id: userId, asset_type: 'mutual_fund', asset_id: f.id, asset_name: f.fund_name, folio_number: f.folio_number ?? null,
      txn_date: paidOn, txn_type: 'sip', amount, units: units || null, nav: d.nav || null, currency: f.currency ?? 'INR', source: 'sip_auto',
    }),
    opts.moneyRow ? supabase.from('transactions').insert({
      user_id: userId, txn_date: paidOn, merchant: f.fund_name, description: `Monthly SIP - ${f.fund_name}`, category: 'Investment', sub_category: 'SIP',
      amount, currency: f.currency ?? 'INR', country: f.country ?? 'India', txn_type: 'expense', account_id: f.sip_account_id ?? null, source: 'manual', is_verified: true,
    }) : Promise.resolve(),
  ])
  f.units = (Number(f.units) || 0) + units; f.invested_amount = (Number(f.invested_amount) || 0) + amount
  return null
}

export async function runSips(supabase: any, userId: string, today: string, funds: any[], txns: any[], invTxns: any[]) {
  const pending: SipDue[] = []
  let writes = 0   // anything recorded or ticked off (the page re-reads its data)
  if (!funds.length || !('sip_last_month' in funds[0])) return { ready: funds.length === 0, pending, writes }
  for (const d of dueSips(funds, today)) {
    if (sipRecorded(d, invTxns)) { await claimSipMonth(supabase, d.fund, d.month); writes++; continue }
    const bank = sipInBank(d, txns)
    if (bank) { d.evidence = bank; await recordSip(supabase, userId, d, { moneyRow: false }); writes++ }
    else if (d.fund.sip_auto) { await recordSip(supabase, userId, d, { moneyRow: true }); writes++ }
    else pending.push(d)
  }
  return { ready: true, pending, writes }
}
