import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import ReportClient from '@/components/dashboard/ReportClient'
import { WithViews } from '@/components/layout/ViewChips'

export default async function ReportsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  // This year and the two before it: enough for yearly views and "vs last year"
  const fromDate = `${new Date().getFullYear() - 2}-01-01`

  const [txns, { data: events }, { data: all }, { data: live }, { data: loans }] = await Promise.all([
    // All columns: event_id (migration 034) is there only once it's run
    fetchAllRows((a, b) => supabase.from('transactions')
      .select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    // Trips & events, to name them in the report (empty before migration 034)
    supabase.from('spend_events').select('id,name,kind').eq('user_id', uid),
    // Card accounts: a card bill counts only when that month's card purchases
    // weren't imported (lib/money markUnitemisedCardBills)
    // (and accounts give the card / bank / cash split)
    supabase.from('accounts').select('*').eq('user_id', uid),
    // Live balances (what's owed on each card now) and loans on cards (% of limit)
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, uid, rate)),
    activeLoansWithEmi(supabase, uid, q => q.eq('loan_type', 'loan_on_card')),
  ])
  const liveById = new Map((live ?? []).map((a: any) => [a.id, a]))
  const accounts = (all ?? []).map((a: any) => liveById.get(a.id) ?? a)

  return <WithViews of="reports" label="Report type"><ReportClient transactions={txns} accounts={accounts} events={events ?? []} loans={loans ?? []} /></WithViews>
}
