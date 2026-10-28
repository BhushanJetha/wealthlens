// Everything that happens "on its day", run when Home, Money, Bills,
// Investments or Loans opens (before the page loads its data, so what's
// recorded shows straight away):
//   • repeating entries (lib/recurring, migration 027)
//   • loan EMIs (lib/loanAuto, migration 028)
//   • SIP instalments (lib/sipAuto, migration 028)
//   • moves between your own accounts, matched from both statements (lib/ownTransfers)
// Each is recorded when there's proof (it's in your statement) or you've
// asked for it to happen by itself; everything else comes back to confirm.
import { fetchAllRows } from './supabase/fetchAll'
import { addDaysTo } from './insights'
import { runRecurring, type Occurrence, type RecurringTxn } from './recurring'
import { runEmis, type EmiDue } from './loanAuto'
import { runSips, type SipDue } from './sipAuto'
import { matchOwnTransfers } from './ownTransfers'

export interface Automation {
  recurring: RecurringTxn[]; recurringReady: boolean
  pending: { recurring: Occurrence[]; emis: EmiDue[]; sips: SipDue[] }
  count: number
}

export async function runAutomation(supabase: any, userId: string, today: string): Promise<Automation> {
  const since = addDaysTo(today, -100)
  const [txns, loansRes, ltRes, fundsRes, itRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*').eq('user_id', userId).gte('txn_date', since)
      .order('txn_date', { ascending: false }).order('id').range(a, b), 5),
    supabase.from('home_loans').select('*').eq('user_id', userId).eq('is_active', true),
    supabase.from('loan_transactions').select('loan_id,kind,txn_date,amount,principal,interest').eq('user_id', userId),
    supabase.from('mutual_funds').select('*').eq('user_id', userId).eq('has_sip', true),
    supabase.from('investment_transactions').select('asset_id,txn_type,txn_date,amount').eq('user_id', userId).eq('asset_type', 'mutual_fund').gte('txn_date', since),
  ])
  await matchOwnTransfers(supabase, txns)
  const rec = await runRecurring(supabase, userId, today, txns)
  const all = [...rec.inserted, ...txns]
  const [emis, sips] = await Promise.all([
    runEmis(supabase, userId, today, loansRes.data ?? [], all, ltRes.data ?? []),
    runSips(supabase, userId, today, fundsRes.data ?? [], all, itRes.data ?? []),
  ])
  const pending = { recurring: rec.pending, emis: emis.pending, sips: sips.pending }
  return { recurring: rec.list, recurringReady: rec.ready, pending, count: pending.recurring.length + pending.emis.length + pending.sips.length }
}
