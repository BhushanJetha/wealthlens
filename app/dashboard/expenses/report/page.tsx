import { createClient } from '@/lib/supabase/server'
import ExpensesReportClient from '@/components/dashboard/ExpensesReportClient'

export default async function ExpensesReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .eq('txn_type', 'expense')
    .order('txn_date', { ascending: true })

  return <ExpensesReportClient transactions={data ?? []} />
}
