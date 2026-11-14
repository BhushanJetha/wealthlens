import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import { withAutomation } from '@/lib/automation'
import MoneyOverviewClient from '@/components/dashboard/MoneyOverviewClient'
import { buildBills, loadBillReads } from '@/lib/bigBills'

// Money overview: two years of entries for the period chips (as Home), what
// needs you, balances, categories and friends.
export default async function MoneyPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 25)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  // Repeating entries, EMIs and SIPs whose day has come are recorded
  // alongside these reads; the rest wait here
  const [auto, [txns, accsRes, loansRes, insRes, mfRes, fdRes, budgetsRes, rdRes, plansRes, goalsRes, licRes, [contribRes, skipsRes, billHeld], catsRes, friendsRes, splitsRes, friendTxnsRes]] = await withAutomation(supabase, uid, today, () => Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, uid, rate)),
    activeLoansWithEmi(supabase, uid),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('mutual_funds').select('*').eq('user_id', uid),
    supabase.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    supabase.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('income_plans').select('*').eq('user_id', uid),
    supabase.from('goals').select('*').eq('user_id', uid).not('repeat_months', 'is', null).eq('status', 'active'),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    loadBillReads(supabase, uid),
    supabase.from('categories').select('*').eq('user_id', uid),
    supabase.from('friends').select('id,name').eq('user_id', uid),
    supabase.from('txn_splits').select('id,friend_id,amount,transaction_id,transactions(id,txn_date,merchant,category,amount,currency)').eq('user_id', uid),
    supabase.from('transactions').select('id,txn_date,merchant,category,amount,currency,txn_type,friend_id,paid_by_friend_id').eq('user_id', uid).or('paid_by_friend_id.not.is.null,friend_id.not.is.null'),
  ]))
  const billSkips = (skipsRes.data ?? []).map((s: any) => s.key)
  const bills = buildBills({ goals: goalsRes.data ?? [], contributions: contribRes.data ?? [], insurance: insRes.data ?? [], lic: licRes.data ?? [], accounts: accsRes.data ?? [], skips: billSkips, held: billHeld }, today)

  return (
    <MoneyOverviewClient
      today={today}
      transactions={txns}
      pending={auto.pending}
      recurring={auto.recurring}
      accounts={accsRes.data ?? []}
      loans={loansRes.data ?? []}
      insurance={insRes.data ?? []}
      mutualFunds={mfRes.data ?? []}
      fixedDeposits={fdRes.data ?? []}
      budgets={budgetsRes.data ?? []}
      rds={rdRes.data ?? []}
      plans={plansRes.data ?? []}
      lic={licRes.data ?? []}
      bills={bills}
      billSkips={billSkips}
      categories={catsRes.data ?? []}
      friends={friendsRes.data ?? []}
      splits={splitsRes.data ?? []}
      friendTxns={friendTxnsRes.data ?? []}
    />
  )
}
