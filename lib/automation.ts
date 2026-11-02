// Everything that happens "on its day", run when Home, Money, Bills,
// Investments or Loans opens — alongside the page's own reads; when it
// records anything (`changed`) the page reads again so it shows straight away:
//   • repeating entries (lib/recurring, migration 027)
//   • loan EMIs (lib/loanAuto, migration 028)
//   • SIP instalments (lib/sipAuto, migration 028), RD instalments (lib/rdAuto, migration 037)
//   • moves between your own accounts, matched from both statements (lib/ownTransfers)
// With migration 037 everything due enters your transactions on its day, so a
// forgotten one still counts: marked pending your approval unless you've set it
// to Auto. A statement's real row replaces the entry (lib/autoEntries). Before
// that migration, anything without proof comes back to confirm.

import { fetchAllRows } from './supabase/fetchAll'
import { addDaysTo } from './insights'
import { runRecurring, type Occurrence, type RecurringTxn } from './recurring'
import { runEmis, type EmiDue } from './loanAuto'
import { runSips, type SipDue } from './sipAuto'
import { matchOwnTransfers } from './ownTransfers'
import { runRds } from './rdAuto'
import { reconcileAuto, isAutoPending } from './autoEntries'
import { aliasesOf } from './regular'
import { getAedInr } from './fx'

export interface Automation {
  recurring: RecurringTxn[]; recurringReady: boolean
  pending: { recurring: Occurrence[]; emis: EmiDue[]; sips: SipDue[]; drafts: any[] }
  count: number
  changed: boolean   // something was recorded or matched: the page's data is stale
}

// Run automation and the page's reads together (one round trip on a normal
// day instead of three or four in a row); read again only if it recorded something.
export async function withAutomation<T>(supabase: any, userId: string, today: string, load: () => Promise<T>): Promise<[Automation, T]> {
  // Viewing a family member: read only. Nothing is recorded, and only they approve their entries.
  if (supabase.__viewAs) {
    const [rec, data] = await Promise.all([supabase.from('recurring_txns').select('*').eq('user_id', userId).order('created_at'), load()])
    return [{ recurring: rec.data ?? [], recurringReady: !rec.error, pending: { recurring: [], emis: [], sips: [], drafts: [] }, count: 0, changed: false }, data]
  }
  const [auto, data] = await Promise.all([runAutomation(supabase, userId, today), load()])
  return [auto, auto.changed ? await load() : data]
}

// A transfer to India with no rupees yet gets its estimate now and keeps it, so a
// balance doesn't move with the exchange rate. Needs migration 043: without it
// nothing is written, and the estimate stays at the current rate.
async function keepEstimates(supabase: any, userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.from('transactions').select('id,amount').eq('user_id', userId).eq('currency', 'AED').is('counter_amount', null)
      .or('sub_category.eq.International,category.in.("International Transfer","Transfer to India","Remittance")')
    if (error || !data?.length) return 0
    const { rate } = await getAedInr()
    if (!(rate > 1)) return 0
    let n = 0
    for (const t of data) {
      const { error: e } = await supabase.from('transactions').update({ counter_amount: Math.round((Number(t.amount) || 0) * rate), counter_estimated: true }).eq('id', t.id)
      if (e) break
      n++
    }
    return n
  } catch { return 0 }
}

export async function runAutomation(supabase: any, userId: string, today: string): Promise<Automation> {
  const since = addDaysTo(today, -100)
  const [read, loansRes, ltRes, fundsRes, itRes, rulesRes, rdsRes, answersRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*').eq('user_id', userId).gte('txn_date', since)
      .order('txn_date', { ascending: false }).order('id').range(a, b), 5),
    supabase.from('home_loans').select('*').eq('user_id', userId).eq('is_active', true),
    supabase.from('loan_transactions').select('loan_id,kind,txn_date,amount,principal,interest').eq('user_id', userId),
    supabase.from('mutual_funds').select('*').eq('user_id', userId).eq('has_sip', true),
    supabase.from('investment_transactions').select('asset_id,txn_type,txn_date,amount').eq('user_id', userId).eq('asset_type', 'mutual_fund').gte('txn_date', since),
    supabase.from('recurring_txns').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('recurring_deposits').select('*').eq('user_id', userId).eq('is_active', true),
    supabase.from('big_bill_skips').select('key').eq('user_id', userId),
  ])
  const [matched, kept] = await Promise.all([matchOwnTransfers(supabase, read), keepEstimates(supabase, userId)])
  // Migration 037 is in when the rows carry its column
  const review = read.some(t => 'auto_status' in t)
  const replaced = review ? await reconcileAuto(supabase, read, { loans: loansRes.data ?? [], funds: fundsRes.data ?? [], rds: rdsRes.data ?? [], aliases: aliasesOf((answersRes.data ?? []).map((a: any) => a.key)) }) : new Set<string>()
  const txns = replaced.size ? read.filter(t => !replaced.has(t.id)) : read
  const rec = await runRecurring(supabase, userId, today, txns, rulesRes, review)
  // Proof of a payment is a real row, never another entry the app made
  const all = [...rec.inserted, ...txns].filter(t => !t.auto_ref)
  const [emis, sips, rds] = await Promise.all([
    runEmis(supabase, userId, today, loansRes.data ?? [], all, ltRes.data ?? [], review),
    runSips(supabase, userId, today, fundsRes.data ?? [], all, itRes.data ?? [], review),
    review ? runRds(supabase, userId, today, rdsRes.data ?? [], all) : Promise.resolve({ writes: 0 }),
  ])
  const changed = kept > 0 || matched > 0 || replaced.size > 0 || rec.inserted.length > 0 || emis.writes > 0 || sips.writes > 0 || rds.writes > 0
  // Entries waiting for your approval
  const drafts = !review ? [] : changed
    ? (await supabase.from('transactions').select('*').eq('user_id', userId).eq('auto_status', 'pending').order('txn_date', { ascending: false })).data ?? []
    : txns.filter(isAutoPending)
  const pending = { recurring: rec.pending, emis: emis.pending, sips: sips.pending, drafts }
  return { recurring: rec.list, recurringReady: rec.ready, pending, count: pending.recurring.length + pending.emis.length + pending.sips.length + drafts.length, changed }
}
