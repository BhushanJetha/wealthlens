import { createClient } from '@/lib/supabase/server'
import IncomeReportClient from '@/components/dashboard/IncomeReportClient'

export default async function IncomeReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user!.id)
    .eq('txn_type', 'income')
    .order('txn_date', { ascending: true })

  return <IncomeReportClient transactions={data ?? []} />
}
