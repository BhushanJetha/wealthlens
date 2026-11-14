import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import { withAutomation } from '@/lib/automation'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { buildBills, loadBillReads, loadBillHoldings } from '@/lib/bigBills'
import BillsClient from '@/components/dashboard/BillsClient'
import { builderDues, loadBuilderReads } from '@/lib/property'

// Bills: 25 months of transactions (a yearly bill shows up as two payments a year
// apart), and what Free to spend needs to say if each big bill can be covered.
export default async function BillsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 25)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  // Repeating entries due today are recorded alongside
  const [[auto, [txns, accsRes, loansRes, insRes, mfRes, rdRes, plansRes, goalsRes, licRes, [contribRes, skipsRes, billHeld]]], keep, builderReads] = await Promise.all([withAutomation(supabase, uid, today, () => Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    getAedInr().then(async ({ rate }) => ({ rate, res: await activeAccountsWithLedger(supabase, uid, rate) })),
    activeLoansWithEmi(supabase, uid),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('mutual_funds').select('*').eq('user_id', uid),
    supabase.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('income_plans').select('*').eq('user_id', uid),
    supabase.from('goals').select('*').eq('user_id', uid).not('repeat_months', 'is', null).eq('status', 'active'),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    loadBillReads(supabase, uid),
  ])), loadBillHoldings(supabase, uid), loadBuilderReads(supabase, uid)])
  const accounts = accsRes.res.data ?? []
  const answers = (skipsRes.data ?? []).map((s: any) => s.key)
  const bills = buildBills({ goals: goalsRes.data ?? [], contributions: contribRes.data ?? [], insurance: insRes.data ?? [], lic: licRes.data ?? [], accounts, skips: answers, held: billHeld }, today)

  return (
    <BillsClient builder={builderDues({ ...builderReads, loans: loansRes.data ?? [], today, days: 120 })} today={today} fx={accsRes.rate} bills={bills} answers={answers} ready={!isMissingTable(skipsRes.error)} recurringReady={auto.recurringReady}
      transactions={txns} accounts={accounts} loans={loansRes.data ?? []} insurance={insRes.data ?? []} lic={licRes.data ?? []}
      mutualFunds={mfRes.data ?? []} rds={rdRes.data ?? []} plans={plansRes.data ?? []} recurring={auto.recurring}
      holdings={keep.holdings} goalLinks={keep.links} contributions={contribRes.data ?? []} />
  )
}
