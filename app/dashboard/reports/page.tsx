import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import ReportClient from '@/components/dashboard/ReportClient'

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // This year and the two before it: enough for yearly views and "vs last year"
  const fromDate = `${new Date().getFullYear() - 2}-01-01`

  // All columns: event_id (migration 034) is there only once it's run
  const txns = await fetchAllRows((a, b) => supabase.from('transactions')
    .select('*')
    .eq('user_id', uid).gte('txn_date', fromDate)
    .order('txn_date', { ascending: false }).order('id').range(a, b))
  // Trips & events, to name them in the report (empty before migration 034)
  const { data: events } = await supabase.from('spend_events').select('id,name,kind').eq('user_id', uid)

  // Card accounts: a card bill counts only when that month's card purchases
  // weren't imported (lib/money markUnitemisedCardBills)
  // (and accounts give the card / bank / cash split)
  const { data: accounts } = await supabase.from('accounts').select('id,name,account_type,currency').eq('user_id', uid)

  return <ReportClient transactions={txns} accounts={accounts ?? []} events={events ?? []} />
}
