import { createClient } from '@/lib/supabase/server'
import IncomeReportClient from '@/components/dashboard/IncomeReportClient'

export default async function IncomeReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [incomeRes, transfersRes] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }),
    supabase.from('transactions').select('*')
      .eq('user_id', uid).eq('txn_type', 'transfer')
      .order('txn_date', { ascending: true }).limit(2000),
  ])

  // Transfers come along so UAE → India remittances can be paired into
  // "Received from UAE" India income (lib/money) — same as the Income tab
  const transactions = [...(incomeRes.data ?? []), ...(transfersRes.data ?? [])]

  return <IncomeReportClient transactions={transactions} />
}
