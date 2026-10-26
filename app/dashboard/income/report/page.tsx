import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import IncomeReportClient from '@/components/dashboard/IncomeReportClient'

export default async function IncomeReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [incomeRes, transfersRes] = await Promise.all([
    fetchAll((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).eq('txn_type', 'transfer')
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
  ])

  // Transfers come along so UAE → India remittances can be paired into
  // "Received from UAE" India income (lib/money) — same as the Income tab
  const transactions = [...(incomeRes.data ?? []), ...(transfersRes.data ?? [])]

  return <IncomeReportClient transactions={transactions} />
}
