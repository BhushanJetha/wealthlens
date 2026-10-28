import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import { withAutomation } from '@/lib/automation'
import MoneyOverviewClient from '@/components/dashboard/MoneyOverviewClient'

// Money overview: live balances, what's due, safe to spend, what needs you.
export default async function MoneyPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  // Repeating entries, EMIs and SIPs whose day has come are recorded
  // alongside these reads; the rest wait here
  const [auto, [txns, accsRes, loansRes, insRes, mfRes, fdRes, budgetsRes]] = await withAutomation(supabase, uid, today, () => Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, uid, rate)),
    activeLoansWithEmi(supabase, uid),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('mutual_funds').select('*').eq('user_id', uid),
    supabase.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
  ]))

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
    />
  )
}
